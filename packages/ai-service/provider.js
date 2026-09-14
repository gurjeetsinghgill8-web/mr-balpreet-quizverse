/**
 * QUIZVERSE — LAYER 1 : AI_SERVICE  (provider-agnostic)
 * ---------------------------------------------------------------------------
 * One interface, many providers (PRODUCT_DEVELOPMENT.md §8.8). Business logic
 * never talks to a vendor SDK: it calls `chat()` or `generateQuizWithAI()`.
 *
 * The full pipeline implemented here:
 *   prompt -> provider -> JSON parse -> 10-point validation -> bounded repair
 *   -> spare pool -> stage builder -> frozen Quiz Package
 *
 * Nothing in this module touches the DOM, so it runs in the browser, in Node,
 * and inside the dev server proxy. `fetchImpl` is injectable for tests.
 */

import { validateBank, validateQuestion } from './validator.js';
import { buildQuizPackage, resolveSettings } from './quiz-builder.js';
import { distributeQuestions } from '../game-engine/engine.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildRepairPrompt,
  buildSingleQuestionPrompt,
} from './prompts.js';

export const PROVIDERS = {
  offline: { id: 'offline', label: 'Offline demo library (no AI)', needsKey: false, kind: 'local' },
  mock: { id: 'mock', label: 'Mock provider (pipeline demo)', needsKey: false, kind: 'local' },
  openai: { id: 'openai', label: 'OpenAI / compatible', needsKey: true, kind: 'openai', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  ollama: { id: 'ollama', label: 'Ollama / local server', needsKey: false, kind: 'openai', defaultBase: 'http://127.0.0.1:11434/v1', defaultModel: 'llama3.1' },
  anthropic: { id: 'anthropic', label: 'Anthropic Claude', needsKey: true, kind: 'anthropic', defaultBase: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-haiku-latest' },
  gemini: { id: 'gemini', label: 'Google Gemini', needsKey: true, kind: 'gemini', defaultBase: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-flash' },
};

export class AIGenerationError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'AIGenerationError';
    this.code = code;
    this.meta = meta;
  }
}

const FRIENDLY = {
  no_provider: 'Quiz generation temporarily failed. Please try again.',
  no_key: 'No AI key is configured for this provider. Add one in Settings or use the demo library.',
  http_error: 'Quiz generation temporarily failed. Please try again.',
  timeout: 'The AI service took too long to answer. Please try again.',
  bad_json: 'The AI service returned an unreadable answer. Please try again.',
  no_questions: 'The AI service returned no usable questions. Please try again.',
  too_many_invalid: 'The AI could not produce enough valid questions for this class and topic.',
  network: 'Could not reach the AI service. Check the connection and try again.',
};

export function friendlyMessage(code, fallback) {
  return FRIENDLY[code] || fallback || FRIENDLY.http_error;
}

/* ------------------------------------------------------------------ */
/* JSON handling                                                       */
/* ------------------------------------------------------------------ */

/** Models wrap JSON in prose or fences; recover the object instead of failing. */
export function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  let raw = text.trim();

  // strip markdown fences
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const direct = tryParse(raw);
  if (direct) return direct;

  // take the widest balanced { ... } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = raw.slice(start, end + 1);
    const parsed = tryParse(slice);
    if (parsed) return parsed;
    const cleaned = slice
      .replace(/,\s*([}\]])/g, '$1')       // trailing commas
      .replace(/[\u201C\u201D]/g, '"')     // smart quotes
      .replace(/[\u2018\u2019]/g, "'");
    const repaired = tryParse(cleaned);
    if (repaired) return repaired;
  }
  return null;
}

function tryParse(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function extractQuestions(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json.filter((q) => q && typeof q === 'object');
  const candidates = [json.questions, json.data, json.items, json.quiz && json.quiz.questions];
  for (const list of candidates) {
    if (Array.isArray(list)) return list.filter((q) => q && typeof q === 'object');
  }
  if (json.question && json.options) return [json];
  return [];
}

/** Normalise whatever the model produced into the shape the validator expects. */
export function normaliseQuestion(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const optionsIn = raw.options || raw.choices || raw.answers || {};
  const keys = ['A', 'B', 'C', 'D'];
  const options = {};
  keys.forEach((key, i) => {
    const lower = key.toLowerCase();
    const value = optionsIn[key] ?? optionsIn[lower] ?? (Array.isArray(optionsIn) ? optionsIn[i] : undefined);
    options[key] = value === undefined || value === null ? '' : String(value).trim();
  });

  let correct = raw.correct_option ?? raw.correctOption ?? raw.answer ?? raw.correct;
  if (typeof correct === 'number') correct = keys[correct - 1] || correct;
  correct = String(correct || '').trim().toUpperCase();
  if (!keys.includes(correct)) {
    // the model may have given the answer text instead of the letter
    const found = keys.find((k) => options[k] && options[k].toLowerCase() === String(raw.answer || '').toLowerCase());
    correct = found || correct;
  }

  const sourceReference = raw.source_reference ?? raw.sourceReference ?? null;

  return {
    question_id: String(raw.question_id || raw.id || `ai_q${index + 1}`),
    stage: Number(raw.stage) || null,
    question: String(raw.question ?? raw.q ?? '').trim(),
    options,
    correct_option: correct,
    explanation: String(raw.explanation ?? raw.reason ?? '').trim(),
    simple_explanation: String(raw.simple_explanation ?? raw.simpleExplanation ?? raw.explanation ?? '').trim(),
    clue: String(raw.clue ?? raw.hint ?? '').trim(),
    difficulty: raw.difficulty || null,
    cognitive_level: raw.cognitive_level || raw.cognitiveLevel || null,
    concept_tag: raw.concept_tag || raw.conceptTag || raw.topic_tag || null,
    source_reference: sourceReference,
    illustration: raw.illustration || null,
  };
}

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

/**
 * Ask the provider for a completion.
 *
 * Two transports:
 *   • endpoint set  → POST to our own server proxy (`/api/ai/chat`). No CORS
 *     problems and the key never has to live in the browser (recommended).
 *   • endpoint unset → call the provider API directly (browser or Node).
 *
 * @returns {Promise<{text:string, usage:object|null, model:string, ms:number}>}
 */
export async function chat({
  provider = 'openai',
  model,
  baseUrl,
  apiKey,
  messages,
  temperature = 0.6,
  maxTokens = 4000,
  fetchImpl,
  timeoutMs = 60000,
  endpoint,
  extra,
} = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) throw new AIGenerationError('network', friendlyMessage('network'), { provider });

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const started = Date.now();

  const send = async (url, init) => {
    try {
      return await doFetch(url, { ...init, signal: controller ? controller.signal : undefined });
    } catch (err) {
      if (err && err.name === 'AbortError') throw new AIGenerationError('timeout', friendlyMessage('timeout'), { provider });
      throw new AIGenerationError('network', friendlyMessage('network'), { provider, cause: String(err && err.message) });
    }
  };

  try {
    /* ---------- proxy transport ---------- */
    if (endpoint) {
      const response = await send(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider, model, baseUrl, apiKey, messages, temperature, maxTokens, timeout_ms: timeoutMs,
          ...(extra && typeof extra === 'object' ? extra : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload) throw new AIGenerationError('bad_json', friendlyMessage('bad_json'), { provider, status: response.status });
      if (payload.ok === false || (!payload.text && payload.error)) {
        const code = (payload.error && payload.error.code) || 'http_error';
        throw new AIGenerationError(code, (payload.error && payload.error.message) || friendlyMessage(code), {
          provider, status: response.status, detail: payload.error && payload.error.detail,
        });
      }
      if (payload.text === undefined || payload.text === null) {
        throw new AIGenerationError('bad_json', friendlyMessage('bad_json'), { provider });
      }
      return { text: payload.text, usage: payload.usage || null, model: payload.model || model || provider, ms: Date.now() - started };
    }

    /* ---------- direct transport ---------- */
    const spec = PROVIDERS[provider];
    if (!spec) throw new AIGenerationError('no_provider', friendlyMessage('no_provider'), { provider });
    if (spec.kind === 'local') throw new AIGenerationError('no_provider', friendlyMessage('no_provider'), { provider });
    if (spec.needsKey && !apiKey) throw new AIGenerationError('no_key', friendlyMessage('no_key'), { provider });

    const url = buildEndpoint({ spec, baseUrl, model, apiKey });
    const init = buildRequest({ spec, apiKey, messages, temperature, maxTokens });

    const response = await send(url, init);
    if (!response.ok) {
      const body = await safeText(response);
      throw new AIGenerationError('http_error', friendlyMessage('http_error'), {
        provider, status: response.status, body: body.slice(0, 400),
      });
    }

    const payload = await response.json().catch(() => null);
    if (!payload) throw new AIGenerationError('bad_json', friendlyMessage('bad_json'), { provider });

    const text = readCompletion(spec.kind, payload);
    if (!text) throw new AIGenerationError('bad_json', friendlyMessage('bad_json'), { provider });

    return {
      text,
      usage: payload.usage || payload.usageMetadata || null,
      model: payload.model || model || spec.defaultModel,
      ms: Date.now() - started,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildEndpoint({ spec, baseUrl, model, apiKey }) {
  const base = (baseUrl || spec.defaultBase || '').replace(/\/+$/, '');
  const chosen = model || spec.defaultModel;
  if (spec.kind === 'openai') return `${base}/chat/completions`;
  if (spec.kind === 'anthropic') return `${base}/messages`;
  if (spec.kind === 'gemini') return `${base}/models/${encodeURIComponent(chosen)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
  return base;
}

function buildRequest({ spec, apiKey, messages, temperature, maxTokens }) {
  const headers = { 'Content-Type': 'application/json' };

  if (spec.kind === 'openai') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: spec.defaultModel, messages, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
    };
  }
  if (spec.kind === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    return {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: spec.defaultModel, system, messages: rest, temperature, max_tokens: maxTokens }),
    };
  }
  if (spec.kind === 'gemini') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    return {
      method: 'POST',
      headers,
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    };
  }
  return { method: 'POST', headers, body: JSON.stringify({ messages, temperature, maxTokens }) };
}

function readCompletion(kind, payload) {
  try {
    if (kind === 'openai') return payload.choices?.[0]?.message?.content ?? null;
    if (kind === 'anthropic') return (payload.content || []).map((part) => part.text || '').join('') || null;
    if (kind === 'gemini') return payload.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || null;
  } catch {
    return null;
  }
  return null;
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* the pipeline                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a validated Quiz Package with an AI provider.
 *
 * @param {object} args
 * @param {object} args.config   { provider, model, baseUrl, apiKey, transport, temperature, timeoutMs }
 * @param {object} args.input    { classLevel, topic, subject, language, count, timer, lifelines, sourceMode, materialText, allowAdditionalKnowledge }
 * @param {Function} [args.onProgress] called with { stage, detail, ...stats }
 * @param {Function} [args.fetchImpl] injected for tests
 */
export async function generateQuizWithAI({
  config = {},
  input = {},
  onProgress = () => {},
  fetchImpl,
  maxRepairRounds = 3,
  maxCalls = 6,
} = {}) {
  const provider = config.provider || 'openai';
  const spec = PROVIDERS[provider];
  const viaProxy = !!config.endpoint;
  if (!spec && !viaProxy) {
    throw new AIGenerationError('no_provider', friendlyMessage('no_provider'), { provider });
  }
  if (spec && spec.kind === 'local' && !viaProxy) {
    throw new AIGenerationError('no_provider', friendlyMessage('no_provider'), { provider });
  }

  const started = Date.now();
  const stats = { provider, model: config.model || (spec && spec.defaultModel) || provider, calls: 0, repairs: 0, dropped: 0, promptChars: 0, usage: null };
  const call = async (messages, label) => {
    if (stats.calls >= maxCalls) throw new AIGenerationError('too_many_invalid', friendlyMessage('too_many_invalid'), { calls: stats.calls });
    stats.calls += 1;
    const res = await chat({
      provider,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      messages,
      temperature: config.temperature,
      timeoutMs: config.timeoutMs,
      fetchImpl,
      endpoint: config.endpoint,
      extra: config.extra, // mock-provider hints, ignored by real providers
    });
    if (res.usage) stats.usage = res.usage;
    onProgress({ stage: label, calls: stats.calls });
    return res;
  };

  const ctx = {
    classLevel: Number(input.classLevel) || 5,
    language: input.language || 'en',
    sourceMode: input.sourceMode === 'material' ? 'material' : 'topic',
    allowAdditionalKnowledge: !!input.allowAdditionalKnowledge,
  };

  const system = buildSystemPrompt();
  const user = buildUserPrompt(input);
  stats.promptChars = system.length + user.length;

  onProgress({ stage: 'prompt', promptChars: stats.promptChars });
  const first = await call([{ role: 'system', content: system }, { role: 'user', content: user }], 'generating');

  const json = parseJsonLoose(first.text);
  if (!json) throw new AIGenerationError('bad_json', friendlyMessage('bad_json'), { raw: first.text.slice(0, 300) });

  let questions = extractQuestions(json).map((raw, i) => normaliseQuestion(raw, i)).filter(Boolean);
  if (!questions.length) throw new AIGenerationError('no_questions', friendlyMessage('no_questions'), { provider });

  /* ---- validate + bounded repair ---- */
  let bank = validateBank(questions, ctx);
  onProgress({ stage: 'validating', ...bank.stats, byCode: bank.byCode });

  for (let round = 0; round < maxRepairRounds; round++) {
    const failed = bank.results.filter((r) => !r.pass);
    if (!failed.length) break;

    const targets = failed.slice(0, 4).map((r) => ({
      result: r,
      question: questions.find((q) => q.question_id === r.question_id),
    })).filter((t) => t.question);

    if (!targets.length) break;

    onProgress({ stage: 'repairing', round: round + 1, codes: bank.byCode });

    for (const target of targets) {
      if (stats.calls >= maxCalls) break;
      const repairMessages = [
        { role: 'system', content: system },
        { role: 'user', content: buildRepairPrompt(target.question, target.result.failures, ctx) },
      ];
      const repaired = await call(repairMessages, 'repairing');
      const parsed = parseJsonLoose(repaired.text);
      const replacement = extractQuestions(parsed).map((raw, i) => normaliseQuestion(raw, i))[0];
      if (!replacement) continue;
      replacement.question_id = target.question.question_id; // keep the slot identity
      const check = validateQuestion(replacement, { ...ctx, seenQuestions: questions.filter((q) => q.question_id !== target.question.question_id) });
      if (!check.pass) continue;
      stats.repairs += 1;
      questions = questions.map((q) => (q.question_id === target.question.question_id ? replacement : q));
    }

    bank = validateBank(questions, ctx);
    onProgress({ stage: 'validating', round: round + 1, ...bank.stats });
  }

  let safe = bank.safe;
  stats.dropped = bank.stats.failed;

  /* ---- spare micro-batch when the pool is thin ---- */
  const minimum = Math.min(5, Number(input.count) || 5);
  if (safe.length < minimum && stats.calls < maxCalls) {
    onProgress({ stage: 'extending', have: safe.length, need: minimum });
    const retry = await call([
      { role: 'system', content: system },
      {
        role: 'user',
        content: `${user}\n\nIMPORTANT: return at least ${Math.max(6, input.count || 6)} fresh questions. The previous attempt produced too many invalid items. Keep every question short and unambiguous.`,
      },
    ], 'generating');
    const extra = extractQuestions(parseJsonLoose(retry.text)).map((raw, i) => normaliseQuestion(raw, i));
    const extraBank = validateBank(extra, { ...ctx, seenQuestions: safe });
    safe = safe.concat(extraBank.safe);
    bank = { ...bank, safe, stats: { ...bank.stats, passed: safe.length } };
    onProgress({ stage: 'validating', ...bank.stats });
  }

  if (safe.length < minimum) {
    throw new AIGenerationError('too_many_invalid', friendlyMessage('too_many_invalid'), {
      passed: safe.length, byCode: bank.byCode, calls: stats.calls,
    });
  }

  /* ---- freeze the package ---- */
  onProgress({ stage: 'building', passed: safe.length });
  const settings = resolveSettings({
    classLevel: ctx.classLevel,
    timer: input.timer,
    passPolicy: input.passPolicy,
    lifelines: input.lifelines,
  });

  const package_ = buildQuizPackage({
    questions: safe,
    classLevel: ctx.classLevel,
    subject: input.subject || 'General',
    topic: input.topic || 'General',
    language: ctx.language,
    title: input.title,
    sourceType: ctx.sourceMode,
    sourceMeta: {
      file_name: input.fileName || null,
      pages: input.pages || null,
      allow_additional_knowledge: ctx.allowAdditionalKnowledge,
    },
    settings,
    count: Number(input.count) || 15,
    generationMeta: {
      model: `${provider}:${stats.model}`,
      validator_pass: bank.stats.failed === 0,
      validation_stats: bank.stats,
      regenerations: stats.repairs,
      note: stats.dropped ? `${stats.dropped} question(s) were dropped by the validator.` : null,
    },
  });

  return {
    ok: true,
    package: package_,
    validation: bank,
    distribution: distributeQuestions(Math.min(safe.length, Number(input.count) || safe.length)),
    meta: { ...stats, latencyMs: Date.now() - started, validationByCode: bank.byCode, droppedQuestions: bank.rejected || [] },
  };
}

/**
 * Regenerate ONE question for an existing slot (§29).
 * The teacher keeps the other questions exactly as they are.
 */
export async function generateSingleQuestion({ config = {}, input = {}, fetchImpl } = {}) {
  const provider = config.provider || 'openai';
  const spec = PROVIDERS[provider];
  const viaProxy = !!config.endpoint;
  if ((!spec || spec.kind === 'local') && !viaProxy) {
    throw new AIGenerationError('no_provider', friendlyMessage('no_provider'), { provider });
  }

  const res = await chat({
    provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    fetchImpl,
    timeoutMs: config.timeoutMs,
    maxTokens: 1400,
    temperature: config.temperature,
    extra: config.extra,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildSingleQuestionPrompt(input) },
    ],
  });

  const raw = extractQuestions(parseJsonLoose(res.text))[0];
  if (!raw) throw new AIGenerationError('no_questions', friendlyMessage('no_questions'), { provider });
  return normaliseQuestion(raw, 0);
}

/** Cheap connectivity probe used by the Settings screen. */export async function testProvider({ config = {}, fetchImpl } = {}) {
  const provider = config.provider;
  if (provider === 'offline') return { ok: true, mode: 'offline', message: 'Demo library ready — no AI needed.' };
  if (provider === 'mock') {
    // The mock builds questions from material inside the prompt, so the probe
    // sends a tiny lesson instead of a bare topic.
    const probe = [
      'class_level: 5',
      'language: en',
      'question_count: 5',
      'source_mode: material',
      'material_text:',
      '"""',
      'Evaporation is the change of water into vapour. Condensation is the change of vapour into water.',
      'Precipitation is water falling from clouds as rain or snow. A river is flowing water moving to the sea.',
      'A glacier is a large mass of slow moving ice. Groundwater is water stored under the ground.',
      '"""',
    ].join('\n');
    const res = await chat({
      provider: 'mock',
      messages: [{ role: 'user', content: probe }],
      fetchImpl,
      endpoint: config.endpoint,
      extra: { inject_flaw: false, delay_ms: 40 },
    }).catch((err) => ({ error: err }));
    if (res.error) return { ok: false, mode: 'mock', message: friendlyMessage(res.error.code, res.error.message) };
    const json = parseJsonLoose(res.text);
    const questions = extractQuestions(json);
    return {
      ok: questions.length > 0,
      mode: 'mock',
      message: questions.length ? 'Mock provider is answering with valid JSON.' : 'Mock provider returned no questions.',
      model: res.model,
    };
  }

  try {
    const res = await chat({
      provider,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      fetchImpl,
      maxTokens: 40,
      temperature: 0,
      timeoutMs: 20000,
      messages: [
        { role: 'system', content: 'You are a health check. Answer with JSON only.' },
        { role: 'user', content: 'Return {"ok":true}' },
      ],
    });
    return { ok: true, mode: provider, message: `Connected in ${(res.ms / 1000).toFixed(1)}s.`, model: res.model };
  } catch (err) {
    return { ok: false, mode: provider, message: friendlyMessage(err.code, err.message), detail: err.meta || null };
  }
}

export default generateQuizWithAI;
