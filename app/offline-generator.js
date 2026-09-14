/**
 * QUIZVERSE — OFFLINE GENERATOR (deterministic fallback engine)
 * ---------------------------------------------------------------------------
 * Used when provider = "offline", and as the automatic fallback when a live AI
 * call fails. Two sources:
 *
 *   1. Topic mode    → the curated demo library (app/data/packs.js)
 *   2. Material mode → definition extraction from the teacher's own text
 *
 * Both paths run the SAME 10-point validator and the SAME stage builder as the
 * AI path, so a quiz package looks identical whichever engine produced it.
 */

import { PACKS, findPack } from './data/packs.js';
import { validateBank } from '../packages/ai-service/validator.js';
import { buildQuizPackage, resolveSettings } from '../packages/ai-service/quiz-builder.js';
import { extractFacts, factsToQuestions } from '../packages/ai-service/material-extract.js';

const MIN_QUESTIONS = 5;

/* ------------------------------------------------------------------ */
/* 1) TOPIC MODE                                                       */
/* ------------------------------------------------------------------ */

export function generateFromTopic({ classLevel, topic, count = 15, timer = 'auto', lifelines, language, subject }) {
  const pack = findPack(topic, classLevel);
  if (!pack) {
    return {
      ok: false,
      error: 'no_pack',
      suggestions: PACKS.map((p) => ({
        topic: p.topic, class_level: p.class_level, subject: p.subject, language: p.language, description: p.description,
      })),
    };
  }

  const questionLanguage = language || pack.language;
  const band = validateBank(pack.questions, {
    classLevel,
    language: questionLanguage,
    sourceMode: 'topic',
  });

  if (band.safe.length < MIN_QUESTIONS) {
    return {
      ok: false,
      error: 'too_few_for_class',
      pack,
      validation: band,
      errorVars: { n: band.safe.length, pack: pack.class_level },
    };
  }

  const settings = resolveSettings({ classLevel, timer, lifelines, sound: true, music: false, mascot: true });
  const pkg = buildQuizPackage({
    questions: band.safe,
    classLevel,
    subject: subject || pack.subject,
    topic: pack.topic,
    language: questionLanguage,
    title: `Class ${classLevel} – ${pack.topic} Challenge`,
    sourceType: 'topic',
    settings,
    count,
    quizId: `qz_${pack.id}_c${classLevel}_${Date.now().toString(36).slice(-4)}`,
    generationMeta: {
      model: 'offline-demo-library',
      validator_pass: band.pass,
      validation_stats: band.stats,
      note: band.stats.failed
        ? `${band.stats.failed} question(s) dropped by the validator for Class ${classLevel}.`
        : null,
    },
  });

  return { ok: true, package: pkg, validation: band, pack, engine: 'offline' };
}

/**
 * Seed questions for a topic, in the AI JSON contract. Used as the mock
 * provider's source so the full AI pipeline can be demonstrated offline.
 */
export function seedQuestionsForTopic(topic, classLevel) {
  const pack = findPack(topic, classLevel);
  if (!pack) return [];
  return pack.questions
    .filter((q) => !q.reserve)
    .map((q) => ({
      question_id: q.question_id,
      stage: q.stage,
      difficulty: q.difficulty,
      cognitive_level: q.cognitive_level,
      concept_tag: q.concept_tag,
      question: q.question,
      options: { ...q.options },
      correct_option: q.correct_option,
      explanation: q.explanation,
      simple_explanation: q.simple_explanation,
      clue: q.clue,
      source_reference: null,
    }));
}

/* ------------------------------------------------------------------ */
/* 2) MATERIAL MODE — definition extraction                            */
/* ------------------------------------------------------------------ */

export function generateFromMaterial({
  text,
  classLevel,
  count = 15,
  timer = 'auto',
  lifelines,
  language,
  topic = 'My Material',
  subject = 'General',
  fileName = null,
  pages = null,
}) {
  const facts = extractFacts(text);
  if (facts.length < MIN_QUESTIONS) {
    return { ok: false, error: 'material_too_thin', found: facts.length };
  }

  const isHindi = /[\u0900-\u097F]/.test(text);
  const lang = language || (isHindi ? 'hi' : 'en');
  const questions = factsToQuestions(facts, { classLevel, language: lang });

  const band = validateBank(questions, {
    classLevel,
    language: lang,
    sourceMode: 'material',
    allowAdditionalKnowledge: false,
  });

  if (band.safe.length < MIN_QUESTIONS) {
    return { ok: false, error: 'too_few_for_class', validation: band, errorVars: { n: band.safe.length } };
  }

  const settings = resolveSettings({ classLevel, timer, lifelines, sound: true, music: false, mascot: true });
  const pkg = buildQuizPackage({
    questions: band.safe,
    classLevel,
    subject,
    topic,
    language: lang,
    title: `Class ${classLevel} – ${topic}`,
    sourceType: 'material',
    sourceMeta: { file_name: fileName, pages, allow_additional_knowledge: false },
    settings,
    count,
    quizId: `qz_mat_${Date.now().toString(36).slice(-6)}`,
    generationMeta: {
      model: 'offline-material-extractor',
      validator_pass: band.pass,
      validation_stats: band.stats,
      note: 'Questions were built only from your material, with source excerpts attached.',
    },
  });

  return { ok: true, package: pkg, validation: band, facts, engine: 'offline' };
}

export const demoLibrary = PACKS.map((p) => ({
  topic: p.topic,
  class_level: p.class_level,
  subject: p.subject,
  language: p.language,
  description: p.description,
  questions: p.questions.filter((x) => !x.reserve).length,
}));

export default generateFromTopic;
