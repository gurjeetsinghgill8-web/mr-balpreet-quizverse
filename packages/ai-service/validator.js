/**
 * QUIZVERSE — LAYER 1 : VALIDATION ENGINE
 * ---------------------------------------------------------------------------
 * The 10-point question validator (PRODUCT_DEVELOPMENT.md §8.4).
 * Runs on every generated question, every teacher edit, and every demo pack.
 * A question that fails is never shown to a child.
 */

export const FAILURE_CODES = {
  FOUR_OPTIONS: 'Exactly four options (A–D) required',
  ONE_CORRECT: 'Exactly one correct answer, present in the options',
  DUPLICATE_OPTION: 'No duplicate option texts',
  DUPLICATE_QUESTION: 'No duplicate questions in the pool',
  CLASS_MISMATCH: 'Difficulty and vocabulary must fit the class band',
  LANGUAGE_MISMATCH: 'Language/script must match the requested language',
  AMBIGUOUS: 'Wording must be unambiguous',
  EXPLANATION_MISSING: 'Explanation must exist and be consistent with the answer',
  UNSOURCED: 'Material mode: question must be traceable to the source material',
  UNSAFE: 'Child-safety content rules',
  CLUE_REVEALS_ANSWER: 'Clue must guide, not reveal the answer',
  EMPTY_FIELD: 'Required fields must be present',
};

/** Class band specs: A(1–2), B(3–5), C(6–8) — vocabulary ceilings from §8.2 step 3. */
export const CLASS_BANDS = {
  A: { classes: [1, 2], maxStemWords: 12, maxOptionWords: 4, maxExplanationWords: 25, disallowAllOfTheAbove: true },
  B: { classes: [3, 4, 5], maxStemWords: 20, maxOptionWords: 7, maxExplanationWords: 40, disallowAllOfTheAbove: true },
  C: { classes: [6, 7, 8], maxStemWords: 30, maxOptionWords: 10, maxExplanationWords: 60, disallowAllOfTheAbove: false },
};

export function bandFor(classLevel) {
  const c = Number(classLevel);
  if (CLASS_BANDS.A.classes.includes(c)) return 'A';
  if (CLASS_BANDS.B.classes.includes(c)) return 'B';
  return 'C';
}

/** Blocklist — child safety (§12.1). Deliberately conservative for a demo build. */
const UNSAFE_PATTERNS = [
  /\b(sex|sexual|porn|nude|naked)\b/i,
  /\b(kill|murder|stab|shoot|gun|bomb|weapon)\b/i,
  /\b(suicide|self[- ]harm|cut yourself)\b/i,
  /\b(hate|slur|terrorist|communal riot)\b/i,
  /\b(drugs?|cocaine|heroin|alcohol|beer|wine|cigarette|smoking)\b/i,
  /\b(stupid|idiot|dumb|loser|failure)\b/i,
  /\b(gamble|betting|casino|lottery)\b/i,
];

const ALL_OF_THE_ABOVE = /\ball of (the )?above\b|\bnone of (the )?above\b/i;
const DOUBLE_NEGATIVE = /\bnot\b[^.?]{0,40}\b(never|no|not)\b/i;

function norm(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ') // \p{M} keeps Devanagari matras inside their word
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text) {
  const n = norm(text);
  return n ? n.split(' ').length : 0;
}

function trigrams(text) {
  const n = ` ${norm(text)} `;
  const set = new Set();
  for (let i = 0; i < n.length - 2; i++) set.add(n.slice(i, i + 3));
  return set;
}

/** Similarity 0..1 (trigram Jaccard) used for duplicate detection. */
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(String(text || ''));
}

function clueRevealsAnswer(clue, correctText) {
  const c = norm(clue);
  const a = norm(correctText);
  if (!c || !a) return false;
  if (c.includes(a)) return true;
  const answerWords = a.split(' ').filter((w) => w.length > 3);
  // A single shared word is not "revealing"; a multi-word answer echoed fully is.
  if (answerWords.length < 2) return false;
  return answerWords.every((w) => c.includes(w));
}

/**
 * Validate ONE question.
 * @param {object} q question object
 * @param {object} ctx { classLevel, language, sourceMode, allowAdditionalKnowledge, seenQuestions }
 */
export function validateQuestion(q, ctx = {}) {
  const failures = [];
  const push = (code, detail) => failures.push({ code, detail });

  const classLevel = Number(ctx.classLevel || q.class_level || 5);
  const band = CLASS_BANDS[bandFor(classLevel)];
  const language = ctx.language || 'en';

  if (!q || !q.question || !q.question.trim()) push('EMPTY_FIELD', 'question text is empty');
  if (!q || !q.explanation || !q.explanation.trim()) push('EXPLANATION_MISSING', 'explanation is empty');

  /* 1 — four options */
  const keys = q && q.options ? Object.keys(q.options) : [];
  if (keys.length !== 4) push('FOUR_OPTIONS', `found ${keys.length} options`);
  const optionTexts = keys.map((k) => String(q.options[k] || '').trim());
  if (optionTexts.some((t) => !t)) push('EMPTY_FIELD', 'one or more options are empty');

  /* 2 — one correct answer, present in options */
  if (!q || !q.correct_option || !keys.includes(q.correct_option)) {
    push('ONE_CORRECT', `correct_option "${q && q.correct_option}" is not one of ${keys.join('/')}`);
  }

  /* 3 — duplicate options */
  const normed = optionTexts.map(norm);
  if (new Set(normed).size !== normed.length) push('DUPLICATE_OPTION', 'two options have the same text');

  /* 4 — duplicate question (against provided context) */
  const pool = ctx.seenQuestions || [];
  for (const other of pool) {
    if (!other || other.question_id === q.question_id) continue;
    if (similarity(q.question, other.question) >= 0.78) {
      push('DUPLICATE_QUESTION', `too similar to ${other.question_id}`);
      break;
    }
  }

  /* 5 — class appropriateness (vocabulary ceiling) */
  const stemWords = words(q.question);
  if (stemWords > band.maxStemWords) {
    push('CLASS_MISMATCH', `stem has ${stemWords} words, class ${classLevel} allows ${band.maxStemWords}`);
  }
  optionTexts.forEach((t, i) => {
    const w = words(t);
    if (w > band.maxOptionWords) {
      push('CLASS_MISMATCH', `option ${keys[i]} has ${w} words, class ${classLevel} allows ${band.maxOptionWords}`);
    }
  });
  if (band.disallowAllOfTheAbove && optionTexts.some((t) => ALL_OF_THE_ABOVE.test(t))) {
    push('AMBIGUOUS', 'all/none of the above is not allowed for this class');
  }

  /* 6 — language / script */
  if (language === 'hi' && !hasDevanagari(q.question)) {
    push('LANGUAGE_MISMATCH', 'Hindi quiz but question has no Devanagari script');
  }
  if (language === 'en' && hasDevanagari(q.question)) {
    push('LANGUAGE_MISMATCH', 'English quiz but question contains Devanagari script');
  }

  /* 7 — ambiguity */
  if (DOUBLE_NEGATIVE.test(q.question)) push('AMBIGUOUS', 'double negative detected');
  if (/\b(always|never)\b/i.test(q.question) && classLevel <= 5) {
    push('AMBIGUOUS', 'absolute wording ("always/never") is ambiguous for this class');
  }

  /* 8 — explanation consistent with the correct answer */
  if (q.explanation && q.correct_option && q.options) {
    const correctText = norm(q.options[q.correct_option]);
    const expl = norm(q.explanation);
    const wrongTexts = keys
      .filter((k) => k !== q.correct_option)
      .map((k) => norm(q.options[k]))
      .filter((t) => t.length > 3);
    if (correctText && expl === correctText) {
      push('EXPLANATION_MISSING', 'explanation just repeats the answer');
    }
    if (wrongTexts.some((t) => expl === t)) {
      push('EXPLANATION_MISSING', 'explanation equals a wrong option');
    }
    if (words(q.explanation) > band.maxExplanationWords + 20) {
      push('CLASS_MISMATCH', 'explanation is too long for this class');
    }
  }

  /* 9 — source traceability (material mode only) */
  if (ctx.sourceMode === 'material' && !ctx.allowAdditionalKnowledge) {
    if (!q.source_reference || q.source_reference.type === 'additional_knowledge') {
      push('UNSOURCED', 'material mode requires a source_reference from the document');
    }
  }

  /* 10 — safety */
  const haystack = `${q.question || ''} ${optionTexts.join(' ')} ${q.explanation || ''} ${q.clue || ''}`;
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(haystack)) {
      push('UNSAFE', `matched blocked pattern ${re}`);
      break;
    }
  }

  /* extra — clue must not reveal the answer */
  if (q.clue && q.correct_option && q.options) {
    if (clueRevealsAnswer(q.clue, q.options[q.correct_option])) {
      push('CLUE_REVEALS_ANSWER', 'clue contains the correct option text');
    }
  }

  return {
    question_id: q && q.question_id ? q.question_id : null,
    pass: failures.length === 0,
    failures,
  };
}

/**
 * Validate a whole question bank (§8.4 across the set).
 * @returns {{ pass:boolean, results:Array, stats:object, byCode:object, safe:Array, rejected:Array }}
 */
export function validateBank(questions, ctx = {}) {
  const results = [];
  const accepted = [];
  for (const q of questions) {
    const res = validateQuestion(q, { ...ctx, seenQuestions: accepted });
    results.push(res);
    if (res.pass) accepted.push(q);
  }
  const byCode = {};
  results.forEach((r) => r.failures.forEach((f) => { byCode[f.code] = (byCode[f.code] || 0) + 1; }));
  const rejected = questions.filter((q) => !results.find((r) => r.question_id === q.question_id && r.pass));
  return {
    pass: results.every((r) => r.pass),
    results,
    stats: { total: questions.length, passed: accepted.length, failed: questions.length - accepted.length },
    byCode,
    safe: accepted,
    rejected,
  };
}

export default validateBank;
