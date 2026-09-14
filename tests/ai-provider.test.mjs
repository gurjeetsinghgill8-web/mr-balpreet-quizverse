/**
 * QUIZVERSE — LAYER 1 tests: provider abstraction + generation pipeline
 * Run:  node --test tests
 *
 * Everything runs against injectable fetch implementations: no network, no keys,
 * fully deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chat,
  testProvider,
  parseJsonLoose,
  extractQuestions,
  normaliseQuestion,
  generateQuizWithAI,
  AIGenerationError,
  PROVIDERS,
  friendlyMessage,
} from '../packages/ai-service/provider.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildMaterialSection,
  buildRepairPrompt,
  QUIZ_JSON_CONTRACT,
} from '../packages/ai-service/prompts.js';
import { mockChat } from '../packages/ai-service/mock-provider.js';
import { extractFacts, factsToQuestions } from '../packages/ai-service/material-extract.js';

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Fifteen genuinely different stems, so the duplicate detector has nothing to catch. */
const QUESTION_TEXTS = [
  'Which planet is known as the Red Planet?',
  'How many planets are there in our solar system?',
  'Which planet is closest to the Sun?',
  'What causes day and night on Earth?',
  'Which planet has the most prominent rings?',
  'A light year is a unit of what?',
  'Which planet rotates almost on its side?',
  'What is at the centre of our solar system?',
  'Which is the largest planet in our solar system?',
  'Which planet is called the morning star?',
  'Which layer of the Sun produces energy?',
  'How long does Earth take to spin once on its axis?',
  'Which planet is the farthest from the Sun?',
  'Which planet is often called the twin of Earth?',
  'What is the natural satellite of Earth called?',
];

const okQuestion = (id, stage = 1, index = Number(String(id).replace(/\D/g, '')) || 1) => ({
  question_id: id,
  stage,
  difficulty: ['very_easy', 'easy', 'medium', 'hard', 'highest'][stage - 1],
  cognitive_level: 'recall',
  concept_tag: 'planet identity',
  question: QUESTION_TEXTS[(index - 1) % QUESTION_TEXTS.length],
  options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' },
  correct_option: 'B',
  explanation: 'Mars looks red because of iron minerals in its soil.',
  simple_explanation: 'Mars has red dust.',
  clue: 'This planet looks reddish from Earth.',
  source_reference: null,
});

const bank = (total = 15) => Array.from({ length: total }, (_, i) => okQuestion(`q${i + 1}`, (i % 5) + 1, i + 1));

/** OpenAI-shaped fetch that pops one scripted payload per call. */
function scriptedFetch(payloads, { status = 200, model = 'test-model' } = {}) {
  const queue = [...payloads];
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    if (!queue.length) throw new Error('scripted fetch exhausted');
    const payload = queue.shift();
    if (payload instanceof Error) throw payload;
    const isHttpError = payload === '__HTTP_ERROR__';
    const raw = payload && typeof payload === 'object' && payload.__raw ? payload.__raw : null;
    return {
      ok: !isHttpError && status >= 200 && status < 300,
      status: isHttpError ? 500 : status,
      json: async () => {
        if (isHttpError) return { error: { message: 'boom' } };
        if (raw) return raw;
        return {
          choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }],
          model,
          usage: { total_tokens: 42 },
        };
      },
      text: async () => (isHttpError ? 'server exploded' : ''),
    };
  };
  impl.calls = calls;
  return impl;
}

const baseInput = {
  classLevel: 5,
  topic: 'Solar System',
  subject: 'Science',
  language: 'en',
  count: 15,
  timer: 30,
};

/* ------------------------------------------------------------------ */
/* 1. prompt construction                                              */
/* ------------------------------------------------------------------ */

test('the system prompt carries every non-negotiable rule', () => {
  const system = buildSystemPrompt();
  ['Exactly four options', 'Exactly one is correct', 'Never invent facts', 'Devanagari',
    'Never generate sexual', 'Encouraging, kind, energetic', 'ONLY valid JSON'].forEach((phrase) => {
    assert.ok(system.includes(phrase), `system prompt is missing: ${phrase}`);
  });
});

test('the user prompt carries class limits, stage ladder and the JSON contract', () => {
  const prompt = buildUserPrompt(baseInput);
  assert.ok(prompt.includes('class_level: 5'));
  assert.ok(prompt.includes('class_band: B'));
  assert.ok(prompt.includes('vocabulary_ceiling: 20 words per question stem'));
  assert.ok(prompt.includes('stage 5 (Final Challenge) difficulty=highest'));
  assert.ok(prompt.includes('question_count: 15'));
  assert.ok(prompt.includes('over_generate: 24'), 'over-generation powers CHANGE QUESTION');
  assert.ok(prompt.includes(QUIZ_JSON_CONTRACT.slice(0, 40)));
  assert.ok(!/source_mode: material/.test(prompt));
});

test('Class 1 prompts use the youngest band limits and Hindi prompts demand Devanagari', () => {
  const young = buildUserPrompt({ ...baseInput, classLevel: 1, topic: 'Animals' });
  assert.ok(young.includes('class_band: A'));
  assert.ok(young.includes('vocabulary_ceiling: 12 words per question stem, 4 words per option'));
  assert.ok(young.includes('very short sentences'));

  const hindi = buildUserPrompt({ ...baseInput, classLevel: 7, language: 'hi' });
  assert.ok(hindi.includes('hi (Devanagari)'));
  assert.ok(hindi.includes('देवनागरी'));
});

test('material mode adds source-tracking instructions and forbids outside facts', () => {
  const section = buildMaterialSection('Photosynthesis is how plants make food.', false);
  assert.ok(section.includes('source_mode: material'));
  assert.ok(section.includes('allow_additional_knowledge: false'));
  assert.ok(section.includes('Do not add outside facts'));
  assert.ok(section.includes('DO NOT create that question'));

  const allowed = buildMaterialSection('text', true);
  assert.ok(allowed.includes('additional_knowledge'));

  const prompt = buildUserPrompt({ ...baseInput, sourceMode: 'material', materialText: 'Water boils at 100 degrees Celsius.' });
  assert.ok(prompt.includes('Water boils at 100 degrees Celsius.'));
  assert.ok(prompt.includes('source_reference'));
});

test('the repair prompt names the exact failures and keeps the slot identity', () => {
  const question = okQuestion('q7', 3);
  const prompt = buildRepairPrompt(question, [
    { code: 'DUPLICATE_OPTION', detail: 'two options have the same text' },
    { code: 'CLASS_MISMATCH', detail: 'option B has 14 words, class 7 allows 10' },
  ], { classLevel: 7, language: 'hi' });
  assert.ok(prompt.includes('DUPLICATE_OPTION'));
  assert.ok(prompt.includes('class_level: 7'));
  assert.ok(prompt.includes('Keep the same question_id'));
  assert.ok(prompt.includes('"q7"'));
});

/* ------------------------------------------------------------------ */
/* 2. tolerant parsing                                                 */
/* ------------------------------------------------------------------ */

test('parseJsonLoose survives fences, prose, trailing commas and smart quotes', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here is your quiz:\n{"a":1}\nEnjoy!'), { a: 1 });
  assert.deepEqual(parseJsonLoose('{"a":1,}'), { a: 1 });
  assert.deepEqual(parseJsonLoose('{\u201Ca\u201D:1}'), { a: 1 }, 'smart quotes used as JSON syntax are repaired');
  assert.equal(parseJsonLoose('not json at all'), null);
  assert.equal(parseJsonLoose(''), null);
  assert.equal(parseJsonLoose(null), null);
});

test('extractQuestions accepts every reasonable envelope', () => {
  assert.equal(extractQuestions({ questions: [okQuestion('a')] }).length, 1);
  assert.equal(extractQuestions({ data: { questions: [okQuestion('a')] } }).length, 0);
  assert.equal(extractQuestions({ quiz: { questions: [okQuestion('a')] } }).length, 1);
  assert.equal(extractQuestions([okQuestion('a'), okQuestion('b')]).length, 2);
  assert.equal(extractQuestions({ question: 'x', options: { A: '1' } }).length, 1);
  assert.equal(extractQuestions(null).length, 0);
});

test('normaliseQuestion repairs the shapes models actually return', () => {
  const letters = normaliseQuestion({ question_id: 'a', question: 'Q?', options: { a: '1', b: '2', c: '3', d: '4' }, correct_option: 'b', explanation: 'because' });
  assert.equal(letters.correct_option, 'B');
  assert.equal(letters.options.A, '1');

  const byText = normaliseQuestion({ question: 'Q?', options: ['one', 'two', 'three', 'four'], answer: 'three' });
  assert.equal(byText.correct_option, 'C');

  const byIndex = normaliseQuestion({ question: 'Q?', choices: { A: 'x', B: 'y', C: 'z', D: 'w' }, correct: 1 });
  assert.equal(byIndex.correct_option, 'A');

  const messy = normaliseQuestion({ id: 'x9', q: 'Q?', options: { A: 'a' }, correct_option: 'Z', hint: 'look here' });
  assert.equal(messy.question_id, 'x9');
  assert.equal(messy.clue, 'look here');
  assert.equal(messy.options.D, '');
});

/* ------------------------------------------------------------------ */
/* 3. transport adapters                                               */
/* ------------------------------------------------------------------ */

test('the openai adapter sends JSON mode and reads the completion', async () => {
  const fetchImpl = scriptedFetch([{ questions: [okQuestion('a')] }]);
  const res = await chat({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }], fetchImpl,
  });
  assert.equal(res.model, 'test-model');
  assert.match(res.text, /questions/);
  const body = fetchImpl.calls[0].body;
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(fetchImpl.calls[0].url, 'https://api.openai.com/v1/chat/completions');
});

test('the anthropic adapter moves the system prompt out of messages', async () => {
  const fetchImpl = scriptedFetch([{ __raw: { content: [{ type: 'text', text: '{"questions":[]}' }], model: 'claude-test' } }]);
  const res = await chat({
    provider: 'anthropic',
    apiKey: 'sk-ant',
    messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }],
    fetchImpl,
  });
  assert.equal(res.text, '{"questions":[]}');
  assert.equal(res.model, 'claude-test');
  const body = fetchImpl.calls[0].body;
  assert.equal(body.system, 'SYS');
  assert.equal(body.messages.length, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://api.anthropic.com/v1/messages');
});

test('the gemini adapter wraps messages and reads its own response shape', async () => {
  const fetchImpl = scriptedFetch([{
    __raw: { candidates: [{ content: { parts: [{ text: '{"questions":[]}' }] } }], usageMetadata: { totalTokenCount: 7 } },
  }]);
  const res = await chat({
    provider: 'gemini',
    apiKey: 'AIza-test',
    messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }],
    fetchImpl,
  });
  assert.equal(res.text, '{"questions":[]}');
  assert.ok(fetchImpl.calls[0].url.includes('/models/gemini-1.5-flash:generateContent?key=AIza-test'));
  const body = fetchImpl.calls[0].body;
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
  assert.equal(body.contents.length, 1);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('the ollama adapter needs no key and honours a custom base url', async () => {
  const fetchImpl = scriptedFetch([{ questions: [] }]);
  await chat({
    provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', messages: [{ role: 'user', content: 'hi' }], fetchImpl,
  });
  assert.equal(fetchImpl.calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(fetchImpl.calls[0].body.model, PROVIDERS.ollama.defaultModel);
  assert.equal(fetchImpl.calls[0].body.response_format.type, 'json_object');
});

test('missing key, unknown provider and disabled providers fail with typed errors', async () => {
  await assert.rejects(
    () => chat({ provider: 'openai', messages: [], fetchImpl: scriptedFetch([{}]) }),
    (err) => err instanceof AIGenerationError && err.code === 'no_key',
  );
  await assert.rejects(
    () => chat({ provider: 'nope', messages: [], fetchImpl: scriptedFetch([{}]) }),
    (err) => err.code === 'no_provider',
  );
  await assert.rejects(
    () => chat({ provider: 'offline', messages: [], fetchImpl: scriptedFetch([{}]) }),
    (err) => err.code === 'no_provider',
  );
  assert.ok(friendlyMessage('no_key').includes('Settings'));
});

test('http failures, timeouts and unreadable bodies become friendly typed errors', async () => {
  await assert.rejects(
    () => chat({ provider: 'openai', apiKey: 'k', messages: [], fetchImpl: scriptedFetch(['__HTTP_ERROR__']) }),
    (err) => err.code === 'http_error' && !/500|stack/i.test(err.message),
  );
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  await assert.rejects(
    () => chat({ provider: 'openai', apiKey: 'k', messages: [], fetchImpl: scriptedFetch([abort]) }),
    (err) => err.code === 'timeout',
  );
  await assert.rejects(
    () => chat({ provider: 'openai', apiKey: 'k', messages: [], fetchImpl: scriptedFetch([{ __raw: { choices: [] } }]) }),
    (err) => err.code === 'bad_json',
  );
});

test('the proxy transport posts to our own endpoint and validates the envelope', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, '/api/ai/chat');
    const body = JSON.parse(init.body);
    assert.equal(body.provider, 'mock');
    return { ok: true, status: 200, json: async () => ({ ok: true, text: '{"questions":[]}', model: 'mock-provider' }) };
  };
  const res = await chat({ provider: 'mock', endpoint: '/api/ai/chat', messages: [{ role: 'user', content: 'x' }], fetchImpl });
  assert.equal(res.model, 'mock-provider');

  const failing = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: { code: 'no_key', message: friendlyMessage('no_key') } }) });
  await assert.rejects(
    () => chat({ provider: 'openai', endpoint: '/api/ai/chat', messages: [], fetchImpl: failing }),
    (err) => err.code === 'no_key',
  );
});

/* ------------------------------------------------------------------ */
/* 4. the generation pipeline                                          */
/* ------------------------------------------------------------------ */

test('a clean AI answer becomes a playable, fully distributed quiz package', async () => {
  const fetchImpl = scriptedFetch([{ title: 'Class 5 – Solar System Challenge', questions: bank(15) }]);
  const progress = [];
  const res = await generateQuizWithAI({
    config: { provider: 'openai', apiKey: 'k' },
    input: baseInput,
    fetchImpl,
    onProgress: (p) => progress.push(p),
  });

  assert.equal(res.ok, true);
  assert.equal(res.package.class_level, 5);
  assert.deepEqual(res.package.stages.map((s) => s.question_ids.length), [3, 3, 3, 3, 3]);
  assert.equal(res.meta.calls, 1);
  assert.equal(res.meta.repairs, 0);
  assert.equal(res.meta.dropped, 0);
  assert.ok(res.meta.promptChars > 1000, 'the prompt really was built');
  assert.ok(progress.some((p) => p.stage === 'validating'));
  assert.ok(progress.some((p) => p.stage === 'building'));

  const { createGame } = await import('../packages/game-engine/engine.js');
  const game = createGame(res.package);
  game.start();
  assert.equal(game.getView().status, 'QUESTION_READY');
});

test('a broken question is caught by the validator and repaired in one extra call', async () => {
  const broken = bank(15);
  broken[1] = { ...broken[1], options: { A: 'Mars', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, correct_option: 'A' };
  const fixed = { ...broken[1], options: { A: 'Mars', B: 'Venus', C: 'Jupiter', D: 'Saturn' }, correct_option: 'A' };

  const fetchImpl = scriptedFetch([
    { questions: broken },
    { questions: [fixed] },
  ]);

  const res = await generateQuizWithAI({
    config: { provider: 'openai', apiKey: 'k' },
    input: baseInput,
    fetchImpl,
  });

  assert.equal(res.meta.calls, 2, 'one generation + one repair');
  assert.equal(res.meta.repairs, 1);
  assert.equal(res.meta.dropped, 0);
  assert.equal(res.validation.stats.failed, 0);
  const repaired = res.package.questions.find((q) => q.question_id === broken[1].question_id);
  assert.equal(repaired.options.B, 'Venus');
  assert.equal(fetchImpl.calls[1].body.messages.at(-1).content.includes('DUPLICATE_OPTION'), true,
    'the repair prompt names the exact failure code');
});

test('a question that never repairs is dropped, and the quiz still ships', async () => {
  const broken = bank(15);
  broken[3] = { ...broken[3], options: { A: 'Mars', B: 'Mars', C: 'Mars', D: 'Mars' }, correct_option: 'A' };
  const fetchImpl = scriptedFetch([
    { questions: broken },
    { questions: [broken[3]] }, // the "repair" makes it worse
    { questions: [broken[3]] },
    { questions: [broken[3]] },
  ]);

  const res = await generateQuizWithAI({
    config: { provider: 'openai', apiKey: 'k' },
    input: baseInput,
    fetchImpl,
    maxRepairRounds: 3,
  });

  assert.equal(res.meta.dropped, 1);
  assert.equal(res.validation.stats.passed, 14);
  assert.ok(res.package.generation_meta.note.includes('dropped'));
  res.package.stages.forEach((stage) => assert.ok(stage.question_ids.length >= 1, `stage ${stage.stage} is empty`));
});

test('unreadable JSON and provider HTTP errors surface as typed failures', async () => {
  await assert.rejects(
    () => generateQuizWithAI({ config: { provider: 'openai', apiKey: 'k' }, input: baseInput, fetchImpl: scriptedFetch(['I cannot help with that.']) }),
    (err) => err.code === 'bad_json',
  );
  await assert.rejects(
    () => generateQuizWithAI({ config: { provider: 'openai', apiKey: 'k' }, input: baseInput, fetchImpl: scriptedFetch(['__HTTP_ERROR__']) }),
    (err) => err.code === 'http_error',
  );
  await assert.rejects(
    () => generateQuizWithAI({ config: { provider: 'openai', apiKey: 'k' }, input: baseInput, fetchImpl: scriptedFetch([{ questions: [] }]) }),
    (err) => err.code === 'no_questions',
  );
});

test('the pipeline gives up gracefully instead of looping forever', async () => {
  const junk = Array.from({ length: 15 }, (_, i) => ({ question_id: `j${i}`, question: '', options: {}, correct_option: 'Z' }));
  const fetchImpl = scriptedFetch([
    { questions: junk }, { questions: junk }, { questions: junk },
    { questions: junk }, { questions: junk }, { questions: junk }, { questions: junk },
  ]);
  await assert.rejects(
    () => generateQuizWithAI({ config: { provider: 'openai', apiKey: 'k' }, input: baseInput, fetchImpl, maxCalls: 6 }),
    (err) => err.code === 'too_many_invalid',
  );
  assert.ok(fetchImpl.calls.length <= 6, `made ${fetchImpl.calls.length} calls`);
});

/* ------------------------------------------------------------------ */
/* 5. mock provider + full-pipeline integration                        */
/* ------------------------------------------------------------------ */

test('the mock provider answers the real prompt with the real contract', async () => {
  const prompt = buildUserPrompt({ ...baseInput, count: 10 });
  const text = await mockChat({ messages: [{ role: 'user', content: prompt }], mock_seed: bank(10), delay_ms: 0, inject_flaw: false });
  const json = parseJsonLoose(text);
  const questions = extractQuestions(json);
  assert.equal(questions.length >= 5, true);
  assert.equal(json.title.includes('Class 5'), true);
  questions.forEach((q) => {
    assert.equal(Object.keys(q.options).length, 4);
    assert.ok(['A', 'B', 'C', 'D'].includes(q.correct_option));
    assert.ok(q.explanation.length > 10);
    assert.ok(q.clue.length > 5);
  });
});

test('the mock provider refuses to invent a topic it has no seed for', async () => {
  const prompt = buildUserPrompt({ ...baseInput, topic: 'Quantum Chromodynamics' });
  const text = await mockChat({ messages: [{ role: 'user', content: prompt }], delay_ms: 0 });
  assert.deepEqual(extractQuestions(parseJsonLoose(text)), [],
    'topic mode without a seed must return nothing rather than fake content');
});

test('the mock provider injects a flaw so the validator has something to catch', async () => {
  const prompt = buildUserPrompt({ ...baseInput, count: 10 });
  const text = await mockChat({ messages: [{ role: 'user', content: prompt }], mock_seed: bank(10), delay_ms: 0 });
  const questions = extractQuestions(parseJsonLoose(text));
  const duplicated = questions.filter((q) => {
    const values = Object.values(q.options).map((v) => v.toLowerCase());
    return new Set(values).size !== values.length;
  });
  assert.equal(duplicated.length, 1, 'exactly one deliberately broken question');
});

test('the mock provider answers repair prompts with a fixed question', async () => {
  const broken = { ...okQuestion('q2', 2), options: { A: 'Mars', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, correct_option: 'A' };
  const repairPrompt = buildRepairPrompt(broken, [{ code: 'DUPLICATE_OPTION', detail: 'two options have the same text' }], { classLevel: 5, language: 'en' });
  const text = await mockChat({ messages: [{ role: 'user', content: repairPrompt }], delay_ms: 0 });
  const fixed = extractQuestions(parseJsonLoose(text))[0];
  const values = Object.values(fixed.options).map((v) => v.toLowerCase());
  assert.equal(new Set(values).size, 4, 'the repair removed the duplicate option');
  assert.equal(fixed.question_id, 'q2');
});

test('end to end: mock provider -> validation -> repair -> playable package', async () => {
  const proxyFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const text = await mockChat({ ...body, delay_ms: 0 });
    return { ok: true, status: 200, json: async () => ({ ok: true, text, model: 'mock-provider' }) };
  };

  const { createGame } = await import('../packages/game-engine/engine.js');
  const { seedQuestionsForTopic } = await import('../app/offline-generator.js');

  const res = await generateQuizWithAI({
    config: { provider: 'mock', endpoint: '/api/ai/chat', extra: { mock_seed: seedQuestionsForTopic('Solar System', 5), inject_flaw: true } },
    input: baseInput,
    fetchImpl: proxyFetch,
  });

  assert.equal(res.ok, true);
  assert.equal(res.meta.repairs, 1, 'the injected flaw was repaired inside the pipeline');
  assert.equal(res.validation.stats.failed, 0);
  assert.ok(res.package.questions.length >= 15);

  const game = createGame(res.package);
  game.start();
  assert.equal(game.getView().questionsInStage, 3);
  assert.equal(game.getView().stageCount, 5);
});

test('material mode: mock provider builds source-tracked questions from the material', async () => {
  const material = [
    'Photosynthesis is the process by which green plants make food using sunlight.',
    'Chlorophyll is the green pigment in leaves that absorbs sunlight.',
    'Stomata are tiny pores on a leaf that let gases move in and out.',
    'The stem carries water from the roots to the leaves.',
    'Roots are the part of a plant that absorb water from the soil.',
    'A seedling is a young plant that grows from a seed.',
  ].join(' ');

  const prompt = buildUserPrompt({
    ...baseInput,
    classLevel: 6,
    topic: 'Plants',
    count: 10,
    sourceMode: 'material',
    materialText: material,
  });

  const res = await generateQuizWithAI({
    config: { provider: 'mock', endpoint: '/api/ai/chat', extra: { inject_flaw: false } },
    input: { ...baseInput, classLevel: 6, topic: 'Plants', sourceMode: 'material', materialText: material },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      const text = await mockChat({ ...body, delay_ms: 0 });
      return { ok: true, status: 200, json: async () => ({ ok: true, text, model: 'mock-provider' }) };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.package.source_type, 'material');
  res.package.questions.forEach((q) => {
    assert.ok(q.source_reference && q.source_reference.excerpt, `${q.question_id} must cite the material`);
  });
  assert.ok(prompt.includes('source_mode: material'));
});

test('shared material extraction is deterministic and class-aware', () => {
  const facts = extractFacts('Evaporation is the change of water into vapour. Condensation is the change of vapour into water.');
  assert.equal(facts.length, 2);
  const questions = factsToQuestions(facts, { classLevel: 4, language: 'en' });
  assert.equal(questions.length, 2);
  const optionWords = questions.flatMap((q) => Object.values(q.options).map((o) => o.split(/\s+/).length));
  assert.ok(Math.max(...optionWords) <= 7, 'Class 4 options stay inside the band ceiling');
  assert.equal(new Set(questions.map((q) => q.correct_option)).size > 1, true, 'the correct slot rotates');
});

/* ------------------------------------------------------------------ */
/* 6. provider probe used by the settings screen                        */
/* ------------------------------------------------------------------ */

test('testProvider reports success for the mock provider and offline mode', async () => {
  const offline = await testProvider({ config: { provider: 'offline' } });
  assert.equal(offline.ok, true);
  assert.equal(offline.mode, 'offline');

  const mock = await testProvider({
    config: { provider: 'mock', endpoint: '/api/ai/chat' },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, text: await mockChat({ ...body, delay_ms: 0 }), model: 'mock-provider' }) };
    },
  });
  assert.equal(mock.ok, true);
  assert.equal(mock.mode, 'mock');
});

test('testProvider turns transport failures into teacher-friendly text', async () => {
  const res = await testProvider({
    config: { provider: 'openai', apiKey: 'k' },
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({}) }),
  });
  assert.equal(res.ok, false);
  assert.ok(!/401|unauthorized/i.test(res.message), `message leaked technical detail: ${res.message}`);
});

test('every provider in the registry is usable by the pipeline decision', () => {
  const ids = Object.keys(PROVIDERS);
  ['offline', 'mock', 'openai', 'anthropic', 'gemini', 'ollama'].forEach((id) => {
    assert.ok(ids.includes(id), `${id} is missing from the registry`);
  });
  assert.equal(PROVIDERS.offline.kind, 'local');
  assert.equal(PROVIDERS.openai.needsKey, true);
  assert.equal(PROVIDERS.ollama.needsKey, false);
  assert.ok(PROVIDERS.gemini.defaultBase.includes('generativelanguage'));
});
