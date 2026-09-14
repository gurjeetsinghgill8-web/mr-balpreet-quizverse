/**
 * QUIZVERSE — teacher editing tests (app/quiz-editor.js)
 * Run:  node --test tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  updateQuestion,
  deleteQuestion,
  regenerateQuestion,
  replaceWithReserve,
  refillStage,
  nextVersion,
  packageStats,
  packageWarnings,
  reservePool,
  stageOf,
} from '../app/quiz-editor.js';
import { generateFromTopic } from '../app/offline-generator.js';
import { createGame } from '../packages/game-engine/engine.js';

function freshPackage() {
  const res = generateFromTopic({ classLevel: 5, topic: 'Solar System', count: 15 });
  assert.equal(res.ok, true);
  return res.package;
}

/* ------------------------------------------------------------------ */
/* 1. editing one question                                             */
/* ------------------------------------------------------------------ */

test('a valid teacher edit is applied and bumps the version', () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];
  const before = pkg.questions.find((q) => q.question_id === target);

  const res = updateQuestion(pkg, target, {
    question: 'Which planet is known as the Red Planet in our solar system?',
    options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' },
    correct_option: 'B',
    explanation: 'Mars appears red because iron minerals in its soil rust.',
    clue: 'It is the fourth planet from the Sun.',
  });

  assert.equal(res.ok, true, JSON.stringify(res.failures));
  assert.equal(res.pkg.version, pkg.version + 1, 'edits create a new version (§56)');
  const after = res.pkg.questions.find((q) => q.question_id === target);
  assert.match(after.question, /Red Planet in our solar system/);
  assert.equal(after.origin, 'teacher');
  assert.equal(after.question_id, target, 'slot identity is preserved');
  assert.equal(after.stage, before.stage);
  assert.equal(res.pkg.stages[0].question_ids[0], target);
});

test('an invalid teacher edit is refused with the validator failure codes', () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];

  const dup = updateQuestion(pkg, target, { options: { A: 'Mars', B: 'Mars', C: 'Jupiter', D: 'Saturn' } });
  assert.equal(dup.ok, false);
  assert.ok(dup.codes.includes('DUPLICATE_OPTION'), JSON.stringify(dup.codes));

  const missing = updateQuestion(pkg, target, { explanation: '' });
  assert.equal(missing.ok, false);
  assert.ok(missing.codes.includes('EXPLANATION_MISSING'));

  const tooLong = updateQuestion(pkg, target, {
    question: 'Considering the photochemical properties of the Martian regolith and its iron oxide composition, which of the planets in the inner solar system is commonly referred to as the Red Planet?',
  });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.codes.includes('CLASS_MISMATCH'), JSON.stringify(tooLong.codes));

  const unsafe = updateQuestion(pkg, target, { question: 'Which weapon would you use on Mars?' });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.codes.includes('UNSAFE'));
});

test('editing an unknown question fails cleanly', () => {
  const res = updateQuestion(freshPackage(), 'nope', {});
  assert.equal(res.ok, false);
  assert.equal(res.codes[0], 'NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/* 2. delete + refill                                                  */
/* ------------------------------------------------------------------ */

test('deleting a question removes it from play and refills the stage from reserves', () => {
  const pkg = freshPackage();
  const reservesBefore = reservePool(pkg).length;
  const stageNo = stageOf(pkg, pkg.stages[2].question_ids[0]);
  const target = pkg.stages[2].question_ids[0];

  const res = deleteQuestion(pkg, target);
  assert.equal(res.ok, true);
  assert.equal(res.pkg.questions.some((q) => q.question_id === target), false, 'deleted question leaves the package');
  const stage = res.pkg.stages.find((s) => s.stage === stageNo);
  assert.equal(stage.question_ids.length, 3, 'the stage was refilled to its original size');
  assert.equal(stage.question_ids.includes(target), false);
  assert.ok(res.refilled.length >= 1, 'a reserve question took the slot');
  assert.equal(reservePool(res.pkg).length, reservesBefore - res.refilled.length);
});

test('a stage is auto-refilled from reserves when questions are deleted', () => {
  const pkg = freshPackage();
  const ids = [...pkg.stages[0].question_ids];
  let current = deleteQuestion(pkg, ids[0]).pkg;
  assert.equal(current.stages[0].question_ids.length, 3, 'the stage was instantly refilled');
  current = deleteQuestion(current, ids[1]).pkg;
  assert.equal(current.stages[0].question_ids.length, 3);
  assert.equal(current.stages[0].question_ids.includes(ids[0]), false);
  assert.equal(current.stages[0].question_ids.includes(ids[1]), false);
});

test('the last question of a stage cannot be deleted', () => {
  const pkg = freshPackage();
  // Trim stage 1 to a single question and drop everything unstaged: the only
  // situation in which a stage could be left empty.
  const keep = new Set(pkg.stages.flatMap((s) => (s.stage === 1 ? [s.question_ids[0]] : s.question_ids)));
  const single = {
    ...pkg,
    questions: pkg.questions.filter((q) => keep.has(q.question_id)),
    stages: pkg.stages.map((s) => (s.stage === 1 ? { ...s, question_ids: [s.question_ids[0]] } : s)),
  };
  assert.equal(reservePool(single).length, 0, 'no reserves left to refill from');

  const res = deleteQuestion(single, single.stages[0].question_ids[0]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'last_question');
  assert.match(res.message, /at least one question/i);
});

test('refillStage tops a stage up and reports what it added', () => {
  const pkg = freshPackage();
  const trimmed = {
    ...pkg,
    stages: pkg.stages.map((s) => (s.stage === 4 ? { ...s, question_ids: s.question_ids.slice(0, 1) } : s)),
  };
  const res = refillStage(trimmed, 4);
  assert.ok(res.added.length >= 1);
  assert.ok(res.pkg.stages.find((s) => s.stage === 4).question_ids.length > 1);
});

/* ------------------------------------------------------------------ */
/* 3. regenerate one question                                          */
/* ------------------------------------------------------------------ */

test('regenerate without AI pulls an unseen reserve question for the same stage', async () => {
  const pkg = freshPackage();
  const target = pkg.stages[1].question_ids[0];

  const res = await regenerateQuestion({ pkg, questionId: target, settings: { aiProvider: 'offline' } });
  assert.equal(res.ok, true);
  assert.equal(res.source, 'reserve');
  assert.equal(res.pkg.stages[1].question_ids.includes(target), false);
  const replacementId = res.pkg.stages[1].question_ids[0];
  const replacement = res.pkg.questions.find((q) => q.question_id === replacementId);
  assert.equal(replacement.stage, 2, 'the replacement was placed in the correct stage');
  assert.equal(replacement.origin, 'reserve');
  assert.equal(res.pkg.version, pkg.version + 1);
});

test('regenerate uses the AI when a provider answers', async () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];
  const aiQuestion = {
    question_id: 'ignored',
    stage: 1,
    difficulty: 'very_easy',
    question: 'Which planet is the smallest one in our solar system?',
    options: { A: 'Mercury', B: 'Mars', C: 'Venus', D: 'Earth' },
    correct_option: 'A',
    explanation: 'Mercury is the smallest planet, even smaller than Earth.',
    simple_explanation: 'Mercury is the smallest planet.',
    clue: 'It is also the closest planet to the Sun.',
    source_reference: null,
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, text: JSON.stringify({ questions: [aiQuestion] }), model: 'test' }),
  });

  const res = await regenerateQuestion({
    pkg,
    questionId: target,
    settings: { aiProvider: 'openai', aiApiKey: 'k', aiEndpoint: '/api/ai/chat' },
    fetchImpl,
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, 'ai');
  const replacement = res.pkg.questions.find((q) => q.question_id === target);
  assert.match(replacement.question, /smallest one in our solar system/);
  assert.equal(replacement.origin, 'ai');
  assert.equal(replacement.stage, 1);
});

test('a failing AI silently degrades to the reserve pool instead of breaking the editor', async () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];
  const failingFetch = async () => { throw new Error('network down'); };

  const res = await regenerateQuestion({
    pkg,
    questionId: target,
    settings: { aiProvider: 'openai', aiApiKey: 'k', aiEndpoint: '/api/ai/chat' },
    fetchImpl: failingFetch,
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, 'reserve');
});

test('regenerate reports honestly when there is nothing to swap in', async () => {
  const pkg = freshPackage();
  // a package with no reserve pool at all: every question is staged
  const stripped = {
    ...pkg,
    questions: pkg.questions.filter((q) => pkg.stages.some((s) => s.question_ids.includes(q.question_id))),
  };
  assert.equal(reservePool(stripped).length, 0);

  const res = await regenerateQuestion({
    pkg: stripped,
    questionId: stripped.stages[0].question_ids[0],
    settings: { aiProvider: 'offline' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_replacement');
  assert.match(res.message, /replacement/i);
});

test('a swap keeps the replaced question available as a reserve (nothing is wasted)', async () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];
  const res = await regenerateQuestion({ pkg, questionId: target, settings: { aiProvider: 'offline' } });
  assert.equal(res.ok, true);
  assert.ok(reservePool(res.pkg).some((q) => q.question_id === target), 'the replaced question returns to the pool');
});

test('replaceWithReserve refuses politely when the pool is empty', () => {
  const pkg = freshPackage();
  const stripped = { ...pkg, questions: pkg.questions.filter((q) => pkg.stages.some((s) => s.question_ids.includes(q.question_id))) };
  const res = replaceWithReserve(stripped, stripped.stages[0].question_ids[0]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_replacement');
});

/* ------------------------------------------------------------------ */
/* 4. versions + integrity                                             */
/* ------------------------------------------------------------------ */

test('version helpers and package statistics', () => {
  const pkg = freshPackage();
  const bumped = nextVersion(pkg, 'Teacher pressed regenerate all.');
  assert.equal(bumped.version, pkg.version + 1);
  assert.equal(bumped.generation_meta.note, 'Teacher pressed regenerate all.');

  const stats = packageStats(pkg);
  assert.equal(stats.questions, 15);
  assert.equal(stats.byStage.length, 5);
  assert.deepEqual(stats.emptyStages, []);
  assert.ok(stats.reserves >= 3);
});

test('packageWarnings flags anything that should stop a teacher', () => {
  const pkg = freshPackage();
  assert.deepEqual(packageWarnings(pkg).warnings, []);

  const damaged = {
    ...pkg,
    stages: pkg.stages.map((s) => (s.stage === 3 ? { ...s, question_ids: [] } : s)),
  };
  assert.ok(packageWarnings(damaged).warnings.some((w) => /no questions/i.test(w)));

  const withBroken = {
    ...pkg,
    questions: pkg.questions.map((q, i) => (i === 0
      ? { ...q, options: { A: 'Mars', B: 'Mars', C: 'Jupiter', D: 'Saturn' } }
      : q)),
  };
  assert.ok(packageWarnings(withBroken).warnings.some((w) => /fail validation/i.test(w)));
});

test('an edited package is still playable by the engine', async () => {
  const pkg = freshPackage();
  const target = pkg.stages[0].question_ids[0];
  const edited = updateQuestion(pkg, target, { question: 'Which planet is known as the Red Planet in our sky?' }).pkg;
  const swapped = (await regenerateQuestion({ pkg: edited, questionId: pkg.stages[1].question_ids[0], settings: {} })).pkg;
  const trimmed = deleteQuestion(swapped, swapped.stages[2].question_ids[0]).pkg;

  const game = createGame(trimmed);
  game.start();
  const view = game.getView();
  assert.equal(view.status, 'QUESTION_READY');
  assert.equal(view.options.length, 4);
  assert.equal(view.rail.length, 5);
});
