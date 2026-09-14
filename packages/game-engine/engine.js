/**
 * QUIZVERSE — LAYER 2 : GAME ENGINE
 * ---------------------------------------------------------------------------
 * Pure, deterministic, framework-free. Zero DOM. Zero AI. Zero network.
 * This module is the heart of the product: the emotional loop is encoded here.
 *
 *   Anticipation -> Choice -> Suspense -> Reveal -> Reward -> Progress -> Challenge -> Achievement
 *
 * It plays ONLY from a frozen Quiz Package (see PRODUCT_DEVELOPMENT.md §8.3).
 * Unit-tested in /tests/engine.test.mjs (node --test).
 */

export const STAGE_COUNT = 5;

export const STAGE_NAMES = [
  'Warm-Up',
  'Starter Challenge',
  'Think Smart',
  'Brain Challenge',
  'Final Challenge',
];

export const LIFELINE_KINDS = ['half_half', 'clue', 'second_chance', 'change_question'];

export const DEFAULT_STAGE_POINTS = [100, 200, 300, 500, 1000];

export const DEFAULT_SETTINGS = {
  timer_seconds: 30,
  stage_pass_ratio: 0.6,
  /** Final stage is never free: even Classes 1–2 must earn the WINNER moment (§7.3). */
  final_stage_ratio: 0.6,
  always_advance: false,
  points_mode: 'points', // 'points' | 'correct_only'
  stage_points: DEFAULT_STAGE_POINTS,
  second_chance_ratio: 0.5,
  lifelines: { half_half: 1, clue: 1, second_chance: 1, change_question: 1 },
  sound: true,
  music: true,
  mascot: true,
};

/** Auto timer rule from PRODUCT_DEVELOPMENT.md §7.6 */
export function autoTimerFor(classLevel) {
  return Number(classLevel) <= 2 ? 45 : 30;
}

/**
 * Auto pass policy: Classes 1–2 are never eliminated (they always reach Stage 5),
 * but the final stage still has to be earned so the WINNER moment means something.
 */
export function autoPassPolicy(classLevel) {
  return Number(classLevel) <= 2
    ? { always_advance: true, stage_pass_ratio: 0, final_stage_ratio: 0.5 }
    : { always_advance: false, stage_pass_ratio: 0.6, final_stage_ratio: 0.6 };
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Distribute N questions across 5 stages. Never creates an empty stage (§7.2). */
export function distributeQuestions(count, stageCount = STAGE_COUNT) {
  const total = Math.max(stageCount, Math.floor(count));
  const base = Math.floor(total / stageCount);
  const remainder = total % stageCount;
  return Array.from({ length: stageCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Correct answers needed to clear a stage. 3 questions @0.6 -> 2. 1 question -> 1. */
export function passThreshold(questionCount, ratio = 0.6, alwaysAdvance = false) {
  if (alwaysAdvance || !ratio || ratio <= 0) return 0;
  return Math.max(1, Math.ceil(questionCount * ratio));
}

function normalizeSettings(settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.stage_points = Array.isArray(s.stage_points) && s.stage_points.length === STAGE_COUNT
    ? s.stage_points.slice()
    : DEFAULT_STAGE_POINTS.slice();
  s.lifelines = { ...DEFAULT_SETTINGS.lifelines, ...(settings && settings.lifelines ? settings.lifelines : {}) };
  if (s.timer_seconds === undefined) s.timer_seconds = 30;
  return s;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Game factory                                                        */
/* ------------------------------------------------------------------ */

export function createGame(quizPackage, options = {}) {
  const now = options.now || (() => Date.now());
  const rng = options.rng || Math.random;

  if (!quizPackage || !Array.isArray(quizPackage.questions) || !quizPackage.questions.length) {
    throw new Error('ENGINE: quiz package has no questions');
  }

  const settings = normalizeSettings(quizPackage.settings);
  const stageList = (quizPackage.stages || []).slice().sort((a, b) => a.stage - b.stage);
  const byId = new Map(quizPackage.questions.map((q) => [q.question_id, q]));

  /* ---- build stage queues + reserve pool ---------------------------------- */
  const primaryIds = new Set();
  const queues = stageList.map((stage) => {
    const ids = (stage.question_ids && stage.question_ids.length
      ? stage.question_ids
      : quizPackage.questions.filter((q) => q.stage === stage.stage).map((q) => q.question_id)
    ).filter((id) => byId.has(id));
    ids.forEach((id) => primaryIds.add(id));
    return ids;
  });
  if (!queues.length || queues.some((q) => q.length === 0)) {
    throw new Error('ENGINE: every stage must contain at least one question');
  }

  const reservePool = quizPackage.questions.filter((q) => !primaryIds.has(q.question_id));
  const usedReserveIds = new Set();

  /* ---- mutable session state -------------------------------------------- */
  const records = new Map(); // "stageIdx:qIdx" -> record
  const perStageCorrect = queues.map(() => 0);
  const perStageTotal = queues.map((q) => q.length);
  const stageSummary = queues.map(() => null);
  const lifelines = {};
  for (const kind of LIFELINE_KINDS) {
    const limit = settings.lifelines[kind] ?? 0;
    lifelines[kind] = { kind, limit, remaining: limit, used: limit > 0 ? 0 : 0, disabled: !limit };
  }

  const state = {
    status: 'BRIEFING',
    stageIndex: 0,
    questionIndex: 0,
    question: null,
    questionShownAt: 0,
    hiddenOptions: [],
    disabledOptions: [],
    usedSecondChanceHere: false,
    clueVisible: false,
    selectedOption: null,
    reveal: null,
    score: 0,
    lifelinesUsed: [],
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
    reason: null,
  };

  const stagePoints = (stageIdx) =>
    settings.points_mode === 'correct_only' ? 0 : settings.stage_points[stageIdx] ?? 0;

  const maxScore = queues.reduce(
    (sum, q, idx) => sum + q.length * stagePoints(idx),
    0,
  );

  function currentStageQuestions() {
    return queues[state.stageIndex];
  }

  function setupQuestion() {
    const id = currentStageQuestions()[state.questionIndex];
    state.question = byId.get(id) || null;
    state.questionShownAt = now();
    state.hiddenOptions = [];
    state.disabledOptions = [];
    state.usedSecondChanceHere = false;
    state.clueVisible = false;
    state.selectedOption = null;
    state.reveal = null;
    state.pausedAt = null;
    state.pausedTotalMs = 0;
    if (!state.startedAt) state.startedAt = now();
    state.status = 'QUESTION_READY';
  }

  function recordKey(stageIdx = state.stageIndex, qIdx = state.questionIndex) {
    return `${stageIdx}:${qIdx}`;
  }

  function writeRecord(patch) {
    const key = recordKey();
    const prev = records.get(key) || {
      question_id: state.question.question_id,
      stage: state.stageIndex + 1,
      selected_option: null,
      correct_option: state.question.correct_option,
      is_correct: false,
      assisted: false,
      time_seconds: 0,
      difficulty: state.question.difficulty || null,
      concept_tag: state.question.concept_tag || null,
    };
    records.set(key, { ...prev, ...patch });
  }

  function canSecondChance() {
    return (
      state.status === 'REVEAL_WRONG' &&
      !state.usedSecondChanceHere &&
      lifelines.second_chance.remaining > 0 &&
      state.reveal &&
      !state.reveal.isCorrect
    );
  }

  /**
   * Correct answers needed to clear a given stage.
   * always_advance (Classes 1–2) softens stages 1–4 but NEVER the final stage.
   */
  function stageThreshold(stageIdx) {
    const total = perStageTotal[stageIdx];
    const isFinal = stageIdx === queues.length - 1;
    if (settings.always_advance && !isFinal) return 0;
    const ratio = isFinal
      ? (settings.final_stage_ratio ?? settings.stage_pass_ratio)
      : settings.stage_pass_ratio;
    return passThreshold(total, ratio, false);
  }

  function finishStage() {
    const total = perStageTotal[state.stageIndex];
    const threshold = stageThreshold(state.stageIndex);
    const summary = {
      stage: state.stageIndex + 1,
      name: stageList[state.stageIndex]?.name || STAGE_NAMES[state.stageIndex],
      correct: perStageCorrect[state.stageIndex],
      total,
      threshold,
      passed: perStageCorrect[state.stageIndex] >= threshold,
      score: perStageCorrect[state.stageIndex] * stagePoints(state.stageIndex),
    };
    stageSummary[state.stageIndex] = summary;
    return summary;
  }

  function buildResult(status) {
    const perQuestion = [];
    const perStage = [];
    for (let s = 0; s < queues.length; s++) {
      let correct = 0;
      let answered = 0;
      for (let i = 0; i < queues[s].length; i++) {
        const rec = records.get(`${s}:${i}`);
        if (!rec) continue;
        answered++;
        if (rec.is_correct) correct++;
        perQuestion.push({ ...rec });
      }
      perStage.push({
        stage: s + 1,
        correct,
        total: queues[s].length,
        answered,
        passed: stageSummary[s] ? stageSummary[s].passed : null,
        score: correct * stagePoints(s),
      });
    }
    const totalQuestions = queues.reduce((n, q) => n + q.length, 0);
    const answeredCount = perQuestion.length;
    const correctCount = perQuestion.filter((r) => r.is_correct).length;
    const timeTaken = state.startedAt !== null && state.startedAt !== undefined
      ? Math.max(0, Math.round(((state.endedAt || now()) - state.startedAt - state.pausedTotalMs) / 1000))
      : 0;
    const stagesCleared = stageSummary.filter((s) => s && s.passed).length;

    return {
      session_id: quizPackage.session_id || `s_${Math.floor(rng() * 1e6).toString(36)}`,
      quiz_id: quizPackage.quiz_id || null,
      quiz_title: quizPackage.title || null,
      student_name: quizPackage.student_name || 'Champion',
      class_level: quizPackage.class_level || null,
      topic: quizPackage.topic || null,
      score: state.score,
      max_score: maxScore,
      accuracy: answeredCount ? Math.round((correctCount / answeredCount) * 1000) / 10 : 0,
      questions_total: totalQuestions,
      questions_answered: answeredCount,
      correct: correctCount,
      incorrect: answeredCount - correctCount,
      assisted_count: perQuestion.filter((r) => r.assisted).length,
      stage_reached: state.stageIndex + 1,
      stages_cleared: stagesCleared,
      time_taken_seconds: timeTaken,
      lifelines_used: state.lifelinesUsed.slice(),
      status,
      per_stage: perStage,
      per_question: perQuestion,
    };
  }

  function endGame(status, reason = null) {
    state.endedAt = now();
    state.reason = reason;
    state.status = status;
    return { status, result: buildResult(status) };
  }

  /* ---- public API ------------------------------------------------------- */
  const api = {
    /** Begin the game. Moves BRIEFING -> first question. */
    start() {
      if (state.status !== 'BRIEFING') throw new Error('ENGINE: start() only valid from BRIEFING');
      setupQuestion();
      return api.getView();
    },

    /** Lock an option. STATUS: QUESTION_READY -> SUSPENSE. */
    selectOption(key) {
      if (state.status !== 'QUESTION_READY') return { ok: false, reason: 'not_ready' };
      if (!state.question || !state.question.options[key]) return { ok: false, reason: 'invalid_option' };
      if (state.hiddenOptions.includes(key)) return { ok: false, reason: 'hidden_option' };
      if (state.disabledOptions.includes(key)) return { ok: false, reason: 'disabled_option' };
      state.selectedOption = key;
      state.status = 'SUSPENSE';
      return { ok: true, status: state.status };
    },

    /** Resolve the locked option. STATUS: SUSPENSE -> REVEAL_CORRECT | REVEAL_WRONG. */
    reveal() {
      if (state.status !== 'SUSPENSE') return { ok: false, reason: 'not_in_suspense' };
      const q = state.question;
      const isCorrect = state.selectedOption === q.correct_option;
      const elapsed = Math.round(((now() - state.questionShownAt) - state.pausedTotalMs) / 1000);
      const base = stagePoints(state.stageIndex);
      const assisted = state.usedSecondChanceHere;
      const points = isCorrect
        ? assisted
          ? Math.round(base * (settings.second_chance_ratio ?? 0.5))
          : base
        : 0;

      if (isCorrect) {
        state.score += points;
        perStageCorrect[state.stageIndex] += 1;
      }
      writeRecord({
        selected_option: state.selectedOption,
        is_correct: isCorrect,
        assisted,
        time_seconds: Math.max(0, elapsed),
      });

      state.reveal = {
        isCorrect,
        selectedOption: state.selectedOption,
        correctOption: q.correct_option,
        points,
        assisted,
        explanation: q.explanation || '',
        simpleExplanation: q.simple_explanation || q.explanation || '',
        canSecondChance: false,
      };
      state.status = isCorrect ? 'REVEAL_CORRECT' : 'REVEAL_WRONG';
      state.reveal.canSecondChance = canSecondChance();
      return { ok: true, ...state.reveal, status: state.status };
    },

    /** Time ran out — counts as an incorrect attempt (§7.6), second chance may rescue it. */
    timeout() {
      if (state.status !== 'QUESTION_READY' && state.status !== 'SUSPENSE') {
        return { ok: false, reason: 'not_ready' };
      }
      if (state.status === 'QUESTION_READY') state.selectedOption = null;
      state.status = 'SUSPENSE';
      const res = api.reveal();
      if (res.ok) res.timedOut = true;
      return res;
    },

    /**
     * Use a lifeline.
     * half_half / clue / change_question -> QUESTION_READY
     * second_chance -> only from REVEAL_WRONG, revives the question (50% points if rescued)
     */
    useLifeline(kind) {
      const life = lifelines[kind];
      if (!life) return { ok: false, reason: 'unknown_lifeline' };
      if (life.remaining <= 0) return { ok: false, reason: 'already_used' };

      if (kind === 'half_half') {
        if (state.status !== 'QUESTION_READY') return { ok: false, reason: 'not_ready' };
        const wrongKeys = Object.keys(state.question.options).filter(
          (k) => k !== state.question.correct_option
            && !state.hiddenOptions.includes(k)
            && !state.disabledOptions.includes(k),
        );
        if (wrongKeys.length < 2) return { ok: false, reason: 'no_effect' };
        const hide = shuffle(wrongKeys, rng).slice(0, 2);
        state.hiddenOptions = state.hiddenOptions.concat(hide);
        life.remaining--; life.used++;
        state.lifelinesUsed.push(kind);
        return { ok: true, kind, hidden: hide, effect: 'options_hidden' };
      }

      if (kind === 'clue') {
        if (state.status !== 'QUESTION_READY') return { ok: false, reason: 'not_ready' };
        if (state.clueVisible) return { ok: false, reason: 'already_used' };
        state.clueVisible = true;
        life.remaining--; life.used++;
        state.lifelinesUsed.push(kind);
        return { ok: true, kind, clue: state.question.clue || '', effect: 'clue_shown' };
      }

      if (kind === 'second_chance') {
        if (!canSecondChance()) return { ok: false, reason: 'not_available' };
        if (state.selectedOption) state.disabledOptions.push(state.selectedOption);
        state.usedSecondChanceHere = true;
        state.selectedOption = null;
        state.reveal = null;
        state.pausedAt = null;
        state.status = 'QUESTION_READY';
        life.remaining--; life.used++;
        state.lifelinesUsed.push(kind);
        return { ok: true, kind, effect: 'question_revived', disabled: state.disabledOptions.slice() };
      }

      if (kind === 'change_question') {
        if (state.status !== 'QUESTION_READY') return { ok: false, reason: 'not_ready' };
        const stageNo = state.stageIndex + 1;
        const pool = reservePool.filter(
          (q) => !usedReserveIds.has(q.question_id)
            && !queues.some((queue) => queue.includes(q.question_id)),
        );
        const sameStage = pool.filter((q) => q.stage === stageNo);
        const candidates = sameStage.length ? sameStage : pool;
        if (!candidates.length) return { ok: false, reason: 'no_replacement', refunded: true };
        const replacement = pick(candidates, rng);
        usedReserveIds.add(replacement.question_id);
        queues[state.stageIndex][state.questionIndex] = replacement.question_id;
        life.remaining--; life.used++;
        state.lifelinesUsed.push(kind);
        setupQuestion();
        return {
          ok: true,
          kind,
          effect: 'question_changed',
          newQuestionId: replacement.question_id,
        };
      }

      return { ok: false, reason: 'unknown_lifeline' };
    },

    /** Continue: next question -> stage complete -> next stage -> winner / not cleared. */
    next() {
      if (state.status === 'PAUSED') return { ok: false, reason: 'paused' };

      if (state.status === 'REVEAL_CORRECT' || state.status === 'REVEAL_WRONG') {
        state.questionIndex += 1;
        if (state.questionIndex < currentStageQuestions().length) {
          setupQuestion();
          return { ok: true, transition: 'next_question', status: state.status };
        }
        const summary = finishStage();
        if (!summary.passed) {
          // Stage not cleared -> game ends with the encouraging "GREAT EFFORT" screen (§S10).
          const ended = endGame('NOT_CLEARED');
          return { ok: true, transition: 'not_cleared', status: ended.status, summary, result: ended.result };
        }
        state.status = 'STAGE_COMPLETE';
        return { ok: true, transition: 'stage_complete', status: state.status, summary };
      }

      if (state.status === 'STAGE_COMPLETE') {
        const summary = stageSummary[state.stageIndex];
        if (!summary || !summary.passed) return { ok: false, reason: 'stage_not_passed' };
        if (state.stageIndex === queues.length - 1) {
          const ended = endGame('WINNER');
          return { ok: true, transition: 'winner', status: ended.status, result: ended.result };
        }
        state.stageIndex += 1;
        state.questionIndex = 0;
        setupQuestion();
        return { ok: true, transition: 'next_stage', status: state.status, stage: state.stageIndex + 1 };
      }

      return { ok: false, reason: 'not_ready', status: state.status };
    },

    pause() {
      if (state.status === 'PAUSED') return { ok: true };
      if (!['QUESTION_READY', 'SUSPENSE'].includes(state.status)) return { ok: false, reason: 'not_pausable' };
      state.resumeStatus = state.status;
      state.pausedAt = now();
      state.status = 'PAUSED';
      return { ok: true, status: state.status };
    },

    resume() {
      if (state.status !== 'PAUSED') return { ok: false, reason: 'not_paused' };
      const delta = now() - state.pausedAt;
      state.pausedTotalMs += delta;
      state.pausedAt = null;
      state.status = state.resumeStatus || 'QUESTION_READY';
      return { ok: true, status: state.status };
    },

    abort(reason = 'teacher_ended') {
      if (state.status === 'WINNER' || state.status === 'NOT_CLEARED' || state.status === 'ABORTED') {
        return { ok: false, reason: 'already_finished' };
      }
      return { ok: true, ...endGame('ABORTED', reason) };
    },

    /** Milliseconds left on the current question, or null when the timer is off. */
    getTimeRemainingMs() {
      if (!settings.timer_seconds) return null;
      if (state.status === 'PAUSED') return null;
      const base = state.questionShownAt + settings.timer_seconds * 1000;
      return Math.max(0, base - (now() - state.pausedTotalMs));
    },

    /* ---- view model for Layer 3 ----------------------------------------- */
    getView() {
      const q = state.question;
      const revealed = state.reveal;
      const options = q
        ? Object.keys(q.options).map((key) => {
            let optionState = 'normal';
            if (state.disabledOptions.includes(key)) optionState = 'disabled';
            if (state.hiddenOptions.includes(key)) optionState = 'hidden';
            if (revealed) {
              if (key === revealed.correctOption) optionState = 'correct';
              else if (key === revealed.selectedOption) optionState = 'wrong';
              else if (optionState === 'normal') optionState = 'dimmed';
            } else if (key === state.selectedOption) {
              optionState = 'selected';
            }
            return { key, text: q.options[key], state: optionState };
          })
        : [];

      const rail = queues.map((queue, idx) => ({
        stage: idx + 1,
        name: stageList[idx]?.name || STAGE_NAMES[idx],
        cleared: !!(stageSummary[idx] && stageSummary[idx].passed),
        current: idx === state.stageIndex,
        locked: idx > state.stageIndex,
        questions: queue.length,
      }));

      return {
        status: state.status,
        stageIndex: state.stageIndex,
        stageNumber: state.stageIndex + 1,
        stageName: stageList[state.stageIndex]?.name || STAGE_NAMES[state.stageIndex],
        stageCount: queues.length,
        questionIndex: state.questionIndex,
        questionInStage: state.questionIndex + 1,
        questionsInStage: currentStageQuestions().length,
        question: q
          ? {
              question_id: q.question_id,
              question: q.question,
              illustration: q.illustration || null,
              difficulty: q.difficulty || null,
              concept_tag: q.concept_tag || null,
            }
          : null,
        options,
        clueVisible: state.clueVisible,
        clueText: q ? q.clue || '' : '',
        reveal: revealed,
        stageSummary: stageSummary[state.stageIndex],
        score: state.score,
        maxScore,
        timeRemainingMs: api.getTimeRemainingMs(),
        timerSeconds: settings.timer_seconds || null,
        lifelines: LIFELINE_KINDS.map((kind) => ({ ...lifelines[kind] })),
        rail,
        canSecondChance: canSecondChance(),
        canContinue: ['REVEAL_CORRECT'].includes(state.status)
          || (state.status === 'REVEAL_WRONG' && !canSecondChance()),
        reservesLeft: reservePool.filter((r) => !usedReserveIds.has(r.question_id)
          && !queues.some((queue) => queue.includes(r.question_id))).length,
        settings,
      };
    },

    getResult() {
      const status = ['WINNER', 'NOT_CLEARED', 'ABORTED'].includes(state.status) ? state.status : 'ABORTED';
      return buildResult(status);
    },

    /* escape hatches for tests / debugging */
    _state: state,
    _queues: queues,
    _reservePool: reservePool,
    _records: records,
  };

  return api;
}

export default createGame;
