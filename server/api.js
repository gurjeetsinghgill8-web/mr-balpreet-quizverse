/**
 * QUIZVERSE — REST API (PRODUCT_DEVELOPMENT.md §17)
 * ---------------------------------------------------------------------------
 * Teacher-facing endpoints for quizzes, versions, materials, results and
 * analytics, plus the student session handshake. The API is storage-agnostic:
 * every handler goes through server/storage.js.
 *
 * Privacy by design (PD §12.3): the only student data that can ever be stored is
 * a first name and the game result. There is no student account, no email, no
 * location, and no endpoint that exposes one student to another.
 */

import {
  hashPassword, verifyPassword, issueToken, verifyToken, issueSessionToken,
  normaliseEmail, validateRegistration, validatePackage, createRateLimiter, TOKEN_TTL_MS,
} from './auth.js';
import { publicTeacher, quizMeta, analyticsFromResults } from './storage.js';
import { randomUUID } from 'node:crypto';

function send(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const fail = (res, status, code, message, extra = {}) => send(res, status, { ok: false, error: { code, message, ...extra } });
const done = (res, payload) => send(res, 200, { ok: true, ...payload });

function readBody(req, limit = 1_500_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('payload too large'), { code: 'too_large' })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { code: 'bad_json' }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {object} options
 * @param {object} options.store   a storage adapter from server/storage.js
 * @param {string} options.secret  HMAC secret for teacher tokens
 * @param {string} [options.version]
 */
export function createApi({ store, secret, version = '1.0.0', rateLimit = true } = {}) {
  if (!store) throw new Error('createApi needs a store');
  if (!secret) throw new Error('createApi needs a token secret');

  const authLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });
  const limiterEnabled = rateLimit !== false;
  const started = Date.now();

  /* ---------------- helpers ---------------- */

  async function requireTeacher(req, res) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const check = verifyToken(token, secret);
    if (!check.ok) {
      fail(res, 401, check.code, 'Please sign in again.');
      return null;
    }
    const teacher = await store.teachers.findById(check.teacher_id);
    if (!teacher) {
      fail(res, 401, 'unknown_teacher', 'Please sign in again.');
      return null;
    }
    return teacher;
  }

  async function ownedQuiz(teacher, quizId, res) {
    const quiz = await store.quizzes.find(quizId);
    if (!quiz) { fail(res, 404, 'quiz_not_found', 'That quiz no longer exists.'); return null; }
    if (quiz.teacher_id !== teacher.teacher_id) { fail(res, 403, 'not_your_quiz', 'That quiz belongs to another teacher.'); return null; }
    return quiz;
  }

  const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();

  /* ---------------- routes ---------------- */

  const routes = [
    /* ---------- health ---------- */
    ['GET', /^\/api\/health$/, async (req, res) => done(res, {
      service: 'quizverse', version, storage: store.kind || 'unknown', uptime_seconds: Math.round((Date.now() - started) / 1000), time: new Date().toISOString(),
    })],

    /* ---------- auth ---------- */
    ['POST', /^\/api\/auth\/register$/, async (req, res) => {
      const limitKey = `register:${clientIp(req)}`;
      if (limiterEnabled && !authLimiter.check(limitKey).ok) {
        fail(res, 429, 'rate_limited', 'Too many failed attempts. Please wait a minute and try again.');
        return;
      }
      const body = await readBody(req);
      const check = validateRegistration(body);
      if (!check.ok) { authLimiter.fail(limitKey); fail(res, 400, 'invalid_input', check.problems[0].message, { problems: check.problems }); return; }
      const existing = await store.teachers.findByEmail(check.email);
      if (existing) { fail(res, 409, 'email_taken', 'An account with this email already exists. Try signing in.'); return; }

      const { password_hash, password_salt } = await hashPassword(body.password);
      const teacher = {
        teacher_id: `t_${randomUUID()}`,
        name: String(body.name).trim().slice(0, 80),
        email: check.email,
        school_name: String(body.school_name || '').trim().slice(0, 120) || null,
        password_hash,
        password_salt,
        created_at: new Date().toISOString(),
      };
      await store.teachers.create(teacher);
      authLimiter.succeed(limitKey);
      done(res, { token: issueToken(teacher.teacher_id, secret), expires_in_ms: TOKEN_TTL_MS, teacher: publicTeacher(teacher) });
    }],

    ['POST', /^\/api\/auth\/login$/, async (req, res) => {
      const limitKey = `login:${clientIp(req)}`;
      if (limiterEnabled && !authLimiter.check(limitKey).ok) {
        fail(res, 429, 'rate_limited', 'Too many failed attempts. Please wait a minute and try again.');
        return;
      }
      const body = await readBody(req);
      const email = normaliseEmail(body.email);
      const teacher = await store.teachers.findByEmail(email);
      // identical response for unknown email and wrong password (no account probing)
      const okPassword = teacher ? await verifyPassword(body.password, teacher.password_hash, teacher.password_salt) : false;
      if (!teacher || !okPassword) {
        authLimiter.fail(limitKey);
        fail(res, 401, 'bad_credentials', 'Email or password is not correct.');
        return;
      }
      authLimiter.succeed(limitKey);
      done(res, { token: issueToken(teacher.teacher_id, secret), expires_in_ms: TOKEN_TTL_MS, teacher: publicTeacher(teacher) });
    }],

    ['GET', /^\/api\/auth\/me$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      done(res, { teacher: publicTeacher(teacher) });
    }],

    ['PATCH', /^\/api\/auth\/me$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const body = await readBody(req);
      const updated = await store.teachers.update(teacher.teacher_id, {
        name: body.name ? String(body.name).trim().slice(0, 80) : null,
        school_name: body.school_name !== undefined ? String(body.school_name).trim().slice(0, 120) : null,
      });
      done(res, { teacher: publicTeacher(updated) });
    }],

    /* ---------- quizzes ---------- */
    ['GET', /^\/api\/quizzes$/, async (req, res, url) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const includePackage = url.searchParams.get('include') === 'package';
      const quizzes = await store.quizzes.list(teacher.teacher_id);
      done(res, {
        quizzes: includePackage
          ? quizzes.map((q) => ({ ...quizMeta(q), package: q.package }))
          : quizzes.map(quizMeta),
      });
    }],

    ['POST', /^\/api\/quizzes$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const body = await readBody(req);
      const check = validatePackage(body.package);
      if (!check.ok) { fail(res, 400, 'invalid_package', check.message); return; }

      const pkg = body.package;
      const existing = pkg.quiz_id ? await store.quizzes.find(pkg.quiz_id) : null;
      if (existing && existing.teacher_id !== teacher.teacher_id) { fail(res, 403, 'not_your_quiz', 'That quiz belongs to another teacher.'); return; }

      const quizId = existing ? existing.quiz_id : (pkg.quiz_id || `qz_${randomUUID()}`);
      const version = Number(pkg.version) || 1;
      const facts = {
        title: String(pkg.title || 'Untitled quiz').slice(0, 160),
        class_level: Number(pkg.class_level) || 0,
        subject: String(pkg.subject || 'General').slice(0, 80),
        topic: String(pkg.topic || 'General').slice(0, 160),
        language: pkg.language === 'hi' ? 'hi' : 'en',
        source_type: ['topic', 'material', 'mixed'].includes(pkg.source_type) ? pkg.source_type : 'topic',
        question_count: (pkg.stages || []).reduce((n, s) => n + (s.question_ids || []).length, 0),
      };

      if (!existing) {
        await store.quizzes.create({
          quiz_id: quizId,
          teacher_id: teacher.teacher_id,
          ...facts,
          current_version: version,
          package: { ...pkg, quiz_id: quizId },
          versions: [{ version, package: { ...pkg, quiz_id: quizId }, note: body.note || 'Saved from the app.', saved_at: new Date().toISOString() }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        await store.quizzes.addVersion(quizId, {
          version, package: { ...pkg, quiz_id: quizId }, note: body.note || 'Updated from the app.', saved_at: new Date().toISOString(),
        });
      }

      const saved = await store.quizzes.find(quizId);
      done(res, { quiz: quizMeta(saved) });
    }],

    ['GET', /^\/api\/quizzes\/([^/]+)$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      done(res, { quiz: { ...quizMeta(quiz), package: quiz.package } });
    }],

    ['PATCH', /^\/api\/quizzes\/([^/]+)$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      const body = await readBody(req);
      const patch = {};
      if (body.title) patch.title = String(body.title).slice(0, 160);
      if (body.package) {
        const check = validatePackage(body.package);
        if (!check.ok) { fail(res, 400, 'invalid_package', check.message); return; }
        await store.quizzes.addVersion(quiz.quiz_id, {
          version: Number(body.package.version) || (quiz.current_version + 1),
          package: { ...body.package, quiz_id: quiz.quiz_id },
          note: body.note || 'Edited by the teacher.',
          saved_at: new Date().toISOString(),
        });
      } else if (Object.keys(patch).length) {
        await store.quizzes.update(quiz.quiz_id, patch);
      }
      const updated = await store.quizzes.find(quiz.quiz_id);
      done(res, { quiz: quizMeta(updated) });
    }],

    ['DELETE', /^\/api\/quizzes\/([^/]+)$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      await store.quizzes.remove(quiz.quiz_id);
      done(res, { deleted: quiz.quiz_id });
    }],

    ['POST', /^\/api\/quizzes\/([^/]+)\/duplicate$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      const copyId = `qz_${randomUUID()}`;
      const copy = {
        ...quiz,
        quiz_id: copyId,
        teacher_id: teacher.teacher_id,
        title: `${quiz.title} (copy)`.slice(0, 160),
        current_version: 1,
        package: { ...quiz.package, quiz_id: copyId, version: 1 },
        versions: [{ version: 1, package: { ...quiz.package, quiz_id: copyId, version: 1 }, note: 'Duplicated.', saved_at: new Date().toISOString() }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await store.quizzes.create(copy);
      done(res, { quiz: quizMeta(copy) });
    }],

    ['GET', /^\/api\/quizzes\/([^/]+)\/versions$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      done(res, { versions: await store.quizzes.listVersions(quiz.quiz_id), current_version: quiz.current_version });
    }],

    ['GET', /^\/api\/quizzes\/([^/]+)\/versions\/(\d+)$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      const pkg = await store.quizzes.versionPackage(quiz.quiz_id, params[1]);
      if (!pkg) { fail(res, 404, 'version_not_found', 'That version is not available.'); return; }
      done(res, { version: Number(params[1]), package: pkg });
    }],

    ['POST', /^\/api\/quizzes\/([^/]+)\/versions$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quiz = await ownedQuiz(teacher, params[0], res);
      if (!quiz) return;
      const body = await readBody(req);
      const check = validatePackage(body.package);
      if (!check.ok) { fail(res, 400, 'invalid_package', check.message); return; }
      const version = Number(body.package.version) || (quiz.current_version + 1);
      await store.quizzes.addVersion(quiz.quiz_id, {
        version, package: { ...body.package, quiz_id: quiz.quiz_id }, note: body.note || null, saved_at: new Date().toISOString(),
      });
      done(res, { versions: await store.quizzes.listVersions(quiz.quiz_id) });
    }],

    /* ---------- materials ---------- */
    ['POST', /^\/api\/materials$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const body = await readBody(req);
      const text = String(body.text || '');
      if (text.trim().length < 40) { fail(res, 400, 'material_too_short', 'This material is too short to build questions from.'); return; }
      const material = {
        material_id: `m_${randomUUID()}`,
        teacher_id: teacher.teacher_id,
        file_name: String(body.file_name || 'pasted-text').slice(0, 160),
        file_type: String(body.file_type || 'text').slice(0, 40),
        extracted_text: text.slice(0, 200_000),
        page_count: Number(body.pages) || null,
        char_count: text.length,
        source_hash: String(body.source_hash || '').slice(0, 80) || null,
        created_at: new Date().toISOString(),
      };
      await store.materials.create(material);
      done(res, { material: { material_id: material.material_id, file_name: material.file_name, char_count: material.char_count, page_count: material.page_count } });
    }],

    ['GET', /^\/api\/materials\/([^/]+)$/, async (req, res, url, params) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const material = await store.materials.find(params[0]);
      if (!material || material.teacher_id !== teacher.teacher_id) { fail(res, 404, 'material_not_found', 'That material is not available.'); return; }
      done(res, { material });
    }],

    /* ---------- student sessions + results ---------- */
    ['POST', /^\/api\/sessions$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const body = await readBody(req);
      const quiz = await ownedQuiz(teacher, body.quiz_id, res);
      if (!quiz) return;
      const sessionId = `s_${randomUUID()}`;
      const sessionToken = issueSessionToken();
      await store.sessions.create({
        session_id: sessionId,
        quiz_id: quiz.quiz_id,
        teacher_id: teacher.teacher_id,
        session_token: sessionToken,
        student_name: String(body.student_name || '').trim().slice(0, 20) || null,
        quiz_version: Number(body.quiz_version) || quiz.current_version,
        started_at: new Date().toISOString(),
      });
      done(res, { session_id: sessionId, session_token: sessionToken, quiz: quizMeta(quiz), package_version: quiz.current_version });
    }],

    ['POST', /^\/api\/sessions\/([^/]+)\/finish$/, async (req, res, url, params) => {
      const body = await readBody(req);
      const session = await store.sessions.find(params[0]);
      if (!session) { fail(res, 404, 'session_not_found', 'That game session has expired.'); return; }
      if (session.session_token !== body.session_token) { fail(res, 403, 'bad_session_token', 'This game session is not valid.'); return; }

      // One session = exactly one result. A retry (flaky classroom wifi) must never
      // inflate the teacher's analytics, so the id is derived from the session.
      const playId = `p_${String(session.session_id).replace(/^s_/, '')}`;
      const existing = (await store.results.list(session.quiz_id)).find((r) => r.play_id === playId);
      if (existing) {
        done(res, {
          result: { play_id: existing.play_id, quiz_id: existing.quiz_id, status: existing.status, score: existing.score },
          idempotent: true,
        });
        return;
      }

      const result = body.result;
      if (!result || typeof result !== 'object') { fail(res, 400, 'invalid_result', 'A game result is required.'); return; }

      const row = {
        play_id: playId,
        session_id: result.session_id || session.session_id,
        quiz_id: session.quiz_id,
        teacher_id: session.teacher_id,
        student_name: String(result.student_name || 'Champion').slice(0, 20),
        class_level: Number(result.class_level) || null,
        topic: String(result.topic || '').slice(0, 160),
        mode: 'individual',
        score: Math.max(0, Number(result.score) || 0),
        max_score: Math.max(0, Number(result.max_score) || 0),
        accuracy: Math.max(0, Math.min(100, Number(result.accuracy) || 0)),
        correct: Math.max(0, Number(result.correct) || 0),
        incorrect: Math.max(0, Number(result.incorrect) || 0),
        stage_reached: Math.max(0, Math.min(5, Number(result.stage_reached) || 0)),
        stages_cleared: Math.max(0, Math.min(5, Number(result.stages_cleared) || 0)),
        status: ['WINNER', 'NOT_CLEARED', 'ABORTED'].includes(result.status) ? result.status : 'ABORTED',
        lifelines_used: Array.isArray(result.lifelines_used) ? result.lifelines_used.slice(0, 8) : [],
        per_question: Array.isArray(result.per_question) ? result.per_question.slice(0, 60) : [],
        per_stage: Array.isArray(result.per_stage) ? result.per_stage.slice(0, 8) : [],
        time_taken_seconds: Math.max(0, Number(result.time_taken_seconds) || 0),
        started_at: session.started_at,
        completed_at: new Date().toISOString(),
      };
      await store.results.create(row);
      await store.sessions.finish(session.session_id);
      done(res, { result: { play_id: row.play_id, quiz_id: row.quiz_id, status: row.status, score: row.score } });
    }],

    ['GET', /^\/api\/results$/, async (req, res, url) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quizId = url.searchParams.get('quiz_id');
      if (quizId) {
        const quiz = await ownedQuiz(teacher, quizId, res);
        if (!quiz) return;
      }
      const rows = (await store.results.list(quizId || null))
        .filter((r) => r.teacher_id === teacher.teacher_id || (!r.teacher_id && !quizId));
      done(res, { results: rows.slice(0, 500) });
    }],

    /**
     * Sync path: a game played fully offline on a student device is uploaded
     * here once the teacher is online. Idempotent on play_id (one play = one row).
     */
    ['POST', /^\/api\/results$/, async (req, res) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const body = await readBody(req);
      const quiz = await ownedQuiz(teacher, body.quiz_id, res);
      if (!quiz) return;
      const result = body.result;
      if (!result || typeof result !== 'object') { fail(res, 400, 'invalid_result', 'A game result is required.'); return; }

      const playId = String(result.play_id || `p_${randomUUID()}`);
      const existing = (await store.results.list(quiz.quiz_id)).find((r) => r.play_id === playId);
      if (existing) {
        done(res, { result: { play_id: existing.play_id, quiz_id: existing.quiz_id, status: existing.status, score: existing.score }, idempotent: true });
        return;
      }

      const row = {
        play_id: playId,
        session_id: String(result.session_id || playId),
        quiz_id: quiz.quiz_id,
        teacher_id: teacher.teacher_id,
        student_name: String(result.student_name || 'Champion').slice(0, 20),
        class_level: Number(result.class_level) || null,
        topic: String(result.topic || quiz.topic || '').slice(0, 160),
        mode: 'individual',
        score: Math.max(0, Number(result.score) || 0),
        max_score: Math.max(0, Number(result.max_score) || 0),
        accuracy: Math.max(0, Math.min(100, Number(result.accuracy) || 0)),
        correct: Math.max(0, Number(result.correct) || 0),
        incorrect: Math.max(0, Number(result.incorrect) || 0),
        stage_reached: Math.max(0, Math.min(5, Number(result.stage_reached) || 0)),
        stages_cleared: Math.max(0, Math.min(5, Number(result.stages_cleared) || 0)),
        status: ['WINNER', 'NOT_CLEARED', 'ABORTED'].includes(result.status) ? result.status : 'ABORTED',
        lifelines_used: Array.isArray(result.lifelines_used) ? result.lifelines_used.slice(0, 8) : [],
        per_question: Array.isArray(result.per_question) ? result.per_question.slice(0, 60) : [],
        per_stage: Array.isArray(result.per_stage) ? result.per_stage.slice(0, 8) : [],
        time_taken_seconds: Math.max(0, Number(result.time_taken_seconds) || 0),
        started_at: result.started_at || null,
        completed_at: result.completed_at || new Date().toISOString(),
      };
      await store.results.create(row);
      done(res, { result: { play_id: row.play_id, quiz_id: row.quiz_id, status: row.status, score: row.score } });
    }],

    ['GET', /^\/api\/analytics$/, async (req, res, url) => {
      const teacher = await requireTeacher(req, res);
      if (!teacher) return;
      const quizId = url.searchParams.get('quiz_id');
      if (quizId) {
        const quiz = await ownedQuiz(teacher, quizId, res);
        if (!quiz) return;
      }
      const rows = (await store.results.list(quizId || null)).filter((r) => r.teacher_id === teacher.teacher_id);
      const analytics = analyticsFromResults(rows);
      done(res, {
        analytics: {
          plays: analytics.plays, wins: analytics.wins, avgScore: analytics.avgScore,
          avgAccuracy: analytics.avgAccuracy, avgTime: analytics.avgTime,
          mostMissed: analytics.mostMissed, weakConcepts: analytics.weakConcepts,
        },
        results: analytics.rows.slice(0, 100),
      });
    }],
  ];

  /* ---------------- dispatcher ---------------- */

  return {
    routes,
    /** @returns {Promise<boolean>} true when the API handled the request */
    async handle(req, res, url) {
      const pathname = url.pathname;
      for (const [method, pattern, handler] of routes) {
        if (req.method !== method) continue;
        const match = pathname.match(pattern);
        if (!match) continue;
        try {
          await handler(req, res, url, match.slice(1).map((p) => decodeURIComponent(p)));
        } catch (err) {
          const code = err && err.code ? err.code : 'server_error';
          const message = code === 'too_large'
            ? 'That upload or quiz is too large.'
            : code === 'bad_json'
              ? 'The request could not be read.'
              : 'Something went wrong on the server. Please try again.';
          if (!res.headersSent) fail(res, code === 'server_error' ? 500 : 400, code, message);
        }
        return true;
      }
      if (pathname.startsWith('/api/')) {
        fail(res, 404, 'not_found', 'Unknown API endpoint.');
        return true;
      }
      return false;
    },
  };
}

export default createApi;
