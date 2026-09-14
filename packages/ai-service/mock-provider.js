/**
 * QUIZVERSE — MOCK AI PROVIDER (pipeline demo + tests)
 * ---------------------------------------------------------------------------
 * A deterministic, offline stand-in for a real LLM. It answers the SAME prompt
 * with the SAME JSON contract, which makes the whole AI pipeline demonstrable
 * and testable without any API key:
 *
 *   • generation   → questions built from the material text inside the prompt,
 *                    or from a seed the client supplies for demo topics
 *   • first attempt→ one deliberately broken question (duplicate option), so the
 *                    10-point validator and the repair loop are visible in the UI
 *   • repair call  → detects the failure codes in the repair prompt and returns a
 *                    corrected question for that exact slot
 *
 * It is clearly labelled as a mock in the interface; it never pretends to be a
 * real model.
 */

import { extractFacts, factsToQuestions, words } from './material-extract.js';

const ok = (payload) => JSON.stringify(payload);

function parsePrompt(prompt) {
  const grab = (re, fallback = null) => {
    const m = String(prompt).match(re);
    return m ? m[1].trim() : fallback;
  };
  const material = String(prompt).match(/material_text:\s*"""([\s\S]*?)"""/);
  return {
    classLevel: Number(grab(/class_level:\s*(\d+)/, '5')),
    language: /language:\s*hi/i.test(prompt) ? 'hi' : 'en',
    count: Number(grab(/question_count:\s*(\d+)/, '15')),
    topic: grab(/topic:\s*(.+)/, 'General'),
    sourceMode: /source_mode:\s*material/i.test(prompt) ? 'material' : 'topic',
    materialText: material ? material[1] : '',
  };
}

/** Extract the single question object embedded in a repair prompt. */
function parseRepairQuestion(prompt) {
  const start = prompt.indexOf('{');
  const end = prompt.indexOf('Failure codes:');
  if (start < 0) return null;
  const slice = prompt.slice(start, end > start ? end : undefined);
  const lastBrace = slice.lastIndexOf('}');
  if (lastBrace < 0) return null;
  try {
    return JSON.parse(slice.slice(0, lastBrace + 1));
  } catch {
    return null;
  }
}

/** Fix exactly the flaws a real model would be asked to fix. */
function repairQuestion(question, prompt) {
  const fixed = JSON.parse(JSON.stringify(question));
  const keys = ['A', 'B', 'C', 'D'];
  fixed.options = fixed.options || {};
  keys.forEach((k) => { fixed.options[k] = String(fixed.options[k] ?? '').trim(); });

  // DUPLICATE_OPTION / empty options
  const used = new Set();
  keys.forEach((k) => {
    const value = fixed.options[k];
    if (!value || used.has(value.toLowerCase())) {
      fixed.options[k] = `${value ? value + ' ' : ''}(variant ${k})`;
    }
    used.add(fixed.options[k].toLowerCase());
  });

  // ONE_CORRECT
  if (!keys.includes(String(fixed.correct_option).toUpperCase())) fixed.correct_option = 'A';
  fixed.correct_option = String(fixed.correct_option).toUpperCase();

  // CLASS_MISMATCH — trim options to the ceiling reported in the failure detail
  const ceiling = Number((prompt.match(/allows (\d+)/) || [])[1] || 0);
  if (ceiling > 0) {
    keys.forEach((k) => {
      const parts = words(fixed.options[k]);
      if (parts.length > ceiling) fixed.options[k] = parts.slice(0, ceiling).join(' ');
    });
    const stemCeiling = Number((prompt.match(/class \d+ allows (\d+)/) || [])[1] || 0);
    if (stemCeiling > 0 && words(fixed.question).length > stemCeiling) {
      fixed.question = words(fixed.question).slice(0, stemCeiling).join(' ') + '?';
    }
  }

  // CLUE_REVEALS_ANSWER
  const answer = fixed.options[fixed.correct_option] || '';
  if (answer && String(fixed.clue || '').toLowerCase().includes(answer.toLowerCase())) {
    fixed.clue = 'Think about the meaning of the key term in the question.';
  }

  // EXPLANATION_MISSING
  if (!String(fixed.explanation || '').trim() || fixed.explanation.trim() === answer) {
    fixed.explanation = `The correct answer is ${answer}. ${fixed.question.replace(/\?$/, '')} — this follows directly from the lesson.`;
  }
  if (!String(fixed.simple_explanation || '').trim()) fixed.simple_explanation = fixed.explanation;
  if (!String(fixed.clue || '').trim()) fixed.clue = 'Recall the definition from your material.';

  return fixed;
}

/** Deliberate, repairable flaw used to demonstrate the validator in the UI. */
function injectFlaw(questions) {
  if (questions.length < 2) return questions;
  const copy = questions.map((q) => ({ ...q, options: { ...q.options } }));
  const victim = copy[1];
  const keys = ['A', 'B', 'C', 'D'];
  const wrongKey = keys.find((k) => k !== victim.correct_option);
  victim.options[wrongKey] = victim.options[victim.correct_option]; // duplicate option text
  return copy;
}

/**
 * Answer a chat request. Shaped like the real providers so the server proxy and
 * provider.js can treat it identically.
 *
 * @param {object} body { messages, mock_seed, inject_flaw, delay_ms }
 */
export async function mockChat(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const delay = Number(body.delay_ms ?? 260);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  // ---- repair call
  if (/Failure codes:/i.test(prompt)) {
    const broken = parseRepairQuestion(prompt);
    if (!broken) return ok({ questions: [] });
    const fixed = repairQuestion(broken, prompt);
    return ok({ questions: [fixed] });
  }

  // ---- single-question regeneration
  // A mock cannot invent an unseen question for a topic it already seeded, so it
  // honestly returns nothing and the editor falls back to the reserve pool.
  if (/single_question:\s*true/i.test(prompt)) {
    return ok({ questions: [] });
  }

  // ---- generation call
  const parsed = parsePrompt(prompt);
  let questions = [];

  if (parsed.sourceMode === 'material' && parsed.materialText) {
    const facts = extractFacts(parsed.materialText);
    questions = factsToQuestions(facts, { classLevel: parsed.classLevel, language: parsed.language });
  } else if (Array.isArray(body.mock_seed) && body.mock_seed.length) {
    questions = body.mock_seed.map((q) => ({
      question_id: q.question_id,
      stage: q.stage,
      difficulty: q.difficulty,
      cognitive_level: q.cognitive_level,
      concept_tag: q.concept_tag,
      question: q.question,
      options: { ...q.options },
      correct_option: q.correct_option,
      explanation: q.explanation,
      simple_explanation: q.simple_explanation || q.explanation,
      clue: q.clue,
      source_reference: q.source_reference || null,
    }));
  }

  const wanted = Math.max(5, Math.min(parsed.count, questions.length || parsed.count));
  questions = questions.slice(0, Math.max(wanted, Math.min(questions.length, parsed.count + 3)));

  const firstAttempt = body.inject_flaw !== false;
  const finalQuestions = firstAttempt && questions.length >= 2 ? injectFlaw(questions) : questions;

  return ok({
    title: `Class ${parsed.classLevel} – ${parsed.topic} Challenge`,
    questions: finalQuestions,
  });
}

export default mockChat;
