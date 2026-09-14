/**
 * QUIZVERSE — CLOUD CLIENT
 * ---------------------------------------------------------------------------
 * The bridge between the browser and the teacher-account API (§17). The app is
 * local-first: everything keeps working with no account and no network, and this
 * module only adds backup + sync when the teacher signs in and the server exists.
 *
 * On a static host (Netlify / GitHub Pages) there is no server, so every call
 * reports "no server" and the UI explains that live AI / accounts need the Node
 * deployment (see DEPLOY.md option 2).
 */

import { Store } from './store.js';

export const Cloud = {
  /** Is there a reachable API at all? Cached briefly. */
  async health() {
    try {
      const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  token() { return Store.settings().cloudToken || null; },
  teacher() { return Store.settings().cloudTeacher || null; },
  signedIn() { return Boolean(Cloud.token()); },

  async _call(path, { method = 'GET', body, auth = true } = {}) {
    const health = await Cloud.health();
    if (!health) return { ok: false, offline: true, message: 'No server — you are on a static host or offline.' };

    const res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && Cloud.token() ? { Authorization: `Bearer ${Cloud.token()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok === false) {
      const code = payload && payload.error ? payload.error.code : 'http_error';
      const message = payload && payload.error ? payload.error.message : 'Request failed.';
      return { ok: false, status: res.status, code, message };
    }
    return { ok: true, ...payload };
  },

  async register({ name, email, password, school }) {
    const res = await Cloud._call('/api/auth/register', { method: 'POST', auth: false, body: { name, email, password, school_name: school } });
    if (res.ok) Cloud._storeSession(res);
    return res;
  },

  async login({ email, password }) {
    const res = await Cloud._call('/api/auth/login', { method: 'POST', auth: false, body: { email, password } });
    if (res.ok) Cloud._storeSession(res);
    return res;
  },

  async logout() {
    Store.saveSettings({ cloudToken: '', cloudTeacher: null });
    return { ok: true };
  },

  _storeSession(res) {
    Store.saveSettings({ cloudToken: res.token || '', cloudTeacher: res.teacher || null });
  },

  async me() {
    const res = await Cloud._call('/api/auth/me');
    if (res.ok) Store.saveSettings({ cloudTeacher: res.teacher });
    return res;
  },

  /** Push a quiz package (creates or appends a version server-side). */
  async pushQuiz(pkg) {
    return Cloud._call('/api/quizzes', { method: 'POST', body: { package: pkg } });
  },

  /** Fetch every quiz + package for the signed-in teacher. */
  async pullQuizzes() {
    return Cloud._call('/api/quizzes?include=package');
  },

  async deleteQuiz(quizId) {
    return Cloud._call(`/api/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
  },

  /** Upload one locally-played result. Idempotent on play_id. */
  async pushResult(row) {
    return Cloud._call('/api/results', { method: 'POST', body: { quiz_id: row.quiz_id, result: row } });
  },

  /**
   * Two-way sync: pull the teacher's cloud quizzes down, push local quizzes that
   * are missing, then upload the offline-played results.
   * @returns {{ ok:boolean, summary:{quizzesPulled:number, quizzesPushed:number, resultsPushed:number}, errors:Array }}
   */
  async sync() {
    const summary = { quizzesPulled: 0, quizzesPushed: 0, resultsPushed: 0 };
    const errors = [];

    const pulled = await Cloud.pullQuizzes();
    if (!pulled.ok) return { ok: false, summary, errors: [pulled.message || 'Could not reach the server.'], offline: pulled.offline };

    const serverById = new Map((pulled.quizzes || []).map((q) => [q.quiz_id, q]));

    // 1) pull newer / missing quizzes
    for (const server of pulled.quizzes || []) {
      const local = Store.getQuiz(server.quiz_id);
      if (!local || (Number(local.version || 1) < Number(server.current_version || 1))) {
        if (server.package) {
          Store.addQuiz(server.package);
          Store.markQuizSynced(server.quiz_id, server.updated_at);
          summary.quizzesPulled += 1;
        }
      }
    }

    // 2) push local quizzes the server doesn't have
    for (const meta of Store.quizzes()) {
      if (serverById.has(meta.quiz_id)) continue;
      const pushed = await Cloud.pushQuiz(Store.getQuiz(meta.quiz_id));
      if (pushed.ok) { Store.markQuizSynced(meta.quiz_id); summary.quizzesPushed += 1; }
      else errors.push(`Quiz "${meta.title}": ${pushed.message || 'failed'}`);
    }

    // 3) upload results played offline
    for (const row of Store.unsyncedResults()) {
      const pushed = await Cloud.pushResult(row);
      if (pushed.ok) { Store.markResultSynced(row.play_id); summary.resultsPushed += 1; }
      else errors.push(`Result for "${row.student_name}": ${pushed.message || 'failed'}`);
    }

    return { ok: errors.length === 0, summary, errors, offline: false };
  },
};

export default Cloud;
