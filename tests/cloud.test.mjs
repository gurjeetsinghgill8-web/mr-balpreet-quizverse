/**
 * QUIZVERSE — cloud sync tests (app/cloud.js)
 * Run:  node --test tests
 *
 * Cloud is local-first: these tests prove the sync queue (quizzes down, quizzes
 * up, results up) and the offline/static-host behaviour, using a scripted fetch.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Cloud } from '../app/cloud.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

let Store;
let calls;

const pkg = (quizId, version) => ({
  schema_version: '1.0', quiz_id: quizId, version, title: `Quiz ${quizId}`,
  class_level: 5, subject: 'Science', topic: 'Solar System', language: 'en', source_type: 'topic',
  settings: { timer_seconds: 30, lifelines: {} },
  stages: [{ stage: 1, question_ids: ['q1'], name: 'Warm-Up' }],
  questions: [{ question_id: 'q1', stage: 1, question: 'Q?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct_option: 'A', explanation: 'x', clue: 'y' }],
});

function installFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const res = await handler(String(url), init);
    return {
      ok: res.ok !== false,
      status: res.status || 200,
      json: async () => res.json,
    };
  };
}

beforeEach(async () => {
  memory.clear();
  calls = [];
  Store = (await import('../app/store.js')).Store;
  Store.init();
  Store.clearAll(); // the module singleton must not leak quizzes across tests
  Store.saveSettings({ cloudToken: '', cloudTeacher: null });
});

test('health returns null (offline/static host) and never throws', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal(await Cloud.health(), null);
  assert.equal(Cloud.signedIn(), false);
});

test('login stores the session, logout clears it', async () => {
  installFetch(async () => ({ json: { ok: true, token: 'tok.123', teacher: { name: 'Sunita', email: 's@x.in', school_name: 'SVM' } } }));
  const res = await Cloud.login({ email: 's@x.in', password: 'classroom123' });
  assert.equal(res.ok, true);
  assert.equal(Cloud.signedIn(), true);
  assert.equal(Cloud.teacher().name, 'Sunita');

  await Cloud.logout();
  assert.equal(Cloud.signedIn(), false);
});

test('sync pulls newer quizzes down and pushes local-only quizzes up', async () => {
  Store.addQuiz(pkg('qz_new', 1)); // local-only quiz
  const serverQuizzes = new Map([['qz_cloud', { quiz_id: 'qz_cloud', current_version: 2, updated_at: '2025-01-02', package: pkg('qz_cloud', 2) }]]);

  installFetch(async (url, init) => {
    if (url === '/api/health') return { json: { ok: true, service: 'quizverse' } };
    if (url === '/api/quizzes?include=package') {
      return { json: { ok: true, quizzes: [...serverQuizzes.values()] } };
    }
    if (url === '/api/quizzes' && init.method === 'POST') {
      // a real server remembers what was pushed
      const pushed = JSON.parse(init.body).package;
      serverQuizzes.set(pushed.quiz_id, { quiz_id: pushed.quiz_id, current_version: pushed.version || 1, updated_at: 'now', package: pushed });
      return { json: { ok: true } };
    }
    if (url === '/api/results' && init.method === 'POST') return { json: { ok: true } };
    return { json: { ok: true } };
  });

  Store.saveSettings({ cloudToken: 'tok.123' });
  const res = await Cloud.sync();

  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.summary.quizzesPulled, 1, 'the cloud quiz was downloaded');
  assert.equal(res.summary.quizzesPushed, 1, 'the local-only quiz was uploaded');
  assert.equal(res.summary.resultsPushed, 0);
  assert.ok(Store.getQuiz('qz_cloud'), 'cloud quiz is now in the local store');
  assert.equal(Store.getQuiz('qz_cloud').version, 2);

  // second sync: the pushed quiz now exists server-side, so nothing to re-send
  const second = await Cloud.sync();
  assert.equal(second.summary.quizzesPulled, 0);
  assert.equal(second.summary.quizzesPushed, 0);
});

test('sync uploads offline results and marks them synced', async () => {
  Store.addQuiz(pkg('qz_r', 1));
  Store.addResult({
    quiz_id: 'qz_r', student_name: 'Meera', score: 1000, accuracy: 80, correct: 4, incorrect: 1,
    stage_reached: 3, stages_cleared: 2, status: 'NOT_CLEARED', time_taken_seconds: 60,
    lifelines_used: [], topic: 'Solar System', per_question: [], per_stage: [],
  }, { topic: 'Solar System' });

  installFetch(async (url, init) => {
    if (url === '/api/health') return { json: { ok: true } };
    if (url === '/api/quizzes?include=package') return { json: { ok: true, quizzes: [] } };
    if (url === '/api/results' && init.method === 'POST') return { json: { ok: true } };
    return { json: { ok: true } };
  });
  Store.saveSettings({ cloudToken: 'tok.123' });

  assert.equal(Store.unsyncedResults().length, 1);
  const res = await Cloud.sync();
  assert.equal(res.summary.resultsPushed, 1);
  assert.equal(Store.unsyncedResults().length, 0, 'uploaded results leave the queue');

  const posted = calls.find((c) => c.url === '/api/results');
  assert.equal(posted.body.result.student_name, 'Meera');
  assert.ok(posted.body.result.play_id, 'results carry an idempotency key');
});

test('a failed server reports errors without throwing', async () => {
  Store.addQuiz(pkg('qz_bad', 1));
  installFetch(async (url) => {
    if (url === '/api/health') return { json: { ok: true } };
    if (url === '/api/quizzes?include=package') return { json: { ok: true, quizzes: [] } };
    if (url === '/api/quizzes' ) return { ok: false, status: 500, json: { ok: false, error: { code: 'server_error', message: 'boom' } } };
    return { json: { ok: true } };
  });
  Store.saveSettings({ cloudToken: 'tok.123' });

  const res = await Cloud.sync();
  assert.equal(res.ok, false);
  assert.equal(res.summary.quizzesPushed, 0);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /boom/);
});

test('signed-in state survives a page reload through localStorage', async () => {
  Store.saveSettings({ cloudToken: 'tok.abc', cloudTeacher: { name: 'Sunita', email: 's@x.in' } });
  Store.init(); // reload
  assert.equal(Cloud.signedIn(), true);
  assert.equal(Cloud.teacher().name, 'Sunita');
});
