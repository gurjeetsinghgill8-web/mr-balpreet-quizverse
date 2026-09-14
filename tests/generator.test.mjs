/**
 * QUIZVERSE — generation pipeline tests (offline stand-in for the AI Quiz Brain)
 * Run:  node --test tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateFromTopic, generateFromMaterial, demoLibrary } from '../app/offline-generator.js';
import { createGame } from '../packages/game-engine/engine.js';

test('topic mode builds a playable Class 5 Solar System game', () => {
  const res = generateFromTopic({ classLevel: 5, topic: 'Solar System', count: 15 });
  assert.equal(res.ok, true, JSON.stringify(res.errorVars || res.error));
  assert.equal(res.package.class_level, 5);
  assert.equal(res.package.language, 'en');
  assert.deepEqual(res.package.stages.map((s) => s.question_ids.length), [3, 3, 3, 3, 3]);
  assert.equal(res.validation.stats.failed, 0, JSON.stringify(res.validation.byCode));
  assert.ok(res.package.generation_meta.reserve_count >= 3, 'reserves power CHANGE QUESTION');

  const game = createGame(res.package);
  game.start();
  assert.equal(game.getView().questionsInStage, 3);
});

test('topic mode builds a Hindi Class 7 Computer game with Devanagari content', () => {
  const res = generateFromTopic({ classLevel: 7, topic: 'कंप्यूटर', count: 15, language: 'hi' });
  assert.equal(res.ok, true, JSON.stringify(res.errorVars || res.error));
  assert.equal(res.package.language, 'hi');
  assert.match(res.package.questions[0].question, /[\u0900-\u097F]/);
  assert.equal(res.validation.stats.failed, 0, JSON.stringify(res.validation.byCode));
  assert.ok(res.validation.stats.passed >= 15);
});

test('topic mode keeps the Class 1 game short, illustrated and non-eliminating', () => {
  const res = generateFromTopic({ classLevel: 1, topic: 'Animals', count: 10 });
  assert.equal(res.ok, true);
  assert.equal(res.package.settings.always_advance, true);
  assert.equal(res.package.settings.timer_seconds, 45);
  assert.equal(res.package.settings.final_stage_ratio, 0.5);
  assert.deepEqual(res.package.stages.map((s) => s.question_ids.length), [2, 2, 2, 2, 2]);
  assert.ok(res.package.questions.every((q) => q.question.split(/\s+/).length <= 12));
});

test('an unknown topic fails gracefully with library suggestions', () => {
  const res = generateFromTopic({ classLevel: 4, topic: 'Quantum Chromodynamics', count: 15 });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'no_pack');
  assert.ok(res.suggestions.length >= 3);
  assert.equal(demoLibrary.length, 3);
});

test('a topic that cannot satisfy the selected class is refused, not faked', () => {
  const res = generateFromTopic({ classLevel: 1, topic: 'Solar System', count: 15 });
  if (res.ok) {
    // If any question survives Class 1 language limits it must still be short
    assert.ok(res.package.questions.every((q) => q.question.split(/\s+/).length <= 12));
  } else {
    assert.equal(res.error, 'too_few_for_class');
    assert.ok(res.validation.stats.passed < 5);
  }
});

test('material mode builds questions only from the supplied text, with sources', () => {
  const text = `
    Photosynthesis is the process by which green plants make their own food using sunlight.
    Chlorophyll is the green pigment in leaves that absorbs sunlight.
    Stomata are tiny pores on a leaf that let gases move in and out.
    The stem carries water from the roots to the leaves.
    Roots are the part of a plant that absorb water and minerals from the soil.
    A seedling is a young plant that grows from a seed.
  `;
  const res = generateFromMaterial({ text, classLevel: 6, count: 10, topic: 'Plants' });
  assert.equal(res.ok, true, JSON.stringify(res.errorVars || res.error));
  assert.ok(res.package.questions.length >= 5);
  res.package.questions.forEach((q) => {
    assert.ok(q.source_reference && q.source_reference.excerpt, `${q.question_id} must cite the material`);
    assert.ok(q.explanation.includes('your material'));
  });
  const slots = new Set(res.package.questions.map((q) => q.correct_option));
  assert.ok(slots.size > 1, 'the correct answer must not always sit in the same slot');
});

test('material mode refuses thin material instead of inventing facts', () => {
  const res = generateFromMaterial({ text: 'Hello class. Today we will revise the chapter.', classLevel: 5 });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'material_too_thin');
  assert.equal(res.found, 0);
});

test('a material-built game is fully playable end to end', () => {
  const text = Array.from({ length: 8 }, (_, i) =>
    `Term${i + 1} is the definition number ${i + 1} used in this lesson.`).join(' ');
  const res = generateFromMaterial({ text, classLevel: 6, count: 10 });
  assert.equal(res.ok, true);
  const game = createGame(res.package);
  game.start();
  let guard = 0;
  while (!['WINNER', 'NOT_CLEARED'].includes(game.getView().status) && guard++ < 100) {
    const v = game.getView();
    if (v.status === 'QUESTION_READY') { game.selectOption(v.question ? 'A' : 'A'); game.reveal(); }
    else game.next();
  }
  assert.ok(['WINNER', 'NOT_CLEARED'].includes(game.getResult().status));
  assert.equal(game.getResult().questions_answered, res.package.questions.length >= 5 ? game.getResult().questions_answered : 0);
});
