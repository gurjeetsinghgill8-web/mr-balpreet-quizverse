/**
 * QUIZVERSE — LAYER 1 : PROMPT TEMPLATES
 * ---------------------------------------------------------------------------
 * The exact prompts from PRODUCT_DEVELOPMENT.md Appendix B, generated from the
 * same constants the validator uses, so a prompt can never drift from the rules
 * that enforce it.
 */

import { CLASS_BANDS, bandFor } from './validator.js';
import { STAGE_DIFFICULTY, DIFFICULTY_ORDER } from './quiz-builder.js';

/** The JSON shape the provider must return. Kept short: providers follow a tight contract. */
export const QUIZ_JSON_CONTRACT = `{
  "title": string,
  "questions": [
    {
      "question_id": string,
      "stage": 1 | 2 | 3 | 4 | 5,
      "difficulty": "very_easy" | "easy" | "medium" | "hard" | "highest",
      "cognitive_level": "recall" | "understanding" | "application" | "reasoning",
      "concept_tag": string,          // 2-4 words, used for teacher analytics
      "question": string,
      "options": { "A": string, "B": string, "C": string, "D": string },
      "correct_option": "A" | "B" | "C" | "D",
      "explanation": string,          // 1-3 sentences, age-simplified
      "simple_explanation": string,   // even simpler, for younger readers
      "clue": string,                 // for the CLASSROOM CLUE lifeline; must NOT reveal the answer
      "source_reference": { "page": number|null, "section": string|null, "excerpt": string } | null
    }
  ]
}`;

export function buildSystemPrompt() {
  return `You are the educational assessment engine of QUIZVERSE, a classroom game-show platform for Indian school students in Classes 1 to 8.

PRIMARY DUTY
Convert a Class + Topic (or supplied learning material) into a validated multiple-choice question bank that will be played inside a 5-stage game.

NON-NEGOTIABLE RULES
1. Respect the class level absolutely. A Class 2 student must be able to read and understand every word. Never use vocabulary, sentence length or concepts above the class band.
2. Exactly four options per question (A, B, C, D). Exactly one is correct.
3. Distractors must be plausible for this class and unambiguously wrong. Never two correct options, never zero correct options, never "all/none of the above".
4. Never write ambiguous, trick, negative-only or double-negative questions.
5. Language must match the requested language exactly (English or Hindi in Devanagari). For Hindi use simple school-level Hindi, correct matras and standard textbook terminology.
6. In material mode, use ONLY facts present in the supplied material unless allow_additional_knowledge is true. Never invent facts. Every question carries a source_reference when material is supplied.
7. Explanations: 1-3 sentences, age-simplified, always consistent with the correct option. Also give a shorter 'simple_explanation' for younger readers.
8. Each question gets a 'clue' for the CLASSROOM CLUE lifeline. The clue must guide thinking without stating the answer or echoing the key words of the correct option.
9. Difficulty must rise across stages: recall -> understanding -> application -> reasoning.
10. Stage ladder: stage 1 recall, stage 2 recall+understanding, stage 3 understanding+application, stage 4 application+reasoning, stage 5 higher-order thinking appropriate for the age.
11. Assign every question a short 'concept_tag' (2-4 words) used later for teacher analytics.
12. Age suitability, factual accuracy and safety matter more than cleverness. If you cannot produce enough safe, accurate questions, return fewer questions rather than inventing facts.

SAFETY (children are the users)
Never generate sexual, romantic, violent, self-harm, hateful, communal, political-campaigning, gambling, dangerous-instruction, body-shaming or frightening content. Sensitive curriculum topics are allowed only in a strictly scientific, curriculum-oriented, non-graphic register for Classes 7-8. Never reference a real named student. Never collect or ask for personal data.

TONE FOR STUDENT-FACING TEXT
Encouraging, kind, energetic. Never humiliating, sarcastic or comparative with other students.

OUTPUT
Return ONLY valid JSON conforming to the provided contract. No prose, no markdown, no commentary.`;
}

/** Class-aware limits injected into the prompt, straight from the validator's own tables. */
export function buildClassSection(classLevel) {
  const band = bandFor(classLevel);
  const spec = CLASS_BANDS[band];
  return [
    `class_level: ${classLevel}`,
    `class_band: ${band}   # A(1-2) | B(3-5) | C(6-8)`,
    `vocabulary_ceiling: ${spec.maxStemWords} words per question stem, ${spec.maxOptionWords} words per option`,
    band === 'A' ? 'Style: very short sentences, picture-friendly wording, no abstractions.' : '',
    band === 'B' ? 'Style: clear school textbook language, one idea per sentence.' : '',
    band === 'C' ? 'Style: precise academic language, allow one reasoning step per question.' : '',
  ].filter(Boolean).join('\n');
}

export function buildStageSection(questionCount) {
  const perStage = Math.max(1, Math.floor(questionCount / 5));
  return [
    'stage_ladder:',
    ...STAGE_DIFFICULTY.map((s) => `  stage ${s.stage} (${s.name}) difficulty=${s.difficulty} focus=${s.cognitive} min=${perStage}`),
    `difficulty_order: ${DIFFICULTY_ORDER.join(' < ')}`,
  ].join('\n');
}

/** Full generation prompt (topic mode or material mode). */
export function buildUserPrompt(input = {}) {
  const {
    classLevel = 5,
    topic = 'General',
    subject = 'General',
    language = 'en',
    count = 15,
    timer = 'auto',
    sourceMode = 'topic',
    materialText = '',
    allowAdditionalKnowledge = false,
  } = input;

  const overGenerate = Math.min(40, Math.ceil(count * 1.6));

  const lines = [
    'Generate a quiz package.',
    '',
    buildClassSection(classLevel),
    `topic: ${topic}`,
    `subject: ${subject}`,
    `language: ${language === 'hi' ? 'hi (Devanagari)' : 'en'}`,
    `question_count: ${count}`,
    `over_generate: ${overGenerate}   # extra questions power the CHANGE QUESTION lifeline`,
    `timer_seconds: ${timer}`,
    '',
    buildStageSection(count),
    '',
    'Every question needs all four options, one correct_option, an explanation, a simple_explanation and a clue.',
    language === 'hi'
      ? 'सभी प्रश्न, विकल्प, स्पष्टीकरण और संकेत देवनागरी हिंदी में लिखें।'
      : 'Write every question, option, explanation and clue in English.',
    '',
    `Return JSON exactly in this contract:\n${QUIZ_JSON_CONTRACT}`,
  ];

  if (sourceMode === 'material' && materialText) {
    lines.push('', buildMaterialSection(materialText, allowAdditionalKnowledge));
  }

  return lines.join('\n');
}

export function buildMaterialSection(materialText, allowAdditionalKnowledge = false) {
  const trimmed = String(materialText).slice(0, 60000);
  return [
    'source_mode: material',
    `allow_additional_knowledge: ${allowAdditionalKnowledge}`,
    'material_text:',
    '"""',
    trimmed,
    '"""',
    '',
    'For every question:',
    '- Base it strictly on the material above. Do not add outside facts.',
    '- Include source_reference { page, section, excerpt } where excerpt is a short (<25 words) quote from the material that justifies the question.',
    allowAdditionalKnowledge
      ? '- You may add clearly-marked extra questions using source_reference.type = "additional_knowledge".'
      : '- If a concept cannot be questioned from the material alone, DO NOT create that question.',
    '- Prefer concepts from headings, bold text, definitions, examples, tables and repeated ideas. Skip page numbers, footers and formatting artefacts.',
  ].join('\n');
}

/** Self-critique pass (PRODUCT_DEVELOPMENT.md §8.4, Appendix B.4). */
export function buildValidationPrompt(questions, ctx = {}) {
  return [
    'You are the QUIZVERSE VALIDATOR. Audit the questions below against the 10 checks.',
    `class_level: ${ctx.classLevel}`,
    `language: ${ctx.language}`,
    '',
    JSON.stringify({ questions }, null, 1),
    '',
    'Checks: FOUR_OPTIONS, ONE_CORRECT, DUPLICATE_OPTION, DUPLICATE_QUESTION, CLASS_MISMATCH,',
    'LANGUAGE_MISMATCH, AMBIGUOUS, EXPLANATION_MISMATCH, UNSOURCED, UNSAFE, CLUE_REVEALS_ANSWER.',
    '',
    'Be strict. A question that could be argued correct for a second option MUST fail as AMBIGUOUS.',
    'A question above the class vocabulary band MUST fail as CLASS_MISMATCH.',
    'A question not traceable to the supplied material MUST fail as UNSOURCED.',
    '',
    'Return JSON: { "results": [ { "question_id": string, "pass": boolean, "failures": [ { "code": string, "detail": string } ] } ] }',
  ].join('\n');
}

/** Bounded repair prompt: exactly one question, exactly the failures found (§8.5). */
export function buildRepairPrompt(question, failures, ctx = {}) {
  const codes = failures.map((f) => `${f.code}: ${f.detail}`).join('\n');
  return [
    'This question failed validation:',
    JSON.stringify(question, null, 1),
    '',
    'Failure codes:',
    codes,
    '',
    `class_level: ${ctx.classLevel}`,
    `language: ${ctx.language}`,
    `difficulty: ${question.difficulty || ctx.difficulty || 'medium'}`,
    `stage: ${question.stage || 1}`,
    '',
    'Rewrite ONLY this question so that every listed failure is fixed while keeping the same stage,',
    'difficulty, cognitive level and concept_tag. Do not change the concept being tested.',
    'Do not exceed the class vocabulary band. Keep the same question_id.',
    '',
    'Return JSON: { "questions": [ <one corrected question object> ] }',
  ].join('\n');
}

/** Optional: ask the model to extract key concepts for analytics and stage balancing. */
export function buildConceptPrompt(materialText) {
  return [
    'Extract the 5-8 most important teachable concepts from this material.',
    'Return JSON: { "concepts": [ { "name": string, "why": string } ] }',
    '',
    '"""',
    String(materialText).slice(0, 20000),
    '"""',
  ].join('\n');
}

/**
 * Regenerate ONE question for an existing slot (§29) — the teacher does not want
 * the other 14 questions touched.
 */
export function buildSingleQuestionPrompt(input = {}) {
  const {
    classLevel = 5,
    topic = 'General',
    subject = 'General',
    language = 'en',
    stage = 1,
    difficulty = 'medium',
    conceptTag = '',
    avoid = [],
    sourceMode = 'topic',
    materialText = '',
    allowAdditionalKnowledge = false,
  } = input;

  const lines = [
    'Write exactly ONE new multiple-choice question for an existing quiz slot.',
    'single_question: true',
    '',
    buildClassSection(classLevel),
    `topic: ${topic}`,
    `subject: ${subject}`,
    `language: ${language === 'hi' ? 'hi (Devanagari)' : 'en'}`,
    `stage: ${stage} of 5`,
    `difficulty: ${difficulty}`,
    conceptTag ? `keep_concept_tag: ${conceptTag}` : '',
    language === 'hi' ? 'प्रश्न, विकल्प, स्पष्टीकरण और संकेत हिंदी (देवनागरी) में लिखें।' : '',
    '',
    'Do NOT repeat or lightly reword any of these existing questions:',
    ...(avoid.length ? avoid.map((q) => `- ${q}`) : ['- (none)']),
    '',
    stage === 1 ? 'This is the warm-up stage: pure recall, very easy.'
      : stage === 2 ? 'This stage mixes recall with simple understanding.'
        : stage === 3 ? 'This stage tests understanding and simple application.'
          : stage === 4 ? 'This stage tests application and reasoning.'
            : 'This is the final stage: higher-order thinking appropriate for the class.',
    '',
    `Return JSON exactly in this contract:\n${QUIZ_JSON_CONTRACT}`,
  ].filter(Boolean);

  if (sourceMode === 'material' && materialText) {
    lines.push('', buildMaterialSection(materialText, allowAdditionalKnowledge));
  }

  return lines.join('\n');
}
