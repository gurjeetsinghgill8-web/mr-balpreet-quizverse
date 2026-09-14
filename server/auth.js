/**
 * QUIZVERSE — SERVER AUTH
 * ---------------------------------------------------------------------------
 * Teacher-only accounts with zero dependencies:
 *   • passwords hashed with scrypt + a per-user random salt, compared in
 *     constant time
 *   • stateless bearer tokens (HMAC-SHA256) so a restart does not need a session
 *     table; set QV_API_SECRET in production to keep tokens valid across restarts
 *   • students never sign in (PD §12.3): they receive a short-lived session token
 *     when a game starts, which is the only thing a result submission needs.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(String(password), salt, 64);
  return { password_hash: Buffer.from(derived).toString('hex'), password_salt: salt };
}

export async function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const derived = await scrypt(String(password), salt, 64);
  const a = Buffer.from(derived.toString('hex'), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(teacherId, secret, ttlMs = TOKEN_TTL_MS) {
  const body = b64url(JSON.stringify({ sub: teacherId, exp: Date.now() + ttlMs, jti: randomUUID() }));
  return `${body}.${sign(body, secret)}`;
}

/** @returns {{ ok:true, teacher_id:string } | { ok:false, code:string }} */
export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return { ok: false, code: 'no_token' };
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, code: 'malformed_token' };
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: 'bad_signature' };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'malformed_token' };
  }
  if (!claims || !claims.sub) return { ok: false, code: 'malformed_token' };
  if (Number(claims.exp) < Date.now()) return { ok: false, code: 'expired_token' };
  return { ok: true, teacher_id: claims.sub };
}

/** Students get a short opaque token; it authorises exactly one result submission. */
export function issueSessionToken() {
  return randomBytes(18).toString('base64url');
}

/* ------------------------------------------------------------------ */
/* validation helpers (shared by the API)                              */
/* ------------------------------------------------------------------ */

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateRegistration({ name, email, password }) {
  const problems = [];
  if (!String(name || '').trim() || String(name).trim().length < 2) problems.push({ field: 'name', message: 'Please enter your name.' });
  const mail = normaliseEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) problems.push({ field: 'email', message: 'Please enter a valid email address.' });
  if (String(password || '').length < 8) problems.push({ field: 'password', message: 'Use at least 8 characters for the password.' });
  return { ok: problems.length === 0, problems, email: mail };
}

/**
 * Small in-memory limiter for auth endpoints. It counts FAILED attempts only, so
 * a school setting up twenty teacher accounts in one sitting is never blocked
 * while password guessing still is.
 */
export function createRateLimiter({ windowMs = 60_000, max = 12 } = {}) {
  const hits = new Map();
  const bump = (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  };
  return {
    /** Call before doing the work: rejects only once failures exceed the limit. */
    check(key) {
      const entry = hits.get(key);
      if (!entry) return { ok: true, remaining: max };
      if (Date.now() - entry.start > windowMs) { hits.delete(key); return { ok: true, remaining: max }; }
      if (entry.count >= max) return { ok: false, retry_after_ms: windowMs - (Date.now() - entry.start) };
      return { ok: true, remaining: max - entry.count };
    },
    /** Call when the attempt failed. */
    fail(key) { return bump(key); },
    /** Call when the attempt succeeded. */
    succeed(key) { hits.delete(key); },
    reset() { hits.clear(); },
  };
}

/** Sanity-check a quiz package before it is stored (never trust the client). */
export function validatePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { ok: false, message: 'A quiz package is required.' };
  if (!Array.isArray(pkg.questions) || pkg.questions.length === 0) return { ok: false, message: 'The quiz has no questions.' };
  if (!Array.isArray(pkg.stages) || pkg.stages.length === 0) return { ok: false, message: 'The quiz has no stages.' };
  if (pkg.stages.some((s) => !Array.isArray(s.question_ids) || s.question_ids.length === 0)) {
    return { ok: false, message: 'Every stage needs at least one question.' };
  }
  const classLevel = Number(pkg.class_level);
  if (!(classLevel >= 1 && classLevel <= 8)) return { ok: false, message: 'Class level must be between 1 and 8.' };
  if (JSON.stringify(pkg).length > 900_000) return { ok: false, message: 'This quiz package is too large to store.' };
  return { ok: true };
}

export default { hashPassword, verifyPassword, issueToken, verifyToken, validateRegistration, createRateLimiter };
