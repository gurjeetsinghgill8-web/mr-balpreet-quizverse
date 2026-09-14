/**
 * QUIZVERSE — QUIZ EDITOR
 * ---------------------------------------------------------------------------
 * Pure functions that let a teacher shape a generated quiz without regenerating
 * everything (PRODUCT_DEVELOPMENT.md §29). Every edit is re-validated with the
 * same 10-point engine the AI path uses, so a teacher can never introduce the
 * mistakes the validator exists to prevent.
 *
 * Rules enforced here:
 *   • a stage is never left empty (§7.2)
 *   • the reserve pool is refilled first, so the CHANGE QUESTION lifeline keeps working
 *   • every edit bumps the package version (§56)
 *   • deleted questions are removed from play, not merely hidden
 */

import { validateQuestion, validateBank } from '../packages/ai-service/validator.js';
import { generateSingleQuestion, AIGenerationError } from '../packages/ai-service/provider.js';

export const MAX_STAGE_QUESTIONS = 8;

/** question ids that are actually referenced by a stage */
export function stagedIds(pkg) {
  return new Set((pkg.stages || []).flatMap((stage) => stage.question_ids || []));
}

/** questions present in the package but not in any stage => reserve pool */
export function reservePool(pkg) {
  const staged = stagedIds(pkg);
  return (pkg.questions || []).filter((q) => !staged.has(q.question_id));
}

export function questionById(pkg, questionId) {
  return (pkg.questions || []).find((q) => q.question_id === questionId) || null;
}

export function stageOf(pkg, questionId) {
  const stage = (pkg.stages || []).find((s) => (s.question_ids || []).includes(questionId));
  return stage ? stage.stage : null;
}

/** Immutable package update helper. */
export function withPackage(pkg, patch, note) {
  return {
    ...pkg,
    ...patch,
    version: (pkg.version || 1) + (patch && patch.__bump === false ? 0 : 1),
    generation_meta: {
      ...(pkg.generation_meta || {}),
      note: note || (pkg.generation_meta ? pkg.generation_meta.note : null),
      edited_at: new Date().toISOString(),
    },
  };
}

function replaceInStages(pkg, questionId, replacementId) {
  return (pkg.stages || []).map((stage) => ({
    ...stage,
    question_ids: (stage.question_ids || []).map((id) => (id === questionId ? replacementId : id)),
  }));
}

function replaceInQuestions(pkg, questionId, replacement) {
  const exists = (pkg.questions || []).some((q) => q.question_id === questionId);
  if (!exists) return [...(pkg.questions || []), replacement];
  return (pkg.questions || []).map((q) => (q.question_id === questionId ? replacement : q));
}

/* ------------------------------------------------------------------ */
/* 1) edit a single question                                           */
/* ------------------------------------------------------------------ */

/**
 * Apply a teacher edit to one question.
 * @returns {{ ok:boolean, pkg:object|null, failures:Array, codes:string[] }}
 */
export function updateQuestion(pkg, questionId, patch = {}) {
  const current = questionById(pkg, questionId);
  if (!current) return { ok: false, pkg: null, failures: [{ code: 'NOT_FOUND', detail: questionId }], codes: ['NOT_FOUND'] };

  const candidate = {
    ...current,
    ...patch,
    options: { ...current.options, ...(patch.options || {}) },
    question_id: questionId, // slot identity must never change
    stage: current.stage,
    origin: 'teacher',
  };

  const others = (pkg.questions || []).filter((q) => q.question_id !== questionId);
  const check = validateQuestion(candidate, {
    classLevel: pkg.class_level,
    language: pkg.language,
    sourceMode: pkg.source_type,
    allowAdditionalKnowledge: !!(pkg.source_meta && pkg.source_meta.allow_additional_knowledge),
    seenQuestions: others,
  });

  if (!check.pass) {
    return { ok: false, pkg: null, failures: check.failures, codes: check.failures.map((f) => f.code) };
  }

  return {
    ok: true,
    failures: [],
    codes: [],
    pkg: withPackage(pkg, {
      questions: replaceInQuestions(pkg, questionId, candidate),
    }, `Question ${questionId} edited by the teacher.`),
  };
}

/* ------------------------------------------------------------------ */
/* 2) delete a question (stage refilled from reserves)                  */
/* ------------------------------------------------------------------ */

export function deleteQuestion(pkg, questionId) {
  const stage = stageOf(pkg, questionId);
  if (stage === null) return { ok: false, pkg: null, reason: 'not_staged' };

  const stageDef = pkg.stages.find((s) => s.stage === stage);
  if ((stageDef.question_ids || []).length <= 1) {
    return { ok: false, pkg: null, reason: 'last_question',
      message: 'A stage needs at least one question. Add or regenerate one instead of deleting the last.' };
  }

  let next = {
    ...pkg,
    questions: (pkg.questions || []).filter((q) => q.question_id !== questionId),
    stages: (pkg.stages || []).map((s) => (s.stage === stage
      ? { ...s, question_ids: s.question_ids.filter((id) => id !== questionId) }
      : s)),
  };

  const refilled = refillStage(next, stage);
  next = refilled.pkg;

  return {
    ok: true,
    refilled: refilled.added,
    pkg: withPackage(next, {}, `Question ${questionId} removed by the teacher.`),
  };
}

/* ------------------------------------------------------------------ */
/* 3) refill a stage from the reserve pool                              */
/* ------------------------------------------------------------------ */

/** Pull unseen reserve questions into a stage so it matches the others again. */
export function refillStage(pkg, stageNumber) {
  const stage = (pkg.stages || []).find((s) => s.stage === stageNumber);
  if (!stage) return { pkg, added: [] };

  const target = Math.max(...(pkg.stages || []).map((s) => (s.question_ids || []).length));
  const pool = reservePool(pkg);
  const added = [];
  const ids = [...(stage.question_ids || [])];

  while (ids.length < target) {
    const pick = pool.find((q) => q.stage === stageNumber)
      || pool.find((q) => !added.includes(q.question_id));
    if (!pick || added.includes(pick.question_id)) break;
    added.push(pick.question_id);
    ids.push(pick.question_id);
    pool.splice(pool.indexOf(pick), 1);
  }

  if (!added.length) return { pkg, added };
  return {
    pkg: { ...pkg, stages: pkg.stages.map((s) => (s.stage === stageNumber ? { ...s, question_ids: ids } : s)) },
    added,
  };
}

/* ------------------------------------------------------------------ */
/* 4) replace one question (AI first, reserve pool as fallback)         */
/* ------------------------------------------------------------------ */

export function replaceWithReserve(pkg, questionId) {
  const stageNo = stageOf(pkg, questionId);
  const pool = reservePool(pkg);
  if (!pool.length) return { ok: false, pkg: null, reason: 'no_replacement' };

  const pick = pool.find((q) => q.stage === stageNo) || pool[0];
  const replacement = { ...pick, stage: stageNo, origin: 'reserve' };

  return {
    ok: true,
    source: 'reserve',
    pkg: withPackage(pkg, {
      questions: (pkg.questions || []).map((q) => (
        q.question_id === pick.question_id ? replacement : q
      )),
      stages: replaceInStages(pkg, questionId, pick.question_id),
    }, `Question ${questionId} replaced with a reserve question.`),
  };
}

/**
 * Regenerate a single question. Uses the AI when a provider is configured,
 * otherwise the reserve pool — and reports which one answered.
 */
export async function regenerateQuestion({ pkg, questionId, settings = {}, fetchImpl } = {}) {
  const current = questionById(pkg, questionId);
  if (!current) return { ok: false, reason: 'not_found' };

  const stageNo = stageOf(pkg, questionId) || current.stage || 1;
  const provider = settings.aiProvider || 'offline';

  if (provider !== 'offline') {
    try {
      const { generateSingleQuestion } = await import('../packages/ai-service/provider.js');
      const others = (pkg.questions || []).filter((q) => q.question_id !== questionId);
      const endpoint = settings.aiEndpoint !== undefined
        ? settings.aiEndpoint
        : (typeof location !== 'undefined' && /^https?:/.test(location.protocol) ? '/api/ai/chat' : null);
      const question = await generateSingleQuestion({
        config: {
          provider,
          model: settings.aiModel,
          baseUrl: settings.aiBaseUrl,
          apiKey: settings.aiApiKey,
          endpoint,
          timeoutMs: Number(settings.aiTimeoutMs) || 60000,
        },
        input: {
          classLevel: pkg.class_level,
          topic: pkg.topic,
          subject: pkg.subject,
          language: pkg.language,
          stage: stageNo,
          difficulty: current.difficulty,
          conceptTag: current.concept_tag,
          avoid: others.slice(0, 12).map((q) => q.question),
          sourceMode: pkg.source_type,
          materialText: settings.materialText || '',
          allowAdditionalKnowledge: !!(pkg.source_meta && pkg.source_meta.allow_additional_knowledge),
        },
        fetchImpl,
      });

      const candidate = { ...question, question_id: questionId, stage: stageNo, origin: 'ai' };
      const check = validateQuestion(candidate, {
        classLevel: pkg.class_level,
        language: pkg.language,
        sourceMode: pkg.source_type,
        allowAdditionalKnowledge: !!(pkg.source_meta && pkg.source_meta.allow_additional_knowledge),
        seenQuestions: others,
      });
      if (check.pass) {
        return {
          ok: true,
          source: 'ai',
          pkg: withPackage(pkg, { questions: replaceInQuestions(pkg, questionId, candidate) },
            `Question ${questionId} regenerated by the AI.`),
        };
      }
    } catch (err) {
      if (!(err instanceof AIGenerationError)) throw err;
      // fall through to the reserve pool
    }
  }

  const fallback = replaceWithReserve(pkg, questionId);
  if (fallback.ok) return fallback;
  return { ok: false, reason: 'no_replacement', message: 'No replacement question is available for this slot.' };
}

/* ------------------------------------------------------------------ */
/* 5) version helpers                                                  */
/* ------------------------------------------------------------------ */

export function nextVersion(pkg, note) {
  return withPackage(pkg, {}, note || 'New version generated.');
}

export function versionLabel(pkg) {
  return `v${pkg.version || 1}`;
}

export function packageStats(pkg) {
  const staged = stagedIds(pkg);
  const byStage = (pkg.stages || []).map((stage) => ({
    stage: stage.stage,
    name: stage.name,
    count: (stage.question_ids || []).length,
  }));
  return {
    version: pkg.version || 1,
    questions: staged.size,
    reserves: reservePool(pkg).length,
    byStage,
    emptyStages: byStage.filter((s) => s.count === 0).map((s) => s.stage),
    edited: !!(pkg.generation_meta && pkg.generation_meta.edited_at),
  };
}

/** Sanity check used by the UI before a quiz is played. */
export function packageWarnings(pkg) {
  const stats = packageStats(pkg);
  const warnings = [];
  if (stats.emptyStages.length) warnings.push(`Stages ${stats.emptyStages.join(', ')} have no questions.`);
  if (stats.questions < 5) warnings.push('Fewer than 5 questions — the game will be very short.');
  const bank = validateBank(pkg.questions || [], {
    classLevel: pkg.class_level,
    language: pkg.language,
    sourceMode: pkg.source_type,
  });
  if (!bank.pass) warnings.push(`${bank.stats.failed} question(s) fail validation and should be fixed before playing.`);
  return { ...stats, warnings, validation: bank };
}

export default { updateQuestion, deleteQuestion, regenerateQuestion, replaceWithReserve, refillStage, nextVersion, packageStats, packageWarnings };
