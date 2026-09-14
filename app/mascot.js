/**
 * QUIZVERSE — MASCOT "QUIZO" (Layer 3)
 * ---------------------------------------------------------------------------
 * 100% original character. A friendly floating learning companion.
 * Expressions: idle | welcome | thinking | celebrate | encourage | oops
 * CPU-light: transforms/opacity only, reacts within 400 ms (§10).
 */

const EXPRESSIONS = {
  idle: { eye: 'normal', mouth: 'smile', arms: 'rest', halo: 'spin' },
  welcome: { eye: 'happy', mouth: 'open', arms: 'up', halo: 'pulse' },
  thinking: { eye: 'squint', mouth: 'wave', arms: 'chin', halo: 'slow' },
  celebrate: { eye: 'star', mouth: 'big', arms: 'up', halo: 'pulse' },
  encourage: { eye: 'soft', mouth: 'smile', arms: 'wave', halo: 'slow' },
  oops: { eye: 'small', mouth: 'flat', arms: 'down', halo: 'slow' },
};

function eyes(kind) {
  switch (kind) {
    case 'happy':
      return `<path d="M38 56 q8 -10 16 0" stroke="#0B1030" stroke-width="4.5" fill="none" stroke-linecap="round"/>
              <path d="M66 56 q8 -10 16 0" stroke="#0B1030" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'squint':
      return `<path d="M38 58 h16" stroke="#0B1030" stroke-width="4.5" stroke-linecap="round"/>
              <circle cx="74" cy="56" r="6" fill="#0B1030"/><circle cx="76" cy="54" r="2" fill="#fff"/>`;
    case 'star':
      return `<path d="M46 46 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#F5B301"/>
              <path d="M74 46 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#F5B301"/>`;
    case 'soft':
      return `<circle cx="46" cy="56" r="6.5" fill="#0B1030"/><circle cx="74" cy="56" r="6.5" fill="#0B1030"/>
              <circle cx="48" cy="53.5" r="2.4" fill="#fff"/><circle cx="76" cy="53.5" r="2.4" fill="#fff"/>`;
    case 'small':
      return `<circle cx="47" cy="58" r="4.4" fill="#0B1030"/><circle cx="73" cy="58" r="4.4" fill="#0B1030"/>`;
    default:
      return `<circle cx="46" cy="56" r="7" fill="#0B1030"/><circle cx="74" cy="56" r="7" fill="#0B1030"/>
              <circle cx="48.5" cy="53" r="2.6" fill="#fff"/><circle cx="76.5" cy="53" r="2.6" fill="#fff"/>`;
  }
}

function mouth(kind) {
  switch (kind) {
    case 'big':
      return `<path d="M46 76 q14 20 28 0 q-14 8 -28 0z" fill="#0B1030"/>
              <path d="M52 82 q8 8 16 0 q-8 4 -16 0z" fill="#F472B6"/>`;
    case 'open':
      return `<ellipse cx="60" cy="80" rx="11" ry="9" fill="#0B1030"/><ellipse cx="60" cy="84" rx="7" ry="5" fill="#F472B6"/>`;
    case 'wave':
      return `<path d="M50 80 q5 -6 10 0 q5 6 10 0" stroke="#0B1030" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'flat':
      return `<path d="M52 80 h16" stroke="#0B1030" stroke-width="4.5" stroke-linecap="round"/>`;
    default:
      return `<path d="M49 76 q11 12 22 0" stroke="#0B1030" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  }
}

function arms(kind) {
  const left = { up: 'M26 66 q-16 -12 -14 -26', rest: 'M26 68 q-14 6 -16 18', chin: 'M28 62 q-6 -14 6 -20', wave: 'M26 66 q-16 -8 -18 -22', down: 'M26 72 q-12 10 -12 22' }[kind];
  const right = { up: 'M94 66 q16 -12 14 -26', rest: 'M94 68 q14 6 16 18', chin: 'M92 62 q6 -14 -6 -20', wave: 'M94 66 q16 -8 18 -22', down: 'M94 72 q12 10 12 22' }[kind];
  return `<path d="${left}" stroke="#0B1030" stroke-width="7" fill="none" stroke-linecap="round"/>
          <path d="${right}" stroke="#0B1030" stroke-width="7" fill="none" stroke-linecap="round"/>`;
}

export function quizoSVG(expression = 'idle', size = 160) {
  const e = EXPRESSIONS[expression] ? expression : 'idle';
  const spec = EXPRESSIONS[e];
  return `<svg class="qv-mascot-svg" data-expression="${e}" width="${size}" height="${size}" viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QUIZO mascot">
  <defs>
    <linearGradient id="qzBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#4C1D95"/>
    </linearGradient>
    <linearGradient id="qzVisor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E8ECFF"/><stop offset="100%" stop-color="#C7D2FE"/>
    </linearGradient>
    <filter id="qzGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- orbit halo -->
  <g class="qz-halo qz-halo--${spec.halo}" filter="url(#qzGlow)">
    <ellipse cx="60" cy="70" rx="52" ry="16" fill="none" stroke="#F5B301" stroke-width="3" opacity=".55" transform="rotate(-18 60 70)"/>
    <circle cx="108" cy="56" r="4.5" fill="#22D3EE"/>
  </g>

  <!-- antenna -->
  <line x1="60" y1="26" x2="60" y2="12" stroke="#F5B301" stroke-width="4" stroke-linecap="round"/>
  <text class="qz-spark" x="60" y="10" text-anchor="middle" font-size="14" font-weight="800" fill="#F5B301">?</text>

  ${arms(spec.arms)}

  <!-- body -->
  <rect x="20" y="26" width="80" height="78" rx="30" fill="url(#qzBody)" stroke="#F5B301" stroke-width="3"/>
  <ellipse cx="44" cy="42" rx="12" ry="8" fill="rgba(255,255,255,.22)"/>

  <!-- visor -->
  <rect x="30" y="44" width="60" height="34" rx="17" fill="url(#qzVisor)"/>
  ${eyes(spec.eye)}
  ${mouth(spec.mouth)}

  <!-- legs / base -->
  <path d="M46 104 q0 12 8 12" stroke="#0B1030" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M74 104 q0 12 -8 12" stroke="#0B1030" stroke-width="7" fill="none" stroke-linecap="round"/>
  </svg>`;
}

/** One short line, max ~12 words, never negative about the child (§10, §12.4). */
export const QUIZO_LINES = {
  en: {
    welcome: (n) => `Ready, ${n}? Let's begin!`,
    correct: (n) => `Great job, ${n}!`,
    wrong: () => "Good try! Now you know it.",
    stageClear: (s) => `Stage ${s} cleared! Keep going.`,
    winner: (n) => `You did it, ${n}! Champion!`,
    effort: () => "Great effort! Let's try once more.",
    lifeline: () => 'Use me wisely — one of each!',
    thinking: () => 'Think carefully…',
  },
  hi: {
    welcome: (n) => `तैयार हो, ${n}? चलो शुरू करें!`,
    correct: (n) => `शाबाश, ${n}!`,
    wrong: () => 'अच्छी कोशिश! अब यह याद रहेगा।',
    stageClear: (s) => `स्टेज ${s} पूरा! आगे बढ़ो।`,
    winner: (n) => `आपने कर दिखाया, ${n}! चैंपियन!`,
    effort: () => 'बहुत बढ़िया कोशिश! फिर से कोशिश करें।',
    lifeline: () => 'समझदारी से उपयोग करो — हर एक बार!',
    thinking: () => 'ध्यान से सोचो…',
  },
};

/**
 * Pick a mascot line. `arg` is the value that line needs (stage number for
 * stageClear, the student's name otherwise).
 */
export function mascotLine(key, arg, lang = 'en', student = '') {
  const dict = QUIZO_LINES[lang] || QUIZO_LINES.en;
  const fn = dict[key] || QUIZO_LINES.en[key];
  if (!fn) return '';
  return fn(arg !== undefined && arg !== null ? arg : student);
}

export default quizoSVG;
