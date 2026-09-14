/**
 * QUIZVERSE — LAYER 1 : QUIZ BUILDER (pipeline step 11)
 * ---------------------------------------------------------------------------
 * Turns a validated question bank into a frozen Quiz Package that Layer 2 plays.
 * Responsibilities:
 *   • choose `count` questions, balanced across the 5 stages (never an empty stage)
 *   • keep the leftover questions as the reserve pool for CHANGE QUESTION
 *   • apply class-based auto settings (timer, pass policy)
 *   • record generation metadata (validation stats, repairs)
 */

import { distributeQuestions, STAGE_COUNT, STAGE_NAMES, autoTimerFor, autoPassPolicy } from '../game-engine/engine.js';

export const DIFFICULTY_ORDER = ['very_easy', 'easy', 'medium', 'hard', 'highest'];

export const STAGE_DIFFICULTY = [
  { stage: 1, name: STAGE_NAMES[0], difficulty: 'very_easy', cognitive: 'recall' },
  { stage: 2, name: STAGE_NAMES[1], difficulty: 'easy', cognitive: 'recall+understanding' },
  { stage: 3, name: STAGE_NAMES[2], difficulty: 'medium', cognitive: 'understanding+application' },
  { stage: 4, name: STAGE_NAMES[3], difficulty: 'hard', cognitive: 'application+reasoning' },
  { stage: 5, name: STAGE_NAMES[4], difficulty: 'highest', cognitive: 'higher-order thinking' },
];

export function resolveSettings({
  classLevel,
  timer = 'auto',
  passPolicy = 'auto',
  lifelines = { half_half: 1, clue: 1, second_chance: 1, change_question: 1 },
  pointsMode = 'points',
  sound = true,
  music = true,
  mascot = true,
} = {}) {
  const auto = autoPassPolicy(classLevel);
  return {
    timer_seconds: timer === 'none' ? 0 : timer === 'auto' || timer == null ? autoTimerFor(classLevel) : Number(timer),
    always_advance: passPolicy === 'auto' ? auto.always_advance : passPolicy === 'always',
    stage_pass_ratio: passPolicy === 'auto' ? auto.stage_pass_ratio : passPolicy === 'always' ? 0 : 0.6,
    final_stage_ratio: passPolicy === 'auto' ? auto.final_stage_ratio : 0.6,
    points_mode: pointsMode,
    stage_points: [100, 200, 300, 500, 1000],
    lifelines: { ...lifelines },
    sound,
    music,
    mascot,
  };
}

function byStage(questions) {
  const map = new Map();
  questions.forEach((q) => {
    const s = Number(q.stage) || 1;
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(q);
  });
  return map;
}

/**
 * Build a Quiz Package.
 * @param {object} args
 * @param {Array}  args.questions  validated questions (each carrying `stage`)
 * @param {number} args.classLevel
 * @param {number} args.count      requested question count (5/10/15/20/25)
 * @param {object} args.settings   resolved settings
 */
export function buildQuizPackage({
  questions,
  classLevel,
  subject = 'General',
  topic = 'General',
  language = 'en',
  title,
  sourceType = 'topic',
  sourceMeta = { file_name: null, pages: null, allow_additional_knowledge: false },
  settings,
  count = 15,
  quizId,
  generationMeta = {},
  stageCount = STAGE_COUNT,
}) {
  const grouped = byStage(questions);
  const perStage = distributeQuestions(Math.min(count, questions.length), stageCount);

  const chosen = new Map(); // stage -> question ids (ordered)
  const leftovers = [];
  for (let s = 1; s <= stageCount; s++) {
    const bucket = (grouped.get(s) || []).slice();
    const need = perStage[s - 1];
    const take = bucket.splice(0, need);
    chosen.set(s, take);
    leftovers.push(...bucket);
  }

  // Refill any short stage from leftovers so a stage is never empty.
  for (let s = 1; s <= stageCount; s++) {
    const list = chosen.get(s);
    while (list.length < Math.max(1, perStage[s - 1]) && leftovers.length) {
      list.push(leftovers.shift());
    }
  }

  const usedIds = new Set();
  const stages = [];
  for (let s = 1; s <= stageCount; s++) {
    const list = chosen.get(s).filter((q) => q);
    list.forEach((q) => usedIds.add(q.question_id));
    stages.push({
      stage: s,
      name: STAGE_DIFFICULTY[s - 1].name,
      difficulty: STAGE_DIFFICULTY[s - 1].difficulty,
      question_ids: list.map((q) => q.question_id),
    });
  }

  const reserves = leftovers.filter((q) => q && !usedIds.has(q.question_id));
  const allQuestions = [...usedIds].map((id) => questions.find((q) => q.question_id === id)).concat(reserves);

  return {
    schema_version: '1.0',
    quiz_id: quizId || `qz_${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    title: title || `Class ${classLevel} – ${topic} Challenge`,
    class_level: Number(classLevel),
    subject,
    topic,
    language,
    difficulty_profile: `auto-${classLevel}`,
    source_type: sourceType,
    source_meta: sourceMeta,
    settings,
    stages,
    questions: allQuestions,
    generation_meta: {
      model: generationMeta.model || 'offline-demolibrary',
      generated_at: new Date().toISOString(),
      validator_pass: generationMeta.validator_pass !== false,
      regenerations: generationMeta.regenerations || 0,
      validation_stats: generationMeta.validation_stats || null,
      requested_count: count,
      delivered_count: usedIds.size,
      reserve_count: reserves.length,
      note: generationMeta.note || null,
    },
  };
}

export default buildQuizPackage;
