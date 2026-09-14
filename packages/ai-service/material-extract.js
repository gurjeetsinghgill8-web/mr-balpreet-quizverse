/**
 * QUIZVERSE — LAYER 1 : MATERIAL EXTRACTION
 * ---------------------------------------------------------------------------
 * Shared by the offline generator and the mock provider: pulls definition-style
 * facts out of teacher material and turns them into questions in the same JSON
 * contract the AI providers return. Keeping this in one place means the demo
 * path and the AI path can never drift apart.
 */

import { CLASS_BANDS, bandFor } from './validator.js';
import { STAGE_DIFFICULTY } from './quiz-builder.js';

const EN_DEF = /^(.{3,70}?)\s+(?:is|are|means|refers to)\s+(?:a|an|the)?\s*(.{3,120}?)\.?$/i;
const HI_DEF = /^(.{3,70}?)\s+(?:का अर्थ|का मतलब|यानी)\s*(.{3,120}?)(?: है| हैं| होता है| होती है)?[.।]?$/;
const HI_DEF2 = /^(.{3,70}?)\s+(.{3,120}?)\s+(?:कहलाता है|कहलाती है|होता है|होती है)[.।]?$/;
const KV_PAIR = /^([^:：\-–—]{3,50})[:：\-–—]\s*(.{5,160})$/;

export function splitSentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 240);
}

export function words(value) {
  return String(value).trim().split(/\s+/).filter(Boolean);
}

/**
 * Offline "summariser": keeps an option inside the class vocabulary ceiling by
 * cutting at the first natural clause boundary. The live AI rewrites instead —
 * same contract, cheaper implementation.
 */
export function shorten(text, maxWords) {
  const clean = String(text).trim().replace(/\.$/, '');
  if (words(clean).length <= maxWords) return clean;
  const parts = clean.split(/,\s*|\s+(?:and|that|which|so that|because|in order to)\s+/i);
  let out = '';
  for (const part of parts) {
    const candidate = out ? `${out} ${part}` : part;
    if (words(candidate).length <= maxWords) out = candidate;
    else break;
  }
  if (!out || words(out).length < 2) out = words(clean).slice(0, maxWords).join(' ');
  return out.trim();
}

/** Term/definition pairs found in the material. */
export function extractFacts(text) {
  const facts = [];
  const seen = new Set();

  splitSentences(text).forEach((sentence) => {
    let term = null;
    let definition = null;

    let m = sentence.match(EN_DEF);
    if (m) { term = m[1].trim(); definition = m[2].trim(); }

    if (!term) {
      m = sentence.match(KV_PAIR);
      if (m) { term = m[1].trim(); definition = m[2].trim(); }
    }
    if (!term) {
      m = sentence.match(HI_DEF) || sentence.match(HI_DEF2);
      if (m) { term = m[1].trim(); definition = m[2].trim(); }
    }
    if (!term || !definition) return;
    if (words(term).length > 6) return;

    const key = `${term.toLowerCase()}|${definition.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ term, definition, sentence });
  });

  return facts;
}

/**
 * Facts -> questions in the AI JSON contract (source-tracked, class-aware).
 * @param {Array} facts from extractFacts()
 * @param {object} options { classLevel, language, topic }
 */
export function factsToQuestions(facts, { classLevel = 5, language = 'en' } = {}) {
  const maxOptionWords = CLASS_BANDS[bandFor(classLevel)].maxOptionWords;
  const isHindi = language === 'hi';

  return facts.map((fact, index) => {
    const answer = shorten(fact.definition, maxOptionWords);
    const others = facts
      .filter((f) => f.term !== fact.term)
      .map((f) => shorten(f.definition, maxOptionWords))
      .filter((d) => d.toLowerCase() !== answer.toLowerCase());

    const distractors = others
      .slice()
      .sort((a, b) => Math.abs(words(a).length - words(answer).length) - Math.abs(words(b).length - words(answer).length))
      .slice(0, 3);

    const unique = [...new Set(distractors.map((d) => d.trim()))]
      .filter((d) => d.toLowerCase() !== answer.toLowerCase());
    while (unique.length < 3) {
      unique.push(isHindi
        ? `इनमें से कोई विकल्प सही नहीं ${unique.length + 1}`
        : `None of these options ${unique.length + 1}`);
    }

    const options = [answer, ...unique.slice(0, 3)];
    const shift = index % 4; // deterministic rotation: the answer is not always slot A
    const rotated = options.slice(shift).concat(options.slice(0, shift));
    const keys = ['A', 'B', 'C', 'D'];
    const optionsObj = {};
    keys.forEach((k, i) => { optionsObj[k] = rotated[i]; });
    const correctIndex = Math.max(0, rotated.indexOf(answer));

    const stage = (index % 5) + 1;
    const firstLetter = answer.slice(0, 1);

    return {
      question_id: `mat_${index + 1}`,
      stage,
      difficulty: STAGE_DIFFICULTY[stage - 1].difficulty,
      cognitive_level: STAGE_DIFFICULTY[stage - 1].cognitive,
      concept_tag: fact.term.slice(0, 24),
      question: isHindi ? `${fact.term} क्या है?` : `What is ${fact.term}?`,
      options: optionsObj,
      correct_option: keys[correctIndex],
      explanation: isHindi
        ? `आपकी सामग्री के अनुसार: ${fact.sentence}`
        : `From your material: ${fact.sentence}`,
      simple_explanation: answer,
      clue: isHindi
        ? `सही उत्तर "${firstLetter}" से शुरू होता है — सामग्री याद कीजिए।`
        : `The correct answer starts with "${firstLetter}" — recall your material.`,
      illustration: null,
      source_reference: {
        type: 'teacher_material',
        section: 'Uploaded material',
        excerpt: fact.sentence.slice(0, 140),
      },
    };
  });
}

export default extractFacts;
