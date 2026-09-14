/**
 * QUIZVERSE — Layer 3 (UI modules) integrity tests
 * Run:  node --test tests
 *
 * Catches the boring failures that ruin a demo: a missing illustration key,
 * a translation key that was never written, a mascot expression typo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { illustrationSVG, ILLUSTRATION_KEYS } from '../app/illustrations.js';
import { quizoSVG } from '../app/mascot.js';
import { STRINGS, t, setLang } from '../app/i18n.js';
import { PACKS } from '../app/data/packs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* illustrations                                                       */
/* ------------------------------------------------------------------ */

test('every illustration referenced by the question library exists', () => {
  const referenced = new Set();
  PACKS.forEach((p) => p.questions.forEach((q) => { if (q.illustration) referenced.add(q.illustration); }));
  const missing = [...referenced].filter((key) => !ILLUSTRATION_KEYS.includes(key));
  assert.deepEqual(missing, [], `missing illustration keys: ${missing.join(', ')}`);
  assert.ok(referenced.size >= 20, `only ${referenced.size} illustrations are actually used`);
});

test('an unknown illustration key degrades to an empty string instead of crashing', () => {
  assert.equal(illustrationSVG('does_not_exist'), '');
  assert.equal(illustrationSVG(null), '');
  assert.equal(illustrationSVG(undefined), '');
});

/** The SVG namespace is fine; a real remote asset is not. */
function hasExternalAsset(svg) {
  return /(?:src|href)\s*=\s*"https?:\/\//i.test(svg) || /url\(\s*['"]?https?:/i.test(svg);
}

test('rendered illustrations are valid, non-empty inline SVG with no external refs', () => {
  for (const key of ILLUSTRATION_KEYS) {
    const svg = illustrationSVG(key);
    assert.ok(svg.startsWith('<svg'), `${key} did not render`);
    assert.ok(svg.includes('viewBox="0 0 120 120"'), `${key} lost its viewBox`);
    assert.ok(!hasExternalAsset(svg), `${key} references an external asset`);
    assert.ok(svg.includes('</svg>'), `${key} is not closed`);
  }
});

/* ------------------------------------------------------------------ */
/* mascot                                                              */
/* ------------------------------------------------------------------ */

test('mascot renders every expression and carries no external assets', () => {
  for (const expression of ['idle', 'welcome', 'thinking', 'celebrate', 'encourage', 'oops']) {
    const svg = quizoSVG(expression, 120);
    assert.ok(svg.includes(`data-expression="${expression}"`), `${expression} missing`);
    assert.ok(svg.includes('</svg>'));
    assert.ok(!hasExternalAsset(svg), `${expression} references an external asset`);
  }
  // an unknown expression must fall back to idle, never break the screen
  assert.ok(quizoSVG('nonsense', 120).includes('data-expression="idle"'));
});

test('mascot lines are short, encouraging and never humiliating', async () => {
  const { QUIZO_LINES } = await import('../app/mascot.js');
  const banned = /stupid|wrong again|failure|loser|shame|idiot/i;
  for (const [lang, dict] of Object.entries(QUIZO_LINES)) {
    for (const [key, fn] of Object.entries(dict)) {
      const line = fn(key === 'stageClear' ? 2 : 'Aarav');
      assert.ok(line.length > 0, `${lang}.${key} is empty`);
      assert.ok(line.split(/\s+/).length <= 12, `${lang}.${key} is too long: "${line}"`);
      assert.ok(!banned.test(line), `${lang}.${key} uses banned language: "${line}"`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* i18n coverage                                                       */
/* ------------------------------------------------------------------ */

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('every t() key used in the app exists in both languages', async () => {
  const files = [...await sourceFiles(path.join(ROOT, 'app')), path.join(ROOT, 'app', 'app.js')];
  const used = new Set();
  for (const file of files) {
    const code = await readFile(file, 'utf8');
    for (const match of code.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(match[1]);
    for (const match of code.matchAll(/\bt\(\s*`([^`$]+)`/g)) used.add(match[1]);
  }
  assert.ok(used.size > 40, `only ${used.size} translation keys detected`);

  const missingEn = [...used].filter((key) => !(key in STRINGS.en));
  const missingHi = [...used].filter((key) => !(key in STRINGS.hi));
  assert.deepEqual(missingEn, [], `missing EN strings: ${missingEn.join(', ')}`);
  assert.deepEqual(missingHi, [], `missing HI strings: ${missingHi.join(', ')}`);
});

test('language switching affects interpolation and falls back safely', () => {
  setLang('en');
  assert.equal(t('win.title', { name: 'Aarav' }), 'CONGRATULATIONS Aarav!');
  setLang('hi');
  assert.equal(t('win.title', { name: 'आरव' }), 'बधाई हो आरव!');
  assert.equal(t('does.not.exist'), 'does.not.exist');
  setLang('en');
  assert.equal(t('stage.complete', { n: 3 }), 'STAGE 3 COMPLETE!');
});

test('student feedback language is never humiliating (EN + HI)', () => {
  const banned = ['stupid', 'failure', 'wrong again', 'बेवकूफ', 'नालायक', 'फेल'];
  for (const dict of Object.values(STRINGS)) {
    for (const [key, value] of Object.entries(dict)) {
      const text = String(value).toLowerCase();
      banned.forEach((word) => {
        assert.ok(!text.includes(word), `${key} contains banned word "${word}"`);
      });
    }
  }
});

/* ------------------------------------------------------------------ */
/* store                                                              */
/* ------------------------------------------------------------------ */

test('store persists quizzes, results and analytics (localStorage stub)', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };

  const { Store } = await import('../app/store.js');
  const { generateFromTopic } = await import('../app/offline-generator.js');
  Store.init();
  const pkg = generateFromTopic({ classLevel: 5, topic: 'Solar System', count: 15 }).package;

  Store.addQuiz(pkg);
  assert.equal(Store.quizzes().length, 1);
  assert.equal(Store.getQuiz(pkg.quiz_id).title, pkg.title);

  Store.addResult({
    quiz_id: pkg.quiz_id,
    student_name: 'Aarav',
    score: 1200,
    accuracy: 80,
    correct: 4,
    incorrect: 1,
    stage_reached: 3,
    stages_cleared: 2,
    time_taken_seconds: 120,
    lifelines_used: ['clue'],
    status: 'NOT_CLEARED',
    topic: pkg.topic,
    per_question: [
      { question_id: pkg.questions[0].question_id, is_correct: false, concept_tag: 'planet identity' },
      { question_id: pkg.questions[1].question_id, is_correct: true, concept_tag: 'planet identity' },
    ],
  }, { topic: pkg.topic, subject: pkg.subject });

  const analytics = Store.analytics();
  assert.equal(analytics.plays, 1);
  assert.equal(analytics.avgScore, 1200);
  assert.equal(analytics.mostMissed.question_id, pkg.questions[0].question_id);
  assert.equal(analytics.weakConcepts.length, 1);
  assert.ok(Store.questionText(pkg.questions[0].question_id).length > 5);

  Store.removeQuiz(pkg.quiz_id);
  assert.equal(Store.quizzes().length, 0);
  assert.equal(Store.results().length, 0, 'deleting a quiz removes its results (privacy control)');
});

test('the create-form draft survives a refresh (material is never lost)', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const { Store } = await import('../app/store.js');

  Store.init();
  assert.equal(Store.draft(), null);

  Store.saveDraft({
    classLevel: 6,
    topic: 'Plants',
    language: 'en',
    materialText: 'Photosynthesis is how plants make food. ' + 'x'.repeat(50000),
    fileMeta: { fileName: 'lesson.pdf', pages: 4 },
  });

  const draft = Store.draft();
  assert.equal(draft.classLevel, 6);
  assert.equal(draft.fileMeta.fileName, 'lesson.pdf');
  assert.equal(draft.materialText.length, 40000, 'huge material is capped before it hits localStorage');
  assert.equal(draft.materialTruncated, true);

  // a fresh read (simulating a page reload) still sees the draft
  Store.init();
  assert.equal(Store.draft().topic, 'Plants');

  Store.clearDraft();
  assert.equal(Store.draft(), null);
});
