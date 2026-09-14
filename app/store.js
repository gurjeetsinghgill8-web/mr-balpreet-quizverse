/**
 * QUIZVERSE — LOCAL STORE
 * ---------------------------------------------------------------------------
 * Persistence for the single-device demo build (Implementation Path A).
 * Quizzes, results and device settings live in localStorage; swapping this
 * module for the REST layer (§17) is the only change needed for Path B.
 */

const KEY = 'quizverse.v1';

const DEFAULT_SETTINGS = {
  uiLang: 'en',
  sound: true,
  music: true,
  effects: true,
  volume: 1.0,
  mascot: true,
  reducedMotion: false,
  /* Layer 1 engine selection (§8.8). The key is device-local only. */
  aiProvider: 'offline',
  aiModel: '',
  aiBaseUrl: '',
  aiApiKey: '',
  aiFallback: true,
  aiTimeoutMs: 60000,
  aiTemperature: 0.6,
  /* Cloud account (§17): empty until the teacher signs in. */
  cloudToken: '',
  cloudTeacher: null,
  cloudUrl: '',
};

let db = { settings: { ...DEFAULT_SETTINGS }, quizzes: [], results: [], draft: null };

const DRAFT_LIMIT = 40000; // characters of pasted material we are willing to persist

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* private mode / quota — the demo keeps working in memory */
  }
}

/** Keep an immutable snapshot per package version (§56). */
function mergeVersion(versions, pkg) {
  const list = Array.isArray(versions) ? versions.slice() : [];
  const version = pkg.version || 1;
  const snapshot = { version, saved_at: new Date().toISOString(), package: pkg };
  const index = list.findIndex((v) => v.version === version);
  if (index >= 0) list[index] = { ...list[index], ...snapshot };
  else list.push(snapshot);
  return list.sort((a, b) => a.version - b.version);
}

export const Store = {
  init() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        db = {
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
          results: Array.isArray(parsed.results) ? parsed.results : [],
          draft: parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : null,
        };
      }
    } catch {
      /* corrupted storage falls back to defaults */
    }
    return db;
  },

  settings() { return { ...db.settings }; },

  /**
   * The create-form draft (including pasted or extracted lesson material) is
   * persisted so a page refresh never destroys a teacher's work.
   */
  draft() { return db.draft ? { ...db.draft } : null; },

  saveDraft(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const copy = { ...draft };
    if (typeof copy.materialText === 'string' && copy.materialText.length > DRAFT_LIMIT) {
      copy.materialText = copy.materialText.slice(0, DRAFT_LIMIT);
      copy.materialTruncated = true;
    }
    db.draft = copy;
    persist();
    return { ...copy };
  },

  clearDraft() {
    db.draft = null;
    persist();
  },

  saveSettings(patch = {}) {
    db.settings = { ...db.settings, ...patch };
    persist();
    return { ...db.settings };
  },

  /* ---------------- quizzes ---------------- */
  addQuiz(pkg) {
    const existing = db.quizzes.findIndex((q) => q.quiz_id === pkg.quiz_id);
    const entry = {
      quiz_id: pkg.quiz_id,
      title: pkg.title,
      class_level: pkg.class_level,
      subject: pkg.subject,
      topic: pkg.topic,
      language: pkg.language,
      question_count: pkg.stages.reduce((n, s) => n + s.question_ids.length, 0),
      source_type: pkg.source_type,
      version: pkg.version || 1,
      saved_at: new Date().toISOString(),
      last_played: null,
      plays: 0,
      package: pkg,
      versions: [{ version: pkg.version || 1, saved_at: new Date().toISOString(), note: 'Saved by the teacher.', package: pkg }],
    };
    if (existing >= 0) {
      const previous = db.quizzes[existing];
      entry.plays = previous.plays || 0;
      entry.last_played = previous.last_played || null;
      entry.saved_at = previous.saved_at || entry.saved_at;
      entry.versions = mergeVersion(previous.versions, pkg);
      db.quizzes[existing] = entry;
    } else {
      db.quizzes.unshift(entry);
    }
    persist();
    return entry;
  },

  /** Persist an edited package (used by the preview editor). */
  savePackageVersion(pkg, note) {
    const entry = db.quizzes.find((q) => q.quiz_id === pkg.quiz_id);
    if (!entry) return null;
    entry.package = pkg;
    entry.version = pkg.version || 1;
    entry.question_count = pkg.stages.reduce((n, s) => n + s.question_ids.length, 0);
    const merged = mergeVersion(entry.versions, pkg);
    if (note) merged[merged.length - 1].note = note;
    entry.versions = merged;
    persist();
    return entry;
  },

  versionList(quizId) {
    const entry = db.quizzes.find((q) => q.quiz_id === quizId);
    if (!entry) return [];
    return (entry.versions || [])
      .slice()
      .sort((a, b) => b.version - a.version)
      .map((v) => ({ version: v.version, saved_at: v.saved_at, note: v.note || null,
        questions: v.package.stages.reduce((n, s) => n + s.question_ids.length, 0) }));
  },

  versionPackage(quizId, version) {
    const entry = db.quizzes.find((q) => q.quiz_id === quizId);
    if (!entry) return null;
    const found = (entry.versions || []).find((v) => v.version === Number(version));
    return found ? found.package : null;
  },

  quizzes() { return db.quizzes.map(({ package: _p, ...meta }) => meta); },

  getQuiz(quizId) {
    const found = db.quizzes.find((q) => q.quiz_id === quizId);
    return found ? found.package : null;
  },

  removeQuiz(quizId) {
    db.quizzes = db.quizzes.filter((q) => q.quiz_id !== quizId);
    db.results = db.results.filter((r) => r.quiz_id !== quizId);
    persist();
  },

  touchQuiz(quizId) {
    const entry = db.quizzes.find((q) => q.quiz_id === quizId);
    if (!entry) return;
    entry.plays = (entry.plays || 0) + 1;
    entry.last_played = new Date().toISOString();
    persist();
  },

  /* ---------------- results ---------------- */
  addResult(result, quizMeta = {}) {
    const row = {
      ...result,
      play_id: `p_${Date.now().toString(36)}`,
      topic: result.topic || quizMeta.topic || '',
      subject: quizMeta.subject || '',
      completed_at: new Date().toISOString(),
      synced: false, // uploaded to the teacher's account only after sync()
    };
    db.results.unshift(row);
    if (db.results.length > 500) db.results.length = 500;
    persist();
    return row;
  },

  /** Rows that have not reached the cloud yet (the sync queue). */
  unsyncedResults() {
    return db.results.filter((r) => !r.synced).slice(0, 200);
  },

  markResultSynced(playId) {
    const row = db.results.find((r) => r.play_id === playId);
    if (row) { row.synced = true; persist(); }
    return row || null;
  },

  /** Remember that this quiz now also exists on the teacher's account. */
  markQuizSynced(quizId, remoteUpdatedAt) {
    const entry = db.quizzes.find((q) => q.quiz_id === quizId);
    if (entry) { entry.synced_at = remoteUpdatedAt || new Date().toISOString(); persist(); }
    return entry || null;
  },

  results(quizId) {
    return quizId ? db.results.filter((r) => r.quiz_id === quizId) : db.results.slice();
  },

  clearResults(quizId) {
    db.results = quizId ? db.results.filter((r) => r.quiz_id !== quizId) : [];
    persist();
  },

  /**
   * Wipe local quizzes, results and the form draft (settings and the signed-in
   * account stay). Also the privacy control: clear a shared device between students.
   */
  clearAll() {
    db.quizzes = [];
    db.results = [];
    db.draft = null;
    persist();
  },

  /* ---------------- analytics (§20) ---------------- */
  analytics(quizId) {
    const rows = Store.results(quizId);
    if (!rows.length) return null;

    const sums = rows.reduce((acc, r) => {
      acc.score += r.score || 0;
      acc.accuracy += r.accuracy || 0;
      acc.time += r.time_taken_seconds || 0;
      acc.correct += r.correct || 0;
      acc.incorrect += r.incorrect || 0;
      if (r.status === 'WINNER') acc.wins += 1;
      return acc;
    }, { score: 0, accuracy: 0, time: 0, correct: 0, incorrect: 0, wins: 0 });

    const missed = new Map();
    const concepts = new Map();
    rows.forEach((r) => {
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

    const mostMissed = [...missed.values()]
      .filter((m) => m.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.total - a.total)[0] || null;

    const weak = [...concepts.values()]
      .map((c) => ({ ...c, accuracy: Math.round((c.correct / c.total) * 100) }))
      .filter((c) => c.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 4);

    const strongest = [...concepts.values()]
      .map((c) => ({ ...c, accuracy: Math.round((c.correct / c.total) * 100) }))
      .filter((c) => c.accuracy >= 60)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3);

    return {
      plays: rows.length,
      wins: sums.wins,
      avgScore: Math.round(sums.score / rows.length),
      avgAccuracy: Math.round((sums.accuracy / rows.length) * 10) / 10,
      avgTime: Math.round(sums.time / rows.length),
      correct: sums.correct,
      incorrect: sums.incorrect,
      mostMissed,
      weakConcepts: weak,
      strongConcepts: strongest,
      rows,
    };
  },

  questionText(questionId) {
    for (const entry of db.quizzes) {
      const q = entry.package.questions.find((x) => x.question_id === questionId);
      if (q) return q.question;
    }
    return null;
  },
};

export default Store;
