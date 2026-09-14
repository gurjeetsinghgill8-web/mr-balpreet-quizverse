/**
 * QUIZVERSE — LAYER 2 unit tests (engine)
 * Run:  node --test tests
 * The engine is pure, so every rule in PRODUCT_DEVELOPMENT.md §7 is provable here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  distributeQuestions,
  passThreshold,
  autoTimerFor,
  autoPassPolicy,
} from '../packages/game-engine/engine.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Build a synthetic package: `perStage` questions in each of 5 stages. */
function syntheticPackage({ perStage = 1, settings = {}, reserves = 0, classLevel = 5 } = {}) {
  const questions = [];
  const stages = [];
  for (let s = 1; s <= 5; s++) {
    const ids = [];
    for (let i = 1; i <= perStage; i++) {
      const id = `q_${s}_${i}`;
      ids.push(id);
      questions.push({
        question_id: id,
        stage: s,
        question: `Stage ${s} question ${i}?`,
        options: { A: 'Alpha', B: 'Beta', C: 'Gamma', D: 'Delta' },
        correct_option: 'A',
        explanation: `Because alpha is right for stage ${s}.`,
        clue: 'Think about the first letter of the Greek alphabet.',
        difficulty: ['very_easy', 'easy', 'medium', 'hard', 'highest'][s - 1],
        concept_tag: `stage-${s}`,
      });
    }
    stages.push({ stage: s, name: `Stage ${s}`, difficulty: 'easy', question_ids: ids });
  }
  for (let r = 1; r <= reserves; r++) {
    const s = ((r - 1) % 5) + 1;
    questions.push({
      question_id: `r_${r}`,
      stage: s,
      question: `Reserve question ${r}?`,
      options: { A: 'Alpha', B: 'Beta', C: 'Gamma', D: 'Delta' },
      correct_option: 'A',
      explanation: 'Reserve explanation.',
      clue: 'Reserve clue here.',
      difficulty: 'medium',
      concept_tag: `reserve-${s}`,
    });
  }
  return {
    schema_version: '1.0',
    quiz_id: 'qz_test',
    title: 'Test Quiz',
    class_level: classLevel,
    topic: 'Testing',
    language: 'en',
    settings: {
      timer_seconds: 30,
      stage_pass_ratio: 0.6,
      final_stage_ratio: 0.6,
      always_advance: false,
      points_mode: 'points',
      stage_points: [100, 200, 300, 500, 1000],
      lifelines: { half_half: 1, clue: 1, second_chance: 1, change_question: 1 },
      ...settings,
    },
    stages,
    questions,
  };
}

/** Answer the current question. */
function answer(game, key = 'A') {
  game.selectOption(key);
  return game.reveal();
}

/** Play the whole game, always answering `key`. */
function playAll(game, key = 'A') {
  const events = [];
  for (let guard = 0; guard < 200; guard++) {
    const view = game.getView();
    if (['WINNER', 'NOT_CLEARED', 'ABORTED'].includes(view.status)) break;
    if (view.status === 'BRIEFING') { game.start(); continue; }
    if (view.status === 'QUESTION_READY') { answer(game, key); continue; }
    if (view.status === 'REVEAL_WRONG' && view.canSecondChance) { game.next(); continue; }
    if (['REVEAL_CORRECT', 'REVEAL_WRONG'].includes(view.status)) { events.push(game.next()); continue; }
    if (view.status === 'STAGE_COMPLETE') { events.push(game.next()); continue; }
    throw new Error(`unexpected status ${view.status}`);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* 1. pure helpers                                                     */
/* ------------------------------------------------------------------ */

test('distributeQuestions never leaves an empty stage', () => {
  assert.deepEqual(distributeQuestions(15), [3, 3, 3, 3, 3]);
  assert.deepEqual(distributeQuestions(5), [1, 1, 1, 1, 1]);
  assert.deepEqual(distributeQuestions(10), [2, 2, 2, 2, 2]);
  assert.deepEqual(distributeQuestions(20), [4, 4, 4, 4, 4]);
  assert.deepEqual(distributeQuestions(25), [5, 5, 5, 5, 5]);
  assert.deepEqual(distributeQuestions(7), [2, 2, 1, 1, 1]);
  assert.ok(distributeQuestions(5).every((n) => n >= 1));
});

test('passThreshold follows the 60% rule', () => {
  assert.equal(passThreshold(3, 0.6), 2);
  assert.equal(passThreshold(1, 0.6), 1);
  assert.equal(passThreshold(5, 0.6), 3);
  assert.equal(passThreshold(3, 0.6, true), 0);
  assert.equal(passThreshold(3, 0), 0);
});

test('auto timer and auto pass policy are class-aware', () => {
  assert.equal(autoTimerFor(1), 45);
  assert.equal(autoTimerFor(2), 45);
  assert.equal(autoTimerFor(5), 30);
  assert.equal(autoPassPolicy(2).always_advance, true);
  assert.equal(autoPassPolicy(2).stage_pass_ratio, 0);
  assert.equal(autoPassPolicy(2).final_stage_ratio, 0.5);
  assert.equal(autoPassPolicy(8).always_advance, false);
});

/* ------------------------------------------------------------------ */
/* 2. happy path, scoring, winner                                      */
/* ------------------------------------------------------------------ */

test('a perfect game is a WINNER with full score', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  playAll(game, 'A');

  const result = game.getResult();
  assert.equal(result.status, 'WINNER');
  assert.equal(result.score, 2100, '100+200+300+500+1000');
  assert.equal(result.max_score, 2100);
  assert.equal(result.correct, 5);
  assert.equal(result.incorrect, 0);
  assert.equal(result.accuracy, 100);
  assert.equal(result.stages_cleared, 5);
  assert.equal(result.stage_reached, 5);
  assert.equal(result.per_stage.length, 5);
  assert.equal(result.per_question.length, 5);
  assert.ok(result.per_question.every((r) => r.is_correct === true));
});

test('score is awarded per stage (100/200/300/500/1000)', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  answer(game, 'A');
  assert.equal(game.getView().score, 100);
  game.next();        // stage complete
  game.next();        // stage 2
  answer(game, 'A');
  assert.equal(game.getView().score, 300);
  game.next(); game.next();
  answer(game, 'A');
  assert.equal(game.getView().score, 600);
});

test('a wrong answer at the end of stage 5 ends as NOT_CLEARED, never as failure language', () => {
  const game = createGame(syntheticPackage({ perStage: 1, settings: { stage_pass_ratio: 0, final_stage_ratio: 0.6 } }));
  game.start();
  // stages 1-4 free pass due to ratio 0, stage 5 must be earned
  for (let s = 1; s <= 4; s++) { answer(game, 'A'); game.next(); game.next(); }
  const reveal = answer(game, 'B');
  assert.equal(reveal.isCorrect, false);
  game.next();
  assert.equal(game.getView().status, 'NOT_CLEARED');
  const result = game.getResult();
  assert.equal(result.status, 'NOT_CLEARED');
  assert.equal(result.stage_reached, 5);
  assert.equal(result.stages_cleared, 4);
  assert.ok(result.score > 0);
});

test('Classes 1–2 are never eliminated before the final stage', () => {
  const pkg = syntheticPackage({ perStage: 2, classLevel: 1 });
  pkg.settings.always_advance = true;
  pkg.settings.stage_pass_ratio = 0;
  pkg.settings.final_stage_ratio = 0.5;
  const game = createGame(pkg);
  game.start();
  // answer everything wrong on purpose
  for (let guard = 0; guard < 100; guard++) {
    const v = game.getView();
    if (['WINNER', 'NOT_CLEARED'].includes(v.status)) break;
    if (v.status === 'QUESTION_READY') { answer(game, 'B'); continue; }
    if (v.status === 'REVEAL_WRONG' && v.canSecondChance) { game.next(); continue; }
    if (['REVEAL_CORRECT', 'REVEAL_WRONG', 'STAGE_COMPLETE'].includes(v.status)) { game.next(); continue; }
  }
  const result = game.getResult();
  assert.equal(result.stage_reached, 5, 'a Class 1 child always reaches stage 5');
  assert.equal(result.status, 'NOT_CLEARED', 'but the winner badge is still earned');
});

test('empty stage is rejected by the engine', () => {
  const pkg = syntheticPackage({ perStage: 1 });
  const stageNo = 3;
  pkg.stages[stageNo - 1].question_ids = [];
  pkg.questions = pkg.questions.filter((q) => q.stage !== stageNo);
  assert.throws(() => createGame(pkg), /at least one question/);
  assert.throws(() => createGame({ questions: [] }), /no questions/);
});

test('a stage left without question_ids is rebuilt from the questions themselves', () => {
  const pkg = syntheticPackage({ perStage: 1 });
  pkg.stages[2].question_ids = [];
  const game = createGame(pkg); // must NOT throw: questions still carry stage 3
  game.start();
  assert.equal(game.getView().rail[2].questions, 1);
});

/* ------------------------------------------------------------------ */
/* 3. answer flow: suspense, reveal, second chance                     */
/* ------------------------------------------------------------------ */

test('answer flow moves QUESTION_READY -> SUSPENSE -> REVEAL_*', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  assert.equal(game.getView().status, 'QUESTION_READY');
  game.selectOption('A');
  assert.equal(game.getView().status, 'SUSPENSE');
  game.reveal();
  assert.equal(game.getView().status, 'REVEAL_CORRECT');
});

test('reveal() is only valid from SUSPENSE and selectOption() guards bad keys', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  assert.equal(game.reveal().reason, 'not_in_suspense');
  assert.equal(game.selectOption('Z').reason, 'invalid_option');
  game.selectOption('A');
  assert.equal(game.selectOption('B').reason, 'not_ready');
});

test('SECOND CHANCE revives the question, disables the wrong pick and pays 50%', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  const first = answer(game, 'B');
  assert.equal(first.isCorrect, false);
  assert.equal(first.canSecondChance, true);

  const life = game.useLifeline('second_chance');
  assert.equal(life.ok, true);
  const view = game.getView();
  assert.equal(view.status, 'QUESTION_READY');
  assert.equal(view.options.find((o) => o.key === 'B').state, 'disabled');

  const second = answer(game, 'A');
  assert.equal(second.isCorrect, true);
  assert.equal(second.assisted, true);
  assert.equal(second.points, 50, '50% of stage 1 (100 points)');
  assert.equal(game.getView().score, 50);

  const rec = game.getResult().per_question[0];
  assert.equal(rec.assisted, true);
  assert.equal(rec.is_correct, true);
});

test('CONTINUE after a wrong answer is always allowed — a lifeline is never forced', () => {
  const game = createGame(syntheticPackage({ perStage: 3 }));
  game.start();
  answer(game, 'B');
  const move = game.next();
  assert.equal(move.ok, true);
  assert.equal(move.transition, 'next_question', 'the game continued without the rescue');
  assert.equal(game.getView().status, 'QUESTION_READY');
  assert.equal(
    game.getView().lifelines.find((l) => l.kind === 'second_chance').remaining,
    1,
    'the rescue is still available later in the game',
  );
});

test('SECOND CHANCE is unavailable once used and cannot resurrect a correct answer', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  answer(game, 'A');
  assert.equal(game.getView().canSecondChance, false);
  assert.equal(game.useLifeline('second_chance').reason, 'not_available');
});

/* ------------------------------------------------------------------ */
/* 4. lifelines                                                        */
/* ------------------------------------------------------------------ */

test('HALF & HALF hides exactly two wrong options and never the correct one', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  const res = game.useLifeline('half_half');
  assert.equal(res.ok, true);
  assert.equal(res.hidden.length, 2);
  assert.ok(!res.hidden.includes('A'), 'correct option must stay visible');
  const view = game.getView();
  assert.equal(view.options.filter((o) => o.state === 'hidden').length, 2);
  assert.equal(view.lifelines.find((l) => l.kind === 'half_half').remaining, 0);
  assert.equal(game.useLifeline('half_half').reason, 'already_used');
  assert.equal(game.selectOption(res.hidden[0]).reason, 'hidden_option');
});

test('CLASSROOM CLUE appears once and is recorded', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  const res = game.useLifeline('clue');
  assert.equal(res.ok, true);
  assert.equal(game.getView().clueVisible, true);
  assert.ok(game.getView().clueText.length > 0);
  assert.equal(game.useLifeline('clue').reason, 'already_used');
  assert.ok(game.getResult().lifelines_used.includes('clue'));
});

test('CHANGE QUESTION swaps in an unseen reserve of the same stage', () => {
  const game = createGame(syntheticPackage({ perStage: 1, reserves: 5 }));
  game.start();
  const before = game.getView().question.question_id;
  const res = game.useLifeline('change_question');
  assert.equal(res.ok, true);
  const after = game.getView().question.question_id;
  assert.notEqual(before, after);
  assert.equal(game.getView().status, 'QUESTION_READY');
  assert.ok(after.startsWith('r_'), 'must come from the reserve pool');
  assert.equal(game.getView().questionIndex, 0, 'same slot, equivalent difficulty');
});

test('CHANGE QUESTION refunds itself when the reserve pool is exhausted', () => {
  const game = createGame(syntheticPackage({
    perStage: 1,
    reserves: 1,
    settings: { lifelines: { half_half: 1, clue: 1, second_chance: 1, change_question: 2 } },
  }));
  game.start();
  assert.equal(game.useLifeline('change_question').ok, true);
  const second = game.useLifeline('change_question');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'no_replacement');
  assert.equal(second.refunded, true);
  assert.equal(
    game.getView().lifelines.find((l) => l.kind === 'change_question').remaining,
    1,
    'a refused swap must not consume the lifeline',
  );
  assert.equal(game.getView().reservesLeft, 0);
});

test('lifelines can be switched off by the teacher', () => {
  const game = createGame(syntheticPackage({
    perStage: 1,
    settings: { lifelines: { half_half: 0, clue: 0, second_chance: 0, change_question: 0 } },
  }));
  game.start();
  for (const kind of ['half_half', 'clue', 'second_chance', 'change_question']) {
    const res = game.useLifeline(kind);
    assert.equal(res.ok, false, `${kind} should be disabled`);
    assert.ok(['already_used', 'not_available', 'not_ready'].includes(res.reason));
  }
});

/* ------------------------------------------------------------------ */
/* 5. timer                                                            */
/* ------------------------------------------------------------------ */

test('timer counts down, pauses and resumes deterministically', () => {
  let clock = 1_000_000;
  const game = createGame(syntheticPackage({ perStage: 1 }), { now: () => clock });
  game.start();
  assert.equal(game.getTimeRemainingMs(), 30_000);
  clock += 5_000;
  assert.equal(game.getTimeRemainingMs(), 25_000);
  game.pause();
  clock += 10_000;
  assert.equal(game.getView().timeRemainingMs, null, 'timer frozen while paused');
  game.resume();
  assert.equal(game.getTimeRemainingMs(), 25_000, 'pause time is not charged to the student');
  clock += 25_000;
  assert.equal(game.getTimeRemainingMs(), 0);
});

test('timeout counts as an incorrect attempt and can still be rescued', () => {
  let clock = 5_000;
  const game = createGame(syntheticPackage({ perStage: 1 }), { now: () => clock });
  game.start();
  clock += 31_000;
  const res = game.timeout();
  assert.equal(res.isCorrect, false);
  assert.equal(res.timedOut, true);
  assert.equal(game.getView().status, 'REVEAL_WRONG');
  assert.equal(game.getView().canSecondChance, true);
});

test('timer off means no countdown at all', () => {
  const game = createGame(syntheticPackage({ perStage: 1, settings: { timer_seconds: 0 } }));
  game.start();
  assert.equal(game.getTimeRemainingMs(), null);
  assert.equal(game.getView().timerSeconds, null);
});

/* ------------------------------------------------------------------ */
/* 6. view model, rail, results                                        */
/* ------------------------------------------------------------------ */

test('view model exposes six option states for Layer 3', () => {
  const game = createGame(syntheticPackage({ perStage: 2 }));
  game.start();
  game.useLifeline('half_half');
  game.selectOption('A');
  const selectedView = game.getView();
  assert.equal(selectedView.options.find((o) => o.key === 'A').state, 'selected');
  game.reveal();
  const revealed = game.getView();
  assert.equal(revealed.options.find((o) => o.key === 'A').state, 'correct');
  assert.ok(revealed.options.some((o) => o.state === 'wrong' || o.state === 'dimmed' || o.state === 'hidden'));
});

test('rail tracks cleared/current/locked stages', () => {
  const game = createGame(syntheticPackage({ perStage: 1 }));
  game.start();
  let rail = game.getView().rail;
  assert.equal(rail[0].current, true);
  assert.equal(rail[1].locked, true);
  answer(game, 'A');
  game.next();      // stage complete
  rail = game.getView().rail;
  assert.equal(rail[0].cleared, true);
  game.next();      // into stage 2
  rail = game.getView().rail;
  assert.equal(rail[1].current, true);
  assert.equal(rail[1].locked, false);
});

test('wrong answers are recorded with time, difficulty and concept tag', () => {
  let clock = 0;
  const game = createGame(syntheticPackage({ perStage: 1 }), { now: () => clock });
  game.start();
  clock += 12_000;
  answer(game, 'B');
  const rec = game.getResult().per_question[0];
  assert.equal(rec.is_correct, false);
  assert.equal(rec.selected_option, 'B');
  assert.equal(rec.correct_option, 'A');
  assert.equal(rec.time_seconds, 12);
  assert.equal(rec.difficulty, 'very_easy');
  assert.equal(rec.concept_tag, 'stage-1');
});

test('abort() ends the session and still produces a reportable result', () => {
  const game = createGame(syntheticPackage({ perStage: 2 }));
  game.start();
  answer(game, 'A');
  const res = game.abort('teacher_ended');
  assert.equal(res.status, 'ABORTED');
  assert.equal(res.result.status, 'ABORTED');
  assert.equal(res.result.questions_answered, 1);
  assert.equal(game.abort().reason, 'already_finished');
});

test('max_score covers every question in the package', () => {
  const game = createGame(syntheticPackage({ perStage: 3 }));
  game.start();
  const view = game.getView();
  assert.equal(view.maxScore, 3 * (100 + 200 + 300 + 500 + 1000));
  assert.equal(view.questionsInStage, 3);
  assert.equal(view.stageCount, 5);
});

test('replaying the same package is deterministic with a seeded rng', () => {
  const makeRng = () => {
    let s = 42;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  };
  const run = () => {
    const game = createGame(syntheticPackage({ perStage: 2, reserves: 4 }), { rng: makeRng(), now: () => 0 });
    game.start();
    const hidden = game.useLifeline('half_half').hidden;
    playAll(game, 'A');
    return { hidden, result: game.getResult() };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.hidden, b.hidden);
  assert.equal(a.result.score, b.result.score);
  assert.equal(a.result.accuracy, b.result.accuracy);
});
