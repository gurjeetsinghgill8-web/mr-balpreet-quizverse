/**
 * QUIZVERSE — SERVER STORAGE ADAPTERS
 * ---------------------------------------------------------------------------
 * The REST API (PD §17) talks to a small storage interface so the deployment can
 * choose where data lives without touching business logic:
 *
 *   • createFileStore(dir)   zero-dependency JSON files — the demo / small school
 *   • createMemoryStore()    for tests
 *   • createPostgresStore()  the production path (PD §16 schema, see schema.sql)
 *
 * Interface (all async):
 *   teachers.create/findByEmail/findById/update
 *   quizzes.create/list/find/update/remove/addVersion/listVersions/versionPackage
 *   results.create/list/markSynced
 *   materials.create/find
 *   sessions.create/find/finish
 *   close()
 */

import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();

/* ================================================================== */
/* shared helpers                                                      */
/* ================================================================== */

/** Keep only the fields the API contract promises, so nothing leaks. */
export function publicTeacher(teacher) {
  if (!teacher) return null;
  return {
    teacher_id: teacher.teacher_id,
    name: teacher.name,
    email: teacher.email,
    school_name: teacher.school_name || null,
    created_at: teacher.created_at,
  };
}

export function quizMeta(quiz) {
  if (!quiz) return null;
  return {
    quiz_id: quiz.quiz_id,
    title: quiz.title,
    class_level: quiz.class_level,
    subject: quiz.subject,
    topic: quiz.topic,
    language: quiz.language,
    source_type: quiz.source_type,
    question_count: quiz.question_count,
    current_version: quiz.current_version,
    version_count: (quiz.versions || []).length,
    created_at: quiz.created_at,
    updated_at: quiz.updated_at,
  };
}

export function analyticsFromResults(results = []) {
  if (!results.length) {
    return { plays: 0, wins: 0, avgScore: 0, avgAccuracy: 0, avgTime: 0, mostMissed: null, weakConcepts: [], rows: [] };
  }
  const sums = results.reduce((acc, r) => {
    acc.score += r.score || 0;
    acc.accuracy += r.accuracy || 0;
    acc.time += r.time_taken_seconds || 0;
    if (r.status === 'WINNER') acc.wins += 1;
    return acc;
  }, { score: 0, accuracy: 0, time: 0, wins: 0 });

  const missed = new Map();
  const concepts = new Map();
  results.forEach((r) => {
    (r.per_question || []).forEach((pq) => {
      const m = missed.get(pq.question_id) || { question_id: pq.question_id, wrong: 0, total: 0 };
      m.total += 1;
      if (!pq.is_correct) m.wrong += 1;
      missed.set(pq.question_id, m);

      if (pq.concept_tag) {
        const c = concepts.get(pq.concept_tag) || { tag: pq.concept_tag, correct: 0, total: 0 };
        c.total += 1;
        if (pq.is_correct) c.correct += 1;
        concepts.set(pq.concept_tag, c);
      }
    });
  });

  const mostMissed = [...missed.values()].filter((m) => m.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.total - a.total)[0] || null;

  return {
    plays: results.length,
    wins: sums.wins,
    avgScore: Math.round(sums.score / results.length),
    avgAccuracy: Math.round((sums.accuracy / results.length) * 10) / 10,
    avgTime: Math.round(sums.time / results.length),
    mostMissed,
    weakConcepts: [...concepts.values()]
      .map((c) => ({ ...c, accuracy: Math.round((c.correct / c.total) * 100) }))
      .filter((c) => c.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6),
    rows: results,
  };
}

function packageFacts(pkg = {}) {
  const stages = Array.isArray(pkg.stages) ? pkg.stages : [];
  return {
    title: String(pkg.title || 'Untitled quiz').slice(0, 160),
    class_level: Number(pkg.class_level) || 0,
    subject: String(pkg.subject || 'General').slice(0, 80),
    topic: String(pkg.topic || 'General').slice(0, 160),
    language: pkg.language === 'hi' ? 'hi' : 'en',
    source_type: ['topic', 'material', 'mixed'].includes(pkg.source_type) ? pkg.source_type : 'topic',
    question_count: stages.reduce((n, s) => n + (Array.isArray(s.question_ids) ? s.question_ids.length : 0), 0),
  };
}

/* ================================================================== */
/* 1) file store                                                       */
/* ================================================================== */

export async function createFileStore(dir) {
  const root = path.resolve(dir);
  await mkdir(root, { recursive: true });

  const file = (name) => path.join(root, name);
  let cache = {
    teachers: null,
    quizzes: null,   // Map quiz_id -> record
    results: null,
    materials: null,
    sessions: null,
  };

  async function readJson(name, fallback) {
    try {
      return JSON.parse(await readFile(file(name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  async function writeJson(name, value) {
    const tmp = file(`${name}.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
    await rename(tmp, file(name)); // atomic replace
  }

  async function load(collection) {
    if (cache[collection]) return cache[collection];
    if (collection === 'quizzes') {
      const list = await readJson('quizzes.json', []);
      cache.quizzes = new Map(list.map((q) => [q.quiz_id, q]));
      return cache.quizzes;
    }
    cache[collection] = await readJson(`${collection}.json`, []);
    return cache[collection];
  }

  const persistTeachers = async () => writeJson('teachers', await load('teachers'));
  const persistQuizzes = async () => writeJson('quizzes', [...(await load('quizzes')).values()]);
  const persistResults = async () => writeJson('results', await load('results'));
  const persistMaterials = async () => writeJson('materials', await load('materials'));
  const persistSessions = async () => writeJson('sessions', await load('sessions'));

  return {
    kind: 'file',
    dir: root,

    teachers: {
      async create(teacher) {
        const list = await load('teachers');
        list.push(teacher);
        await persistTeachers();
        return teacher;
      },
      async findByEmail(email) {
        const list = await load('teachers');
        return list.find((t) => t.email === String(email).toLowerCase()) || null;
      },
      async findById(id) {
        const list = await load('teachers');
        return list.find((t) => t.teacher_id === id) || null;
      },
      async update(id, patch) {
        const list = await load('teachers');
        const index = list.findIndex((t) => t.teacher_id === id);
        if (index < 0) return null;
        list[index] = { ...list[index], ...patch, updated_at: nowIso() };
        await persistTeachers();
        return list[index];
      },
    },

    quizzes: {
      async create(quiz) {
        const map = await load('quizzes');
        map.set(quiz.quiz_id, quiz);
        await persistQuizzes();
        return quiz;
      },
      async list(teacherId) {
        const map = await load('quizzes');
        return [...map.values()].filter((q) => q.teacher_id === teacherId)
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      },
      async find(quizId) {
        const map = await load('quizzes');
        return map.get(quizId) || null;
      },
      async update(quizId, patch) {
        const map = await load('quizzes');
        const current = map.get(quizId);
        if (!current) return null;
        const next = { ...current, ...patch, updated_at: nowIso() };
        map.set(quizId, next);
        await persistQuizzes();
        return next;
      },
      async remove(quizId) {
        const map = await load('quizzes');
        const existed = map.delete(quizId);
        await persistQuizzes();
        return existed;
      },
      async addVersion(quizId, version) {
        const map = await load('quizzes');
        const current = map.get(quizId);
        if (!current) return null;
        const versions = (current.versions || []).filter((v) => v.version !== version.version);
        versions.push(version);
        versions.sort((a, b) => a.version - b.version);
        const next = {
          ...current,
          versions,
          current_version: version.version,
          updated_at: nowIso(),
          package: version.package,
          ...packageFacts(version.package),
        };
        map.set(quizId, next);
        await persistQuizzes();
        return next;
      },
      async listVersions(quizId) {
        const quiz = await this.find(quizId);
        if (!quiz) return [];
        return (quiz.versions || []).map((v) => ({
          version: v.version, saved_at: v.saved_at, note: v.note || null,
          question_count: packageFacts(v.package).question_count,
        })).sort((a, b) => b.version - a.version);
      },
      async versionPackage(quizId, version) {
        const quiz = await this.find(quizId);
        if (!quiz) return null;
        const found = (quiz.versions || []).find((v) => v.version === Number(version));
        return found ? found.package : null;
      },
    },

    results: {
      async create(row) {
        const list = await load('results');
        if (list.some((r) => r.play_id === row.play_id)) return row; // idempotent
        list.unshift(row);
        if (list.length > 5000) list.length = 5000;
        await persistResults();
        return row;
      },
      async list(quizId) {
        const list = await load('results');
        return quizId ? list.filter((r) => r.quiz_id === quizId) : list.slice();
      },
      async markSynced(playId, remoteId) {
        const list = await load('results');
        const row = list.find((r) => r.play_id === playId);
        if (row) { row.remote_id = remoteId || null; row.synced_at = nowIso(); await persistResults(); }
        return row || null;
      },
    },

    materials: {
      async create(material) {
        const list = await load('materials');
        list.push(material);
        await persistMaterials();
        return material;
      },
      async find(id) {
        const list = await load('materials');
        return list.find((m) => m.material_id === id) || null;
      },
    },

    sessions: {
      async create(session) {
        const list = await load('sessions');
        list.push(session);
        if (list.length > 2000) list.length = 2000;
        await persistSessions();
        return session;
      },
      async find(sessionId) {
        const list = await load('sessions');
        return list.find((s) => s.session_id === sessionId) || null;
      },
      async finish(sessionId) {
        const list = await load('sessions');
        const found = list.find((s) => s.session_id === sessionId);
        if (found) { found.finished_at = nowIso(); await persistSessions(); }
        return found || null;
      },
    },

    async close() { /* nothing to close: writes are atomic per mutation */ },
  };
}

/* ================================================================== */
/* 2) memory store (tests)                                             */
/* ================================================================== */

export function createMemoryStore() {
  const db = { teachers: [], quizzes: new Map(), results: [], materials: [], sessions: [] };

  return {
    kind: 'memory',
    teachers: {
      async create(t) { db.teachers.push(t); return t; },
      async findByEmail(email) { return db.teachers.find((t) => t.email === String(email).toLowerCase()) || null; },
      async findById(id) { return db.teachers.find((t) => t.teacher_id === id) || null; },
      async update(id, patch) {
        const i = db.teachers.findIndex((t) => t.teacher_id === id);
        if (i < 0) return null;
        db.teachers[i] = { ...db.teachers[i], ...patch, updated_at: nowIso() };
        return db.teachers[i];
      },
    },
    quizzes: {
      async create(q) { db.quizzes.set(q.quiz_id, q); return q; },
      async list(teacherId) {
        return [...db.quizzes.values()].filter((q) => q.teacher_id === teacherId)
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      },
      async find(id) { return db.quizzes.get(id) || null; },
      async update(id, patch) {
        const current = db.quizzes.get(id);
        if (!current) return null;
        const next = { ...current, ...patch, updated_at: nowIso() };
        db.quizzes.set(id, next);
        return next;
      },
      async remove(id) { return db.quizzes.delete(id); },
      async addVersion(quizId, version) {
        const current = db.quizzes.get(quizId);
        if (!current) return null;
        const versions = (current.versions || []).filter((v) => v.version !== version.version);
        versions.push(version);
        versions.sort((a, b) => a.version - b.version);
        const next = { ...current, versions, current_version: version.version, updated_at: nowIso(), package: version.package, ...packageFacts(version.package) };
        db.quizzes.set(quizId, next);
        return next;
      },
      async listVersions(quizId) {
        const quiz = db.quizzes.get(quizId);
        if (!quiz) return [];
        return (quiz.versions || []).map((v) => ({ version: v.version, saved_at: v.saved_at, note: v.note || null, question_count: packageFacts(v.package).question_count }))
          .sort((a, b) => b.version - a.version);
      },
      async versionPackage(quizId, version) {
        const quiz = db.quizzes.get(quizId);
        if (!quiz) return null;
        const found = (quiz.versions || []).find((v) => v.version === Number(version));
        return found ? found.package : null;
      },
    },
    results: {
      async create(row) {
        if (db.results.some((r) => r.play_id === row.play_id)) return row;
        db.results.unshift(row);
        return row;
      },
      async list(quizId) { return quizId ? db.results.filter((r) => r.quiz_id === quizId) : db.results.slice(); },
      async markSynced(playId, remoteId) {
        const row = db.results.find((r) => r.play_id === playId);
        if (row) { row.remote_id = remoteId || null; row.synced_at = nowIso(); }
        return row || null;
      },
    },
    materials: {
      async create(m) { db.materials.push(m); return m; },
      async find(id) { return db.materials.find((m) => m.material_id === id) || null; },
    },
    sessions: {
      async create(s) { db.sessions.push(s); return s; },
      async find(id) { return db.sessions.find((s) => s.session_id === id) || null; },
      async finish(id) {
        const s = db.sessions.find((x) => x.session_id === id);
        if (s) s.finished_at = nowIso();
        return s || null;
      },
    },
    async close() {},
  };
}

/* ================================================================== */
/* 3) postgres store (production path)                                 */
/* ================================================================== */

/**
 * The Postgres adapter keeps the same method names as the file store, so the API
 * layer is unchanged. `pg` is NOT a dependency of this repository: install it in
 * the deployment (`npm install pg`) and point QV_DATABASE_URL at the database.
 * The DDL lives in server/schema.sql and matches PD §16.
 */
export async function createPostgresStore({ connectionString, pool: injectedPool } = {}) {
  let pool = injectedPool;
  if (!pool) {
    let pg;
    try {
      pg = await import('pg');
    } catch {
      throw new Error(
        'Postgres storage needs the optional "pg" package. Run `npm install pg` in the deployment, '
        + 'set QV_DATABASE_URL, or use the default file storage (QV_STORAGE=file).',
      );
    }
    const Pool = pg.Pool || (pg.default && pg.default.Pool);
    pool = new Pool({ connectionString, max: 8 });
  }

  const q = (text, params) => pool.query(text, params);
  let closed = false;

  const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

  async function quizRow(id, teacherId) {
    const { rows } = teacherId
      ? await q('select * from quizzes where quiz_id = $1 and teacher_id = $2', [id, teacherId])
      : await q('select * from quizzes where quiz_id = $1', [id]);
    return rows[0] || null;
  }

  async function hydrate(row) {
    if (!row) return null;
    const { rows: versions } = await q(
      'select version, package, note, created_at from quiz_versions where quiz_id = $1 order by version asc', [row.quiz_id],
    );
    return {
      quiz_id: row.quiz_id,
      teacher_id: row.teacher_id,
      title: row.title,
      class_level: row.class_level,
      subject: row.subject,
      topic: row.topic,
      language: row.language,
      source_type: row.source_type,
      question_count: row.question_count,
      current_version: row.current_version,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      package: parseJson(row.package_json),
      versions: versions.map((v) => ({
        version: v.version,
        package: parseJson(v.package),
        note: v.note,
        saved_at: v.created_at instanceof Date ? v.created_at.toISOString() : v.created_at,
      })),
    };
  }

  return {
    kind: 'postgres',
    teachers: {
      async create(t) {
        await q(
          `insert into teachers (teacher_id, name, email, school_name, password_hash, password_salt, created_at)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [t.teacher_id, t.name, t.email, t.school_name, t.password_hash, t.password_salt, t.created_at],
        );
        return t;
      },
      async findByEmail(email) {
        const { rows } = await q('select * from teachers where email = $1', [String(email).toLowerCase()]);
        return rows[0] || null;
      },
      async findById(id) {
        const { rows } = await q('select * from teachers where teacher_id = $1', [id]);
        return rows[0] || null;
      },
      async update(id, patch) {
        await q('update teachers set name = coalesce($2, name), school_name = coalesce($3, school_name) where teacher_id = $1',
          [id, patch.name || null, patch.school_name || null]);
        return this.findById(id);
      },
    },
    quizzes: {
      async create(quiz) {
        await q(
          `insert into quizzes (quiz_id, teacher_id, title, class_level, subject, topic, language, source_type,
                                question_count, current_version, package_json, created_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
          [quiz.quiz_id, quiz.teacher_id, quiz.title, quiz.class_level, quiz.subject, quiz.topic, quiz.language,
            quiz.source_type, quiz.question_count, quiz.current_version, JSON.stringify(quiz.package), quiz.created_at],
        );
        for (const v of quiz.versions || []) {
          await q('insert into quiz_versions (quiz_id, version, package, note, created_by, created_at) values ($1,$2,$3,$4,$5,$6)',
            [quiz.quiz_id, v.version, JSON.stringify(v.package), v.note || null, quiz.teacher_id, v.saved_at]);
        }
        return quiz;
      },
      async list(teacherId) {
        const { rows } = await q('select * from quizzes where teacher_id = $1 order by updated_at desc', [teacherId]);
        return Promise.all(rows.map(hydrate));
      },
      async find(quizId) { return hydrate(await quizRow(quizId)); },
      async update(quizId, patch) {
        await q(`update quizzes set title = coalesce($2, title), package_json = coalesce($3, package_json),
                 current_version = coalesce($4, current_version), updated_at = now() where quiz_id = $1`,
          [quizId, patch.title || null, patch.package ? JSON.stringify(patch.package) : null, patch.current_version || null]);
        return this.find(quizId);
      },
      async remove(quizId) {
        await q('delete from quiz_versions where quiz_id = $1', [quizId]);
        await q('delete from game_sessions where quiz_id = $1', [quizId]);
        const res = await q('delete from quizzes where quiz_id = $1', [quizId]);
        return res.rowCount > 0;
      },
      async addVersion(quizId, version) {
        const quiz = await quizRow(quizId);
        if (!quiz) return null;
        await q(`insert into quiz_versions (quiz_id, version, package, note, created_by, created_at)
                 values ($1,$2,$3,$4,$5, now())
                 on conflict (quiz_id, version) do update set package = excluded.package, note = excluded.note`,
          [quizId, version.version, JSON.stringify(version.package), version.note || null, quiz.teacher_id]);
        const facts = packageFacts(version.package);
        await q(`update quizzes set title=$2, class_level=$3, subject=$4, topic=$5, language=$6, source_type=$7,
                 question_count=$8, current_version=$9, package_json=$10, updated_at=now() where quiz_id=$1`,
          [quizId, facts.title, facts.class_level, facts.subject, facts.topic, facts.language, facts.source_type,
            facts.question_count, version.version, JSON.stringify(version.package)]);
        return this.find(quizId);
      },
      async listVersions(quizId) {
        const { rows } = await q('select version, note, created_at, package from quiz_versions where quiz_id = $1 order by version desc', [quizId]);
        return rows.map((v) => ({
          version: v.version,
          saved_at: v.created_at instanceof Date ? v.created_at.toISOString() : v.created_at,
          note: v.note || null,
          question_count: packageFacts(parseJson(v.package)).question_count,
        }));
      },
      async versionPackage(quizId, version) {
        const { rows } = await q('select package from quiz_versions where quiz_id = $1 and version = $2', [quizId, Number(version)]);
        return rows[0] ? parseJson(rows[0].package) : null;
      },
    },
    results: {
      async create(row) {
        const { rows } = await q(
          `insert into game_sessions (session_id, quiz_id, student_name, class_level, mode, score, max_score, accuracy,
            correct_count, incorrect_count, stage_reached, stages_cleared, status, lifelines_used_json,
            started_at, completed_at, time_taken_seconds, device_json, result_json)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           on conflict (session_id) do nothing
           returning session_id`,
          [row.session_id || row.play_id, row.quiz_id, row.student_name, row.class_level || null, row.mode || 'individual',
            row.score || 0, row.max_score || 0, row.accuracy || 0, row.correct || 0, row.incorrect || 0,
            row.stage_reached || 0, row.stages_cleared || 0, row.status || 'ABORTED',
            JSON.stringify(row.lifelines_used || []), row.started_at || null, row.completed_at || nowIso(),
            row.time_taken_seconds || 0, JSON.stringify(row.device || {}), JSON.stringify(row)],
        );
        return rows[0] ? row : row;
      },
      async list(quizId) {
        const { rows } = quizId
          ? await q('select result_json from game_sessions where quiz_id = $1 order by completed_at desc', [quizId])
          : await q('select result_json from game_sessions order by completed_at desc limit 500');
        return rows.map((r) => parseJson(r.result_json));
      },
      async markSynced() { /* results are stored directly in Postgres */ },
    },
    materials: {
      async create(m) {
        await q(`insert into materials (material_id, teacher_id, file_name, file_type, extracted_text, page_count, char_count, source_hash, created_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
          [m.material_id, m.teacher_id, m.file_name, m.file_type, m.extracted_text, m.page_count || null, m.char_count || 0, m.source_hash || null]);
        return m;
      },
      async find(id) {
        const { rows } = await q('select * from materials where material_id = $1', [id]);
        return rows[0] || null;
      },
    },
    sessions: {
      async create(s) {
        await q(`insert into live_sessions (session_id, quiz_id, session_token, student_name, started_at, finished_at)
                 values ($1,$2,$3,$4, now(), null)`, [s.session_id, s.quiz_id, s.session_token, s.student_name || null]);
        return s;
      },
      async find(id) {
        const { rows } = await q('select * from live_sessions where session_id = $1', [id]);
        return rows[0] || null;
      },
      async finish(id) {
        await q('update live_sessions set finished_at = now() where session_id = $1', [id]);
        return this.find(id);
      },
    },
    async close() {
      if (!closed && pool && typeof pool.end === 'function') { closed = true; await pool.end(); }
    },
  };
}

/* ================================================================== */
/* 4) factory                                                          */
/* ================================================================== */

export async function createStore({ kind = 'file', dir = '.data', connectionString } = {}) {
  if (kind === 'postgres') return createPostgresStore({ connectionString });
  if (kind === 'memory') return createMemoryStore();
  return createFileStore(dir);
}

export default createStore;
