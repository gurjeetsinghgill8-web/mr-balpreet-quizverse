/**
 * QUIZVERSE — CERTIFICATE (PRODUCT_DEVELOPMENT.md §62)
 * ---------------------------------------------------------------------------
 * Turns a finished GameResult into a printable, original certificate. Everything
 * is inline SVG authored for this product (no external fonts/assets), so it
 * prints cleanly and satisfies the IP guardrail (§2).
 *
 * Pure and deterministic — usable in the browser and in Node tests.
 */

const PALETTE = { indigo: '#0B1030', purple: '#4C1D95', violet: '#7C3AED', gold: '#F5B301', goldLight: '#FCD34D', cyan: '#22D3EE', white: '#FFFFFF', mist: '#E8ECFF', muted: '#A5ACD6' };

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
};

function formatTime(seconds) {
  const s = num(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(date, locale = 'en') {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const months = MONTHS[locale] || MONTHS.en;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Deterministic 8-char verification code derived from the result content. */
function verificationCode(result) {
  let hash = 2166136261;
  const source = `${result.student_name}|${result.topic}|${num(result.score)}|${result.status}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ('00000000' + (hash >>> 0).toString(36).toUpperCase()).slice(-8);
}

const truncate = (value, max = 34) => {
  const s = String(value ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Pure data model. Never throws. */
export function certificateModel(result = {}, options = {}) {
  const r = result || {};
  const locale = options.locale === 'hi' ? 'hi' : 'en';
  const isWinner = r.status === 'WINNER';
  const student = String(r.student_name || 'Champion').slice(0, 40);
  const topic = String(r.topic || r.quiz_title || '').slice(0, 80);
  const date = formatDate(options.date || new Date(), locale);

  const strong = [];
  const weak = [];
  (r.per_question || []).forEach((q) => {
    if (!q.concept_tag) return;
    if (q.is_correct && !strong.includes(q.concept_tag)) strong.push(q.concept_tag);
    if (!q.is_correct && !weak.includes(q.concept_tag)) weak.push(q.concept_tag);
  });

  return Object.freeze({
    student_name: student,
    topic,
    subject: String(r.subject || '').slice(0, 80),
    class_level: num(r.class_level) || null,
    score: num(r.score),
    max_score: num(r.max_score),
    accuracy: r.accuracy === undefined || r.accuracy === null ? 0 : Math.max(0, Math.min(100, Number(r.accuracy))),
    correct: num(r.correct),
    questions_answered: num(r.questions_answered),
    stage_reached: num(r.stage_reached),
    stages_cleared: num(r.stages_cleared),
    time_text: formatTime(r.time_taken_seconds),
    lifelines_used: Array.isArray(r.lifelines_used) ? r.lifelines_used.length : 0,
    per_stage: Array.isArray(r.per_stage) ? r.per_stage.slice(0, 8) : [],
    date_text: date,
    is_winner: isWinner,
    school_name: String(options.school_name || '').slice(0, 120),
    teacher_name: String(options.teacher_name || '').slice(0, 80),
    verification_code: verificationCode(r),
    title: locale === 'hi'
      ? (isWinner ? 'उपलब्धि प्रमाणपत्र' : 'सहभागिता प्रमाणपत्र')
      : (isWinner ? 'CERTIFICATE OF ACHIEVEMENT' : 'CERTIFICATE OF PARTICIPATION'),
    subtitle: locale === 'hi'
      ? (isWinner ? 'आपने चुनौती सफलतापूर्वक पूरी की!' : 'शानदार कोशिश — अगली बार और मज़ा!')
      : (isWinner ? 'You completed the challenge successfully!' : 'Great effort — keep going!'),
    strong,
    weak,
    locale,
  });
}

const LABELS = {
  en: { topic: 'TOPIC', class: 'CLASS', score: 'SCORE', accuracy: 'ACCURACY', time: 'TIME', date: 'DATE', signature: 'Teacher', code: 'Verify' },
  hi: { topic: 'विषय', class: 'कक्षा', score: 'स्कोर', accuracy: 'शुद्धता', time: 'समय', date: 'तिथि', signature: 'शिक्षक', code: 'जाँच कोड' },
};

/** Landscape A4 SVG certificate. */
export function certificateSVG(model = {}) {
  const L = LABELS[model.locale === 'hi' ? 'hi' : 'en'];
  const name = truncate(model.student_name, 34);

  const stat = (x, y, label, value) => `
    <rect x="${x}" y="${y}" width="150" height="64" rx="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>
    <text x="${x + 75}" y="${y + 30}" text-anchor="middle" font-size="21" font-weight="800" fill="${PALETTE.goldLight}">${esc(value)}</text>
    <text x="${x + 75}" y="${y + 50}" text-anchor="middle" font-size="11" letter-spacing="2" fill="${PALETTE.muted}">${esc(label)}</text>`;

  return `<svg class="qv-cert" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1123 794"
       data-student="${esc(model.student_name)}" data-topic="${esc(model.topic)}" data-score="${model.score}"
       data-status="${model.is_winner ? 'winner' : 'participation'}" role="img" aria-label="${esc(model.title)}">
  <defs>
    <linearGradient id="certBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141B55"/><stop offset="0.5" stop-color="${PALETTE.indigo}"/><stop offset="1" stop-color="#05061A"/>
    </linearGradient>
    <linearGradient id="certGold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#B8860B"/><stop offset="0.5" stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="#B8860B"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1123" height="794" rx="22" fill="url(#certBg)"/>
  <rect x="22" y="22" width="1079" height="750" rx="16" fill="none" stroke="url(#certGold)" stroke-width="3"/>
  <rect x="32" y="32" width="1059" height="730" rx="12" fill="none" stroke="${PALETTE.violet}" stroke-width="1" opacity="0.7"/>

  <!-- corner accents -->
  <circle cx="60" cy="60" r="9" fill="${PALETTE.gold}"/><circle cx="1063" cy="60" r="9" fill="${PALETTE.gold}"/>
  <circle cx="60" cy="734" r="9" fill="${PALETTE.gold}"/><circle cx="1063" cy="734" r="9" fill="${PALETTE.gold}"/>

  <!-- wordmark -->
  <text x="561" y="88" text-anchor="middle" font-family="Verdana, sans-serif" font-size="26" font-weight="800" letter-spacing="6" fill="${PALETTE.mist}">QUIZVERSE</text>
  <text x="561" y="112" text-anchor="middle" font-family="Verdana, sans-serif" font-size="11" letter-spacing="4" fill="${PALETTE.cyan}">LEARN · THINK · WIN</text>

  <!-- trophy -->
  <g transform="translate(561 168)" stroke="${PALETTE.gold}" stroke-width="4" fill="none">
    <path d="M-26 34 h52 l-8 26 h-36z" fill="${PALETTE.gold}"/>
    <path d="M-40 20 h-10 a14 14 0 0 1 14 -14 h6 M40 20 h10 a14 14 0 0 0 -14 -14 h-6" fill="${PALETTE.gold}" stroke="${PALETTE.goldLight}"/>
    <rect x="-12" y="60" width="24" height="12" rx="3" fill="${PALETTE.gold}"/>
    <rect x="-22" y="72" width="44" height="8" rx="4" fill="${PALETTE.goldLight}"/>
  </g>

  <text x="561" y="300" text-anchor="middle" font-size="20" letter-spacing="5" fill="${PALETTE.gold}">${esc(model.title)}</text>
  <text x="561" y="358" text-anchor="middle" font-family="Verdana, sans-serif" font-size="46" font-weight="800" fill="${PALETTE.white}">${esc(name)}</text>
  <line x1="361" y1="376" x2="761" y2="376" stroke="${PALETTE.cyan}" stroke-width="2" opacity="0.8"/>

  <text x="561" y="414" text-anchor="middle" font-size="19" fill="${PALETTE.mist}">${esc(model.topic)}${model.class_level ? `  ·  ${esc(L.class)} ${model.class_level}` : ''}</text>
  <text x="561" y="442" text-anchor="middle" font-size="15" fill="${PALETTE.muted}">${esc(model.subtitle)}</text>

  ${stat(152, 490, L.score, model.score)}
  ${stat(322, 490, L.accuracy, `${model.accuracy}%`)}
  ${stat(492, 490, L.time, model.time_text)}
  ${stat(662, 490, L.class, model.stage_reached || '—')}

  <!-- signature -->
  <text x="300" y="648" text-anchor="middle" font-size="13" fill="${PALETTE.muted}">${esc(model.date_text)}</text>
  <line x1="200" y1="672" x2="400" y2="672" stroke="${PALETTE.muted}" stroke-width="1.5"/>
  <text x="300" y="692" text-anchor="middle" font-size="13" fill="${PALETTE.mist}">${esc(model.teacher_name || L.signature)}</text>
  ${model.school_name ? `<text x="561" y="720" text-anchor="middle" font-size="14" fill="${PALETTE.muted}">${esc(model.school_name)}</text>` : ''}

  <text x="823" y="648" text-anchor="middle" font-size="11" letter-spacing="2" fill="${PALETTE.muted}">${esc(L.code)}</text>
  <text x="823" y="672" text-anchor="middle" font-family="monospace" font-size="17" letter-spacing="3" fill="${PALETTE.gold}">${esc(model.verification_code)}</text>
</svg>`;
}

/** Printable view with the certificate, stats and print CSS. */
export function certificateHTML(model = {}) {
  const L = LABELS[model.locale === 'hi' ? 'hi' : 'en'];
  const stages = (model.per_stage || []).map((s, i) => `
    <tr><td>${i + 1}</td><td>${num(s.correct)} / ${num(s.total)}</td><td>${s.passed ? '✓' : '—'}</td></tr>`).join('');
  const chips = (list, cls) => list.length
    ? `<span class="qvc-chip ${cls}">${list.map(esc).join('</span><span class="qvc-chip ' + cls + '">')}</span>`
    : '';

  return `
<div class="qvc-wrap" data-student="${esc(model.student_name)}">
  <style>
    .qvc-wrap { font-family: Verdana, sans-serif; color: #E8ECFF; max-width: 1123px; margin: 0 auto; }
    .qvc-cert { width: 100%; height: auto; display: block; border-radius: 16px; box-shadow: 0 24px 60px rgba(4,6,26,.6); }
    .qvc-meta { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; justify-content: center; }
    .qvc-chip { padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); font-size: 13px; }
    .qvc-chip.good { color: #86EFAC; border-color: rgba(34,197,94,.5); }
    .qvc-chip.learn { color: #FCA5A5; border-color: rgba(248,113,113,.45); }
    .qvc-table { border-collapse: collapse; margin: 8px auto 0; font-size: 14px; }
    .qvc-table th, .qvc-table td { padding: 8px 18px; border-bottom: 1px solid rgba(255,255,255,.15); text-align: center; }
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      body * { visibility: hidden !important; }
      .qvc-wrap, .qvc-wrap * { visibility: visible !important; }
      .qvc-wrap { position: absolute; inset: 0; max-width: none; margin: 0; }
      .qvc-meta, .qvc-table, .qvc-actions { display: none !important; }
      .qvc-cert { box-shadow: none; border-radius: 0; }
    }
  </style>
  ${certificateSVG(model)}
  ${model.strong.length || model.weak.length ? `
  <div class="qvc-meta">
    ${model.strong.length ? `<span class="qvc-chip good">✓ ${model.strong.slice(0, 4).map(esc).join(', ')}</span>` : ''}
    ${model.weak.length ? `<span class="qvc-chip learn">↻ ${model.weak.slice(0, 4).map(esc).join(', ')}</span>` : ''}
  </div>` : ''}
  ${stages ? `
  <table class="qvc-table">
    <tr><th>Stage</th><th>Correct</th><th>Cleared</th></tr>${stages}
  </table>` : ''}
  <p style="text-align:center;font-size:12px;color:#A5ACD6;margin-top:14px">Generated by QUIZVERSE · Learn. Think. Win.</p>
</div>`;
}

export function certificateFileName(model = {}) {
  const name = String(model.student_name || 'champion').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'champion';
  const topic = String(model.topic || 'quiz').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'quiz';
  const date = (model.date_text || '').replace(/\s+/g, '-').toLowerCase() || new Date().toISOString().slice(0, 10);
  return `quizverse-certificate-${name}-${topic}-${date}`.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export default { certificateModel, certificateSVG, certificateHTML, certificateFileName };
