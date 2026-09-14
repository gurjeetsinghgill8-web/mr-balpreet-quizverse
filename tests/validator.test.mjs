/**
 * QUIZVERSE — LAYER 1 unit tests (validation engine + quiz builder)
 * Run:  node --test tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateQuestion, validateBank, bandFor, similarity } from '../packages/ai-service/validator.js';
import { buildQuizPackage, resolveSettings } from '../packages/ai-service/quiz-builder.js';
import { distributeQuestions } from '../packages/game-engine/engine.js';

const good = (over = {}) => ({
  question_id: 'q_ok',
  stage: 1,
  question: 'Which planet is known as the Red Planet?',
  options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' },
  correct_option: 'B',
  explanation: 'Mars looks red because of iron minerals on its surface.',
  simple_explanation: 'Mars has red dust, so we call it the Red Planet.',
  clue: 'This planet is famous for its reddish appearance.',
  difficulty: 'very_easy',
  concept_tag: 'planet identity',
  ...over,
});

test('a clean question passes every check', () => {
  const res = validateQuestion(good(), { classLevel: 5, language: 'en' });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('band mapping is class-aware', () => {
  assert.equal(bandFor(1), 'A');
  assert.equal(bandFor(2), 'A');
  assert.equal(bandFor(3), 'B');
  assert.equal(bandFor(5), 'B');
  assert.equal(bandFor(6), 'C');
  assert.equal(bandFor(8), 'C');
});

test('check 1 — exactly four options', () => {
  const res = validateQuestion(good({ options: { A: 'Venus', B: 'Mars', C: 'Jupiter' } }), { classLevel: 5 });
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => f.code === 'FOUR_OPTIONS'));
});

test('check 2 — exactly one correct answer, present in the options', () => {
  const res = validateQuestion(good({ correct_option: 'E' }), { classLevel: 5 });
  assert.ok(res.failures.some((f) => f.code === 'ONE_CORRECT'));
});

test('check 3 — duplicate option texts are rejected', () => {
  const res = validateQuestion(good({ options: { A: 'Mars', B: 'Mars', C: 'Venus', D: 'Saturn' } }), { classLevel: 5 });
  assert.ok(res.failures.some((f) => f.code === 'DUPLICATE_OPTION'));
});

test('check 4 — near-duplicate questions are rejected by validateBank', () => {
  const bank = validateBank([
    good({ question_id: 'q1' }),
    good({ question_id: 'q2', question: 'Which planet is known as the Red Planet ?' }),
  ], { classLevel: 5, language: 'en' });
  assert.equal(bank.stats.passed, 1);
  assert.equal(bank.stats.failed, 1);
  assert.ok(bank.byCode.DUPLICATE_QUESTION >= 1);
  assert.equal(similarity('Which planet is red?', 'Which planet is red?'), 1);
});

test('check 5 — Class 2 never gets a long Class-8 stem', () => {
  const res = validateQuestion(good({
    question: 'Considering the photochemical properties of the Martian regolith and its iron oxide composition, which planet is known as the Red Planet?',
  }), { classLevel: 2, language: 'en' });
  assert.ok(res.failures.some((f) => f.code === 'CLASS_MISMATCH'));
});

test('check 6 — Hindi quiz requires Devanagari, English quiz forbids it', () => {
  const hindiQuizEnglishQuestion = validateQuestion(good(), { classLevel: 7, language: 'hi' });
  assert.ok(hindiQuizEnglishQuestion.failures.some((f) => f.code === 'LANGUAGE_MISMATCH'));

  const englishQuizHindiQuestion = validateQuestion(good({ question: 'कौन सा ग्रह लाल है?' }), { classLevel: 7, language: 'en' });
  assert.ok(englishQuizHindiQuestion.failures.some((f) => f.code === 'LANGUAGE_MISMATCH'));
});

test('check 7 — double negatives and never/always are ambiguous for juniors', () => {
  const res = validateQuestion(good({ question: 'Which of these is not never a planet?' }), { classLevel: 4 });
  assert.ok(res.failures.some((f) => f.code === 'AMBIGUOUS'));
  const res2 = validateQuestion(good({ question: 'Is Mars always the red planet?' }), { classLevel: 3 });
  assert.ok(res2.failures.some((f) => f.code === 'AMBIGUOUS'));
});

test('check 8 — the explanation must exist and not just echo an option', () => {
  const empty = validateQuestion(good({ explanation: '' }), { classLevel: 5 });
  assert.ok(empty.failures.some((f) => f.code === 'EXPLANATION_MISSING'));
  const echo = validateQuestion(good({ explanation: 'Mars' }), { classLevel: 5 });
  assert.ok(echo.failures.some((f) => f.code === 'EXPLANATION_MISSING'));
});

test('check 9 — material mode demands a source reference', () => {
  const res = validateQuestion(good(), {
    classLevel: 6, language: 'en', sourceMode: 'material', allowAdditionalKnowledge: false,
  });
  assert.ok(res.failures.some((f) => f.code === 'UNSOURCED'));

  const withSource = validateQuestion(good({
    source_reference: { page: 4, section: 'The Water Cycle', excerpt: 'evaporation happens when…' },
  }), { classLevel: 6, language: 'en', sourceMode: 'material', allowAdditionalKnowledge: false });
  assert.equal(withSource.pass, true, JSON.stringify(withSource.failures));

  const allowed = validateQuestion(good(), {
    classLevel: 6, language: 'en', sourceMode: 'material', allowAdditionalKnowledge: true,
  });
  assert.equal(allowed.pass, true);
});

test('check 10 — unsafe content never reaches a child', () => {
  for (const bad of [
    'Which weapon is used in war?',
    'Who is the stupid student in class?',
    'How do you gamble online?',
  ]) {
    const res = validateQuestion(good({ question: bad }), { classLevel: 8 });
    assert.equal(res.pass, false, bad);
    assert.ok(res.failures.some((f) => f.code === 'UNSAFE'));
  }
});

test('extra check — the clue must not reveal the answer', () => {
  const res = validateQuestion(good({ clue: 'The answer is Mars.' }), { classLevel: 5 });
  assert.ok(res.failures.some((f) => f.code === 'CLUE_REVEALS_ANSWER'));
});

test('validateBank reports statistics by failure code', () => {
  const bank = validateBank([
    good({ question_id: 'a' }),
    good({ question_id: 'b', options: { A: 'Mars', B: 'Mars', C: 'Venus', D: 'Saturn' } }),
  ], { classLevel: 5, language: 'en' });
  assert.equal(bank.pass, false);
  assert.equal(bank.stats.total, 2);
  assert.equal(bank.safe.length, 1);
  assert.ok(Object.keys(bank.byCode).length >= 1);
});

/* ------------------------------------------------------------------ */
/* quiz builder                                                        */
/* ------------------------------------------------------------------ */

function bank(count = 15) {
  const out = [];
  for (let s = 1; s <= 5; s++) {
    for (let i = 1; i <= Math.ceil(count / 5); i++) {
      out.push(good({
        question_id: `q_${s}_${i}`,
        stage: s,
        question: `Stage ${s} question number ${i} about space?`,
        difficulty: ['very_easy', 'easy', 'medium', 'hard', 'highest'][s - 1],
      }));
    }
  }
  return out;
}

test('resolveSettings applies class-aware defaults', () => {
  const c1 = resolveSettings({ classLevel: 1 });
  assert.equal(c1.timer_seconds, 45);
  assert.equal(c1.always_advance, true);
  assert.equal(c1.final_stage_ratio, 0.5);

  const c8 = resolveSettings({ classLevel: 8 });
  assert.equal(c8.timer_seconds, 30);
  assert.equal(c8.always_advance, false);

  const none = resolveSettings({ classLevel: 5, timer: 'none' });
  assert.equal(none.timer_seconds, 0);

  const off = resolveSettings({ classLevel: 5, lifelines: { half_half: 0, clue: 1, second_chance: 1, change_question: 1 } });
  assert.equal(off.lifelines.half_half, 0);
});

test('builder distributes questions across 5 stages and keeps reserves', () => {
  const settings = resolveSettings({ classLevel: 5 });
  const pkg = buildQuizPackage({
    questions: bank(15),
    classLevel: 5,
    count: 15,
    settings,
    subject: 'Science',
    topic: 'Space',
  });
  assert.equal(pkg.stages.length, 5);
  assert.deepEqual(pkg.stages.map((s) => s.question_ids.length), [3, 3, 3, 3, 3]);
  assert.equal(pkg.generation_meta.delivered_count, 15);
  assert.equal(pkg.schema_version, '1.0');
});

test('builder never returns an empty stage even with a small bank', () => {
  const settings = resolveSettings({ classLevel: 3 });
  const questions = bank(15).filter((q) => q.stage <= 3); // only 9 questions, no stage 4/5
  const pkg = buildQuizPackage({ questions, classLevel: 3, count: 15, settings });
  assert.equal(pkg.stages.length, 5);
  pkg.stages.forEach((s) => assert.ok(s.question_ids.length >= 1, `stage ${s.stage} is empty`));
});

test('builder caps the delivered count at the bank size and records it', () => {
  const settings = resolveSettings({ classLevel: 4 });
  const pkg = buildQuizPackage({ questions: bank(10), classLevel: 4, count: 25, settings });
  assert.ok(pkg.generation_meta.delivered_count <= 10);
  assert.ok(pkg.generation_meta.delivered_count >= 10);
  assert.equal(distributeQuestions(10).reduce((a, b) => a + b, 0), 10);
});

test('built package is immediately playable by the engine', async () => {
  const { createGame } = await import('../packages/game-engine/engine.js');
  const settings = resolveSettings({ classLevel: 5 });
  const pkg = buildQuizPackage({ questions: bank(15), classLevel: 5, count: 15, settings, topic: 'Space' });
  const game = createGame(pkg);
  game.start();
  const view = game.getView();
  assert.equal(view.questionsInStage, 3);
  assert.equal(view.stageCount, 5);
  assert.equal(view.status, 'QUESTION_READY');
});
