/**
 * QUIZVERSE — REST API integration tests
 * ---------------------------------------------------------------------------
 * Boots the REAL server on a random port with in-memory storage and drives it
 * over HTTP, so routing, auth, validation, ownership and idempotency are all
 * exercised the way a client would use them.
 *
 * Run:  node --test tests/api.test.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../server.mjs';
import { createMemoryStore } from '../server/storage.js';
import { generateFromTopic } from '../app/offline-generator.js';

let app;
let base;

before(async () => {
  app = await createServer({ store: createMemoryStore(), secret: 'test-secret' });
  base = await app.listen(0);
});

after(async () => {
  await app.close();
});

/* ---------------- helpers ---------------- */

const api = async (path, { method = 'GET', body, token, raw } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = raw ? await res.text() : await res.json().catch(() => null);
  return { status: res.status, payload };
};

async function newTeacher(suffix = '') {
  const email = `teacher${suffix}${Math.random().toString(36).slice(2, 8)}@school.in`;
  const { payload } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Sunita Maam', email, password: 'classroom123', school_name: 'Sarita Vidya Mandir' },
  });
  return { token: payload.token, teacher: payload.teacher, email };
}

const packageFor = (topic = 'Solar System', classLevel = 5, count = 15) => {
  const res = generateFromTopic({ classLevel, topic, count });
  assert.equal(res.ok, true, `fixture generation failed for ${topic}`);
  return res.package;
};

/* ------------------------------------------------------------------ */
/* health + auth                                                       */
/* ------------------------------------------------------------------ */

test('health reports the service and its storage backend', async () => {
  const { status, payload } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'quizverse');
  assert.equal(payload.storage, 'memory');
  assert.ok(typeof payload.uptime_seconds === 'number');
});

test('registration validates input and never stores the raw password', async () => {
  const bad = await api('/api/auth/register', { method: 'POST', body: { name: 'X', email: 'nope', password: 'short' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.payload.error.code, 'invalid_input');
  assert.ok(bad.payload.error.problems.length >= 3, 'every field problem is reported');

  const { token, teacher } = await newTeacher('a');
  assert.ok(token.split('.').length === 2, 'the token is signed');
  assert.equal(teacher.school_name, 'Sarita Vidya Mandir');
  assert.equal(teacher.password_hash, undefined, 'the hash never leaves the server');
  assert.equal(teacher.password_salt, undefined);
});

test('an email cannot be registered twice', async () => {
  const { email } = await newTeacher('b');
  const again = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Someone', email, password: 'classroom123' },
  });
  assert.equal(again.status, 409);
  assert.equal(again.payload.error.code, 'email_taken');
});

test('login works and a wrong password gives the same message as an unknown email', async () => {
  const { email } = await newTeacher('c');
  const good = await api('/api/auth/login', { method: 'POST', body: { email, password: 'classroom123' } });
  assert.equal(good.status, 200);
  assert.ok(good.payload.token);

  const wrongPassword = await api('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-one' } });
  const unknownEmail = await api('/api/auth/login', { method: 'POST', body: { email: 'ghost@school.in', password: 'classroom123' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.payload.error.message, unknownEmail.payload.error.message, 'no account probing');
});

test('a forged or expired token is rejected', async () => {
  const noToken = await api('/api/auth/me');
  assert.equal(noToken.status, 401);
  assert.equal(noToken.payload.error.code, 'no_token');

  const forged = await api('/api/auth/me', { token: 'abc.def' });
  assert.equal(forged.status, 401);
  assert.equal(forged.payload.error.code, 'bad_signature');

  const { token } = await newTeacher('d');
  const [body] = token.split('.');
  const tampered = `${body}.${'A'.repeat(43)}`;
  const res = await api('/api/auth/me', { token: tampered });
  assert.equal(res.status, 401);
});

test('a teacher can update their name and school', async () => {
  const { token } = await newTeacher('e');
  const { status, payload } = await api('/api/auth/me', {
    method: 'PATCH', token, body: { name: 'Sunita Sharma', school_name: 'New School' },
  });
  assert.equal(status, 200);
  assert.equal(payload.teacher.name, 'Sunita Sharma');
  assert.equal(payload.teacher.school_name, 'New School');
});

/* ------------------------------------------------------------------ */
/* quizzes                                                             */
/* ------------------------------------------------------------------ */

test('a quiz package is stored, listed and fetched back intact', async () => {
  const { token } = await newTeacher('f');
  const pkg = packageFor();

  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: pkg } });
  assert.equal(created.status, 200);
  assert.equal(created.payload.quiz.question_count, 15);
  assert.equal(created.payload.quiz.current_version, 1);
  const quizId = created.payload.quiz.quiz_id;

  const list = await api('/api/quizzes', { token });
  assert.equal(list.payload.quizzes.length, 1);
  assert.equal(list.payload.quizzes[0].quiz_id, quizId);
  assert.equal(list.payload.quizzes[0].package, undefined, 'the list stays light');

  const full = await api(`/api/quizzes/${quizId}`, { token });
  assert.equal(full.payload.quiz.package.questions.length, pkg.questions.length);
  assert.equal(full.payload.quiz.package.stages.length, 5);

  const withPackages = await api('/api/quizzes?include=package', { token });
  assert.ok(withPackages.payload.quizzes[0].package, 'the opt-in includes the package');
});

test('an invalid package is refused before it reaches storage', async () => {
  const { token } = await newTeacher('g');
  const noStages = await api('/api/quizzes', { method: 'POST', token, body: { package: { questions: [{}], stages: [] } } });
  assert.equal(noStages.status, 400);
  assert.equal(noStages.payload.error.code, 'invalid_package');

  const emptyStage = await api('/api/quizzes', {
    method: 'POST', token, body: { package: { class_level: 5, questions: [{}], stages: [{ stage: 1, question_ids: [] }] } },
  });
  assert.equal(emptyStage.status, 400);
  assert.match(emptyStage.payload.error.message, /at least one question/i);

  const badClass = await api('/api/quizzes', {
    method: 'POST', token, body: { package: { class_level: 12, questions: [{}], stages: [{ stage: 1, question_ids: ['q1'] }] } },
  });
  assert.equal(badClass.status, 400);
});

test('a teacher cannot see or touch another teacher quiz', async () => {
  const owner = await newTeacher('h');
  const stranger = await newTeacher('i');
  const pkg = packageFor();
  const created = await api('/api/quizzes', { method: 'POST', token: owner.token, body: { package: pkg } });
  const quizId = created.payload.quiz.quiz_id;

  const read = await api(`/api/quizzes/${quizId}`, { token: stranger.token });
  assert.equal(read.status, 403);
  assert.equal(read.payload.error.code, 'not_your_quiz');

  const deleted = await api(`/api/quizzes/${quizId}`, { method: 'DELETE', token: stranger.token });
  assert.equal(deleted.status, 403);

  const strangerList = await api('/api/quizzes', { token: stranger.token });
  assert.equal(strangerList.payload.quizzes.length, 0);
});

test('editing creates a new immutable version, and old versions stay available', async () => {
  const { token } = await newTeacher('j');
  const pkg = packageFor();
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: pkg } });
  const quizId = created.payload.quiz.quiz_id;

  const edited = { ...pkg, version: 2, title: 'Class 5 – Solar System (edited)' };
  const patched = await api(`/api/quizzes/${quizId}`, { method: 'PATCH', token, body: { package: edited } });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.quiz.current_version, 2);
  assert.equal(patched.payload.quiz.title, 'Class 5 – Solar System (edited)');

  const versions = await api(`/api/quizzes/${quizId}/versions`, { token });
  assert.equal(versions.payload.current_version, 2);
  assert.deepEqual(versions.payload.versions.map((v) => v.version).sort(), [1, 2]);

  const v1 = await api(`/api/quizzes/${quizId}/versions/1`, { token });
  assert.equal(v1.payload.package.version, 1);
  assert.equal(v1.payload.package.title, pkg.title, 'version 1 is untouched');

  const missing = await api(`/api/quizzes/${quizId}/versions/9`, { token });
  assert.equal(missing.status, 404);
});

test('duplicate, rename and delete behave as a teacher expects', async () => {
  const { token } = await newTeacher('k');
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: packageFor() } });
  const quizId = created.payload.quiz.quiz_id;

  const copy = await api(`/api/quizzes/${quizId}/duplicate`, { method: 'POST', token });
  assert.equal(copy.status, 200);
  assert.match(copy.payload.quiz.title, /\(copy\)$/);
  assert.notEqual(copy.payload.quiz.quiz_id, quizId);

  const renamed = await api(`/api/quizzes/${quizId}`, { method: 'PATCH', token, body: { title: 'Monday revision' } });
  assert.equal(renamed.payload.quiz.title, 'Monday revision');

  const removed = await api(`/api/quizzes/${quizId}`, { method: 'DELETE', token });
  assert.equal(removed.payload.deleted, quizId);
  const after = await api(`/api/quizzes/${quizId}`, { token });
  assert.equal(after.status, 404);
  assert.equal((await api('/api/quizzes', { token })).payload.quizzes.length, 1, 'only the copy remains');
});

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

test('teacher material is stored with its text and page count', async () => {
  const { token } = await newTeacher('l');
  const text = 'Photosynthesis is the process by which green plants make food using sunlight. '
    + 'Chlorophyll is the green pigment in leaves that absorbs sunlight.';
  const created = await api('/api/materials', {
    method: 'POST', token, body: { file_name: 'plants.pdf', file_type: 'pdf', text, pages: 3 },
  });
  assert.equal(created.status, 200);
  assert.equal(created.payload.material.page_count, 3);
  assert.equal(created.payload.material.char_count, text.length);

  const fetched = await api(`/api/materials/${created.payload.material.material_id}`, { token });
  assert.equal(fetched.payload.material.extracted_text, text);

  const tooShort = await api('/api/materials', { method: 'POST', token, body: { text: 'too short' } });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.payload.error.code, 'material_too_short');
});

/* ------------------------------------------------------------------ */
/* student sessions + results + analytics                              */
/* ------------------------------------------------------------------ */

const finishedResult = (student = 'Aarav') => ({
  student_name: student, score: 4200, max_score: 6300, accuracy: 86.7, correct: 13, incorrect: 2,
  stage_reached: 5, stages_cleared: 5, status: 'WINNER', time_taken_seconds: 272,
  lifelines_used: ['clue'], topic: 'Solar System',
  per_question: [
    { question_id: 'sol_01', is_correct: false, concept_tag: 'planet identity' },
    { question_id: 'sol_02', is_correct: true, concept_tag: 'planet identity' },
    { question_id: 'sol_03', is_correct: false, concept_tag: 'orbits' },
  ],
});

test('a student session is opened with a token and finished with a result', async () => {
  const { token } = await newTeacher('m');
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: packageFor() } });
  const quizId = created.payload.quiz.quiz_id;

  const session = await api('/api/sessions', { method: 'POST', token, body: { quiz_id: quizId, student_name: 'Aarav' } });
  assert.equal(session.status, 200);
  assert.ok(session.payload.session_id.startsWith('s_'));
  assert.ok(session.payload.session_token.length > 20);

  const finished = await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: session.payload.session_token, result: finishedResult() },
  });
  assert.equal(finished.status, 200);
  assert.equal(finished.payload.result.status, 'WINNER');

  const results = await api(`/api/results?quiz_id=${quizId}`, { token });
  assert.equal(results.payload.results.length, 1);
  assert.equal(results.payload.results[0].student_name, 'Aarav');
});

test('resubmitting a result is idempotent — a wifi retry cannot inflate analytics', async () => {
  const { token } = await newTeacher('n');
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: packageFor() } });
  const quizId = created.payload.quiz.quiz_id;
  const session = await api('/api/sessions', { method: 'POST', token, body: { quiz_id: quizId, student_name: 'Meera' } });

  const first = await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: session.payload.session_token, result: finishedResult('Meera') },
  });
  const second = await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: session.payload.session_token, result: finishedResult('Meera') },
  });
  const third = await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: session.payload.session_token, result: finishedResult('Meera') },
  });

  assert.equal(second.payload.idempotent, true);
  assert.equal(third.payload.idempotent, true);
  assert.equal(second.payload.result.play_id, first.payload.result.play_id);

  const results = await api(`/api/results?quiz_id=${quizId}`, { token });
  assert.equal(results.payload.results.length, 1, 'exactly one play is recorded');
});

test('a result cannot be submitted with the wrong session token', async () => {
  const { token } = await newTeacher('o');
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: packageFor() } });
  const session = await api('/api/sessions', { method: 'POST', token, body: { quiz_id: created.payload.quiz.quiz_id } });

  const forged = await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: 'not-the-token', result: finishedResult() },
  });
  assert.equal(forged.status, 403);
  assert.equal(forged.payload.error.code, 'bad_session_token');

  const unknown = await api('/api/sessions/s_nope/finish', {
    method: 'POST', body: { session_token: 'x', result: finishedResult() },
  });
  assert.equal(unknown.status, 404);
});

test('analytics aggregate plays, scores, the most missed question and weak concepts', async () => {
  const { token } = await newTeacher('p');
  const created = await api('/api/quizzes', { method: 'POST', token, body: { package: packageFor() } });
  const quizId = created.payload.quiz.quiz_id;

  for (let i = 0; i < 3; i++) {
    const session = await api('/api/sessions', { method: 'POST', token, body: { quiz_id: quizId, student_name: `Child${i}` } });
    await api(`/api/sessions/${session.payload.session_id}/finish`, {
      method: 'POST',
      body: { session_token: session.payload.session_token, result: finishedResult(`Child${i}`) },
    });
  }

  const { payload } = await api(`/api/analytics?quiz_id=${quizId}`, { token });
  assert.equal(payload.analytics.plays, 3);
  assert.equal(payload.analytics.wins, 3);
  assert.equal(payload.analytics.avgAccuracy, 86.7);
  assert.equal(payload.analytics.avgScore, 4200);
  assert.equal(payload.results.length, 3);

  const weak = payload.analytics.weakConcepts.map((c) => c.tag);
  assert.ok(weak.includes('planet identity'), JSON.stringify(payload.analytics.weakConcepts));
  assert.ok(payload.analytics.mostMissed, 'a most-missed question is reported');
});

test('analytics never leak another teacher results', async () => {
  const owner = await newTeacher('q');
  const stranger = await newTeacher('r');
  const created = await api('/api/quizzes', { method: 'POST', token: owner.token, body: { package: packageFor() } });
  const quizId = created.payload.quiz.quiz_id;
  const session = await api('/api/sessions', { method: 'POST', token: owner.token, body: { quiz_id: quizId } });
  await api(`/api/sessions/${session.payload.session_id}/finish`, {
    method: 'POST', body: { session_token: session.payload.session_token, result: finishedResult() },
  });

  const strangerAnalytics = await api('/api/analytics', { token: stranger.token });
  assert.equal(strangerAnalytics.payload.analytics.plays, 0);

  const crossQuiz = await api(`/api/analytics?quiz_id=${quizId}`, { token: stranger.token });
  assert.equal(crossQuiz.status, 403);
});

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

test('unknown API routes answer with JSON, not the app shell', async () => {
  const { status, payload } = await api('/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(payload.error.code, 'not_found');
});

test('a malformed body is rejected cleanly', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json',
  });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.error.code, 'bad_json');
});

test('the static app is still served next to the API, and / redirects into it', async () => {
  const shell = await fetch(`${base}/app/`);
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /QUIZVERSE/);

  const redirect = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/app/');

  const engine = await fetch(`${base}/packages/game-engine/engine.js`);
  assert.equal(engine.status, 200, 'the browser imports the engine straight from packages/');
});

test('server code, tests and stored data are never served to a browser', async () => {
  for (const path of ['/server.mjs', '/server/api.js', '/server/storage.js', '/.env', '/product_development.md',
    '/tests/api.test.mjs', '/tools/smoke.mjs', '/.data/teachers.json', '/package.json', '/server/schema.sql']) {
    const res = await fetch(`${base}${path}`, { redirect: 'manual' });
    assert.ok([403, 404].includes(res.status), `${path} must not be public (got ${res.status})`);
  }

  // and a traversal attempt cannot escape the allowlist either
  const encoded = await fetch(`${base}/app/%2e%2e/server/storage.js`, { redirect: 'manual' });
  assert.ok([403, 404].includes(encoded.status), `encoded traversal must fail (got ${encoded.status})`);
});

test('the AI proxy still answers with the mock provider', async () => {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'mock',
      delay_ms: 0,
      messages: [{ role: 'user', content: 'class_level: 5\nlanguage: en\nquestion_count: 5\nsingle_question: true' }],
    }),
  });
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.transport, 'mock');
  const parsed = JSON.parse(payload.text);
  assert.ok(Array.isArray(parsed.questions));
});

test('the AI status endpoint lists every provider and never leaks a key', async () => {
  const { payload } = await api('/api/ai/status');
  assert.ok(payload.providers.length >= 6);
  assert.equal(typeof payload.serverKeyConfigured, 'boolean');
  assert.equal(JSON.stringify(payload).includes('sk-'), false);
});
