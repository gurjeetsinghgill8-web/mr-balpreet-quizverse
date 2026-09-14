/**
 * QUIZVERSE — ILLUSTRATION LIBRARY (Layer 3)
 * ---------------------------------------------------------------------------
 * 100% original inline SVG art. No stock photos, no third-party assets.
 * Every question may reference an illustration key; missing keys degrade silently.
 */

let uid = 0;
const nextId = () => `qv${++uid}`;

const PALETTE = {
  indigo: '#171B4A',
  purple: '#4C1D95',
  violet: '#7C3AED',
  gold: '#F5B301',
  cyan: '#22D3EE',
  green: '#22C55E',
  coral: '#F87171',
  white: '#FFFFFF',
  mist: '#E8ECFF',
  grey: '#9CA3AF',
  teal: '#0EA5A0',
  pink: '#F472B6',
  orange: '#FB923C',
  brown: '#8B5A2B',
};

function plate(inner, label) {
  const id = nextId();
  return `<svg class="qv-illus" viewBox="0 0 120 120" role="img" aria-label="${label || 'illustration'}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E2260"/><stop offset="100%" stop-color="#0B1030"/>
    </linearGradient>
    <linearGradient id="${id}gl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,.35)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="120" height="120" rx="22" fill="url(#${id}bg)"/>
  <circle cx="96" cy="24" r="26" fill="rgba(124,58,237,.28)"/>
  <circle cx="20" cy="102" r="22" fill="rgba(34,211,238,.18)"/>
  ${inner}
  </svg>`;
}

const label = (text, fill = PALETTE.mist, y = 110, size = 13) =>
  `<text x="60" y="${y}" text-anchor="middle" font-family="Manrope, system-ui, sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${text}</text>`;

/* ---------------- technology icons ---------------- */

const TECH = {
  monitor: () => `
    <rect x="20" y="26" width="80" height="52" rx="8" fill="${PALETTE.indigo}" stroke="${PALETTE.cyan}" stroke-width="3"/>
    <rect x="27" y="33" width="66" height="38" rx="4" fill="rgba(34,211,238,.15)"/>
    <path d="M40 52 L52 40 L62 50 L72 36" fill="none" stroke="${PALETTE.cyan}" stroke-width="3" stroke-linecap="round"/>
    <rect x="52" y="78" width="16" height="10" fill="${PALETTE.cyan}"/>
    <rect x="38" y="88" width="44" height="7" rx="3.5" fill="${PALETTE.cyan}"/>`,
  keyboard: () => `
    <rect x="12" y="38" width="96" height="46" rx="9" fill="${PALETTE.indigo}" stroke="${PALETTE.violet}" stroke-width="3"/>
    ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) =>
      `<rect x="${19 + c * 14}" y="${45 + r * 9}" width="10" height="6" rx="2" fill="${PALETTE.violet}" opacity="${0.9 - r * 0.12}"/>`).join('')).join('')}
    <rect x="26" y="72" width="68" height="6" rx="3" fill="${PALETTE.gold}"/>`,
  cpu: () => `
    <rect x="34" y="34" width="52" height="52" rx="8" fill="${PALETTE.violet}" stroke="${PALETTE.cyan}" stroke-width="3"/>
    <rect x="46" y="46" width="28" height="28" rx="4" fill="rgba(34,211,238,.35)"/>
    ${[0, 1, 2].map((i) => `<rect x="${40 + i * 14}" y="20" width="6" height="14" rx="2" fill="${PALETTE.gold}"/>
      <rect x="${40 + i * 14}" y="86" width="6" height="14" rx="2" fill="${PALETTE.gold}"/>
      <rect x="20" y="${40 + i * 14}" width="14" height="6" rx="2" fill="${PALETTE.gold}"/>
      <rect x="86" y="${40 + i * 14}" width="14" height="6" rx="2" fill="${PALETTE.gold}"/>`).join('')}
    ${label('CPU')}`,
  mouse: () => `
    <rect x="42" y="24" width="36" height="58" rx="18" fill="${PALETTE.indigo}" stroke="${PALETTE.cyan}" stroke-width="3"/>
    <rect x="57" y="32" width="6" height="14" rx="3" fill="${PALETTE.cyan}"/>
    <path d="M60 30 V44" stroke="${PALETTE.indigo}" stroke-width="3"/>
    <path d="M60 84 C60 96 46 96 46 88" fill="none" stroke="${PALETTE.cyan}" stroke-width="3" stroke-linecap="round"/>`,
  paint: () => `
    <path d="M28 28 h52 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-52 a10 10 0 0 1 -10 -10 v-34 a10 10 0 0 1 10 -10z" fill="${PALETTE.indigo}" stroke="${PALETTE.gold}" stroke-width="3"/>
    <circle cx="40" cy="46" r="8" fill="${PALETTE.coral}"/><circle cx="62" cy="42" r="8" fill="${PALETTE.cyan}"/>
    <circle cx="76" cy="58" r="8" fill="${PALETTE.green}"/><circle cx="48" cy="66" r="8" fill="${PALETTE.gold}"/>
    <path d="M74 86 L98 62" stroke="${PALETTE.brown}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="72" cy="88" r="7" fill="${PALETTE.violet}"/>`,
  ram: () => `
    <rect x="16" y="44" width="88" height="34" rx="6" fill="${PALETTE.green}" stroke="#166534" stroke-width="3"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${24 + i * 13}" y="52" width="9" height="18" rx="2" fill="#0B3B1E"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${25 + i * 13}" y="78" width="7" height="10" rx="1.5" fill="${PALETTE.gold}"/>`).join('')}
    ${label('RAM')}`,
  harddisk: () => `
    <rect x="18" y="30" width="84" height="60" rx="10" fill="${PALETTE.indigo}" stroke="${PALETTE.mist}" stroke-width="3"/>
    <circle cx="60" cy="60" r="22" fill="rgba(232,236,255,.12)" stroke="${PALETTE.mist}" stroke-width="2"/>
    <circle cx="60" cy="60" r="6" fill="${PALETTE.gold}"/>
    <path d="M60 60 L92 40" stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round"/>
    <rect x="26" y="80" width="30" height="5" rx="2.5" fill="${PALETTE.cyan}"/>`,
  folder: () => `
    <path d="M18 40 h30 l8 10 h46 a8 8 0 0 1 8 8 v30 a8 8 0 0 1 -8 8 H18 a8 8 0 0 1 -8 -8 V48 a8 8 0 0 1 8 -8z" fill="${PALETTE.gold}" stroke="#B45309" stroke-width="3"/>
    <path d="M14 56 h92 v32 a8 8 0 0 1 -8 8 H22 a8 8 0 0 1 -8 -8z" fill="#FCD34D"/>`,
  supercomputer: () => `
    ${[0, 1, 2].map((i) => `<rect x="${22 + i * 26}" y="30" width="20" height="58" rx="5" fill="${PALETTE.indigo}" stroke="${PALETTE.cyan}" stroke-width="2.5"/>
      ${[0, 1, 2, 3].map((j) => `<circle cx="${32 + i * 26}" cy="${40 + j * 13}" r="3.4" fill="${j % 2 === 0 ? PALETTE.green : PALETTE.gold}"/>`).join('')}`).join('')}
    <rect x="14" y="90" width="92" height="8" rx="4" fill="${PALETTE.violet}"/>
    ${label('सुपर कंप्यूटर', PALETTE.mist, 24, 11)}`,
  virus: () => `
    <circle cx="60" cy="62" r="24" fill="${PALETTE.coral}"/>
    ${Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const x1 = 60 + Math.cos(a) * 24; const y1 = 62 + Math.sin(a) * 24;
      const x2 = 60 + Math.cos(a) * 38; const y2 = 62 + Math.sin(a) * 38;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${PALETTE.coral}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4" fill="#B91C1C"/>`;
    }).join('')}
    <circle cx="52" cy="56" r="4" fill="#7F1D1D"/><circle cx="70" cy="56" r="4" fill="#7F1D1D"/>
    <path d="M50 74 q10 -8 20 0" fill="none" stroke="#7F1D1D" stroke-width="3" stroke-linecap="round"/>`,
};

/* ---------------- space ---------------- */

function planet({ colors, ring = false, tilt = 0, bands = false, spots = false, caption }) {
  const id = nextId();
  return `
  <defs><radialGradient id="${id}p" cx="35%" cy="30%" r="80%">
    <stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/>
  </radialGradient></defs>
  <g transform="rotate(${tilt} 60 62)">
    ${ring ? `<ellipse cx="60" cy="62" rx="46" ry="14" fill="none" stroke="${PALETTE.gold}" stroke-width="5" opacity=".85"/>` : ''}
    <circle cx="60" cy="62" r="28" fill="url(#${id}p)"/>
    ${ring ? `<path d="M14 62 a46 14 0 0 0 92 0" fill="none" stroke="${PALETTE.gold}" stroke-width="5" opacity=".95"/>` : ''}
    ${bands ? `<path d="M34 52 q26 8 52 0M34 64 q26 8 52 0M35 76 q25 6 50 0" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>` : ''}
    ${spots ? `<circle cx="50" cy="52" r="5" fill="rgba(0,0,0,.25)"/><circle cx="70" cy="72" r="7" fill="rgba(0,0,0,.22)"/><circle cx="46" cy="74" r="4" fill="rgba(0,0,0,.2)"/>` : ''}
    <ellipse cx="50" cy="50" rx="9" ry="6" fill="rgba(255,255,255,.18)"/>
  </g>
  ${caption ? label(caption, PALETTE.mist, 112, 12) : ''}`;
}

const SPACE = {
  sun: () => `
    <circle cx="60" cy="60" r="26" fill="${PALETTE.gold}"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<line x1="${(60 + Math.cos(a) * 30).toFixed(1)}" y1="${(60 + Math.sin(a) * 30).toFixed(1)}"
        x2="${(60 + Math.cos(a) * 42).toFixed(1)}" y2="${(60 + Math.sin(a) * 42).toFixed(1)}"
        stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
    }).join('')}
    <circle cx="60" cy="60" r="13" fill="#FDE68A"/>`,
  moon: () => `
    <circle cx="60" cy="60" r="28" fill="#D1D5DB"/>
    <circle cx="50" cy="52" r="7" fill="#9CA3AF"/><circle cx="70" cy="68" r="9" fill="#9CA3AF"/>
    <circle cx="66" cy="46" r="4" fill="#9CA3AF"/><circle cx="46" cy="72" r="5" fill="#9CA3AF"/>
    ${label('Moon', PALETTE.mist, 112, 12)}`,
  rocket: () => `
    <path d="M60 18 C74 34 78 52 74 74 H46 C42 52 46 34 60 18z" fill="${PALETTE.mist}"/>
    <circle cx="60" cy="44" r="8" fill="${PALETTE.cyan}"/>
    <path d="M46 62 L34 82 L46 76z" fill="${PALETTE.coral}"/><path d="M74 62 L86 82 L74 76z" fill="${PALETTE.coral}"/>
    <path d="M54 76 q6 16 6 22 q0 -6 6 -22z" fill="${PALETTE.gold}"/>`,
  orbit: () => `
    <circle cx="60" cy="60" r="12" fill="${PALETTE.gold}"/>
    <ellipse cx="60" cy="60" rx="44" ry="26" fill="none" stroke="${PALETTE.cyan}" stroke-width="2" stroke-dasharray="5 5"/>
    <circle cx="104" cy="60" r="7" fill="${PALETTE.cyan}"/>
    <ellipse cx="60" cy="60" rx="28" ry="16" fill="none" stroke="rgba(232,236,255,.35)" stroke-width="2"/>
    ${label('orbit', PALETTE.mist, 112, 12)}`,
  planets_row: () => `
    ${[[24, 6, PALETTE.grey], [44, 8, PALETTE.orange], [66, 9, PALETTE.cyan], [90, 7, PALETTE.coral]]
      .map(([x, r, c]) => `<circle cx="${x}" cy="60" r="${r}" fill="${c}"/>`).join('')}
    <circle cx="60" cy="26" r="10" fill="${PALETTE.gold}"/>
    ${label('8 planets', PALETTE.mist, 108, 12)}`,
  planet_mars: () => planet({ colors: ['#FCA5A5', '#B91C1C'], spots: true, caption: 'Mars' }),
  planet_earth: () => `
    <circle cx="60" cy="62" r="28" fill="#1D4ED8"/>
    <path d="M40 50 q12 6 6 18 q-8 6 -14 -2 q-2 -12 8 -16z" fill="${PALETTE.green}"/>
    <path d="M68 44 q14 4 12 16 q-4 10 -14 6 q-4 -12 2 -22z" fill="${PALETTE.green}"/>
    <path d="M62 78 q10 2 12 10 q-14 4 -18 -4 q2 -6 6 -6z" fill="${PALETTE.green}"/>
    <ellipse cx="50" cy="50" rx="9" ry="6" fill="rgba(255,255,255,.25)"/>
    ${label('Earth', PALETTE.mist, 112, 12)}`,
  planet_venus: () => planet({ colors: ['#FDE68A', '#D97706'], bands: true, caption: 'Venus' }),
  planet_jupiter: () => planet({ colors: ['#FDBA74', '#B45309'], bands: true, caption: 'Jupiter' }),
  planet_saturn: () => planet({ colors: ['#FCD34D', '#B45309'], ring: true, bands: true, caption: 'Saturn' }),
  planet_uranus: () => planet({ colors: ['#A5F3FC', '#0E7490'], ring: true, tilt: 78, caption: 'Uranus' }),
  planet_neptune: () => planet({ colors: ['#93C5FD', '#1E3A8A'], caption: 'Neptune' }),
};

/* ---------------- animals (parametric, original "sticker" style) ---------------- */

function face({ body, ear = 'round', earColor, extras = '', eyes = 'dot', mouth = 'smile', caption }) {
  const ears = {
    round: `<circle cx="34" cy="40" r="13" fill="${earColor || body}"/><circle cx="86" cy="40" r="13" fill="${earColor || body}"/>`,
    floppy: `<ellipse cx="28" cy="62" rx="11" ry="19" fill="${earColor || body}"/><ellipse cx="92" cy="62" rx="11" ry="19" fill="${earColor || body}"/>`,
    pointy: `<path d="M38 40 L30 16 L54 30z" fill="${earColor || body}"/><path d="M82 40 L90 16 L66 30z" fill="${earColor || body}"/>`,
    long: `<ellipse cx="60" cy="18" rx="7" ry="20" fill="${earColor || body}"/><ellipse cx="78" cy="20" rx="7" ry="18" fill="${earColor || body}"/>`,
    tiny: `<circle cx="40" cy="36" r="9" fill="${earColor || body}"/><circle cx="80" cy="36" r="9" fill="${earColor || body}"/>`,
    none: '',
  }[ear] || '';
  const eyeShapes = eyes === 'sleepy'
    ? `<path d="M46 58 q7 6 14 0" stroke="#1F2937" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M62 58 q7 6 14 0" stroke="#1F2937" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="50" cy="58" r="5.5" fill="#1F2937"/><circle cx="72" cy="58" r="5.5" fill="#1F2937"/>
       <circle cx="52" cy="56" r="2" fill="#fff"/><circle cx="74" cy="56" r="2" fill="#fff"/>`;
  const mouthShape = mouth === 'flat'
    ? `<path d="M52 80 h18" stroke="#1F2937" stroke-width="3" stroke-linecap="round"/>`
    : `<path d="M50 76 q11 12 22 0" stroke="#1F2937" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `${ears}${extras}
    <ellipse cx="60" cy="64" rx="31" ry="28" fill="${body}"/>
    ${eyeShapes}${mouthShape}
    ${caption ? label(caption, PALETTE.mist, 112, 12) : ''}`;
}

const ANIMALS = {
  animal_cow: () => face({
    body: '#F9FAFB', earColor: '#F9FAFB', ear: 'tiny', caption: 'Cow',
    extras: `<path d="M40 40 q-8 -10 -14 -6 q4 8 10 10z" fill="#D1D5DB"/><path d="M80 40 q8 -10 14 -6 q-4 8 -10 10z" fill="#D1D5DB"/>
      <ellipse cx="60" cy="74" rx="14" ry="10" fill="#FBCFE8"/>
      <circle cx="55" cy="72" r="2" fill="#9D174D"/><circle cx="65" cy="72" r="2" fill="#9D174D"/>
      <circle cx="44" cy="52" r="6" fill="#111827" opacity=".85"/><circle cx="78" cy="66" r="5" fill="#111827" opacity=".85"/>`,
    mouth: 'flat',
  }),
  animal_elephant: () => `
    <circle cx="30" cy="62" r="18" fill="#94A3B8"/><circle cx="90" cy="62" r="18" fill="#94A3B8"/>
    <ellipse cx="60" cy="60" rx="30" ry="27" fill="#CBD5E1"/>
    <circle cx="50" cy="54" r="5" fill="#334155"/><circle cx="70" cy="54" r="5" fill="#334155"/>
    <path d="M60 72 q-6 16 2 24 q8 -6 4 -24z" fill="#CBD5E1" stroke="#94A3B8" stroke-width="2"/>
    ${label('Elephant', PALETTE.mist, 112, 12)}`,
  animal_fish: () => `
    <ellipse cx="58" cy="60" rx="30" ry="20" fill="${PALETTE.cyan}"/>
    <path d="M88 60 l20 -14 v28z" fill="#0891B2"/>
    <circle cx="44" cy="54" r="4.5" fill="#0F172A"/>
    <path d="M30 70 q10 8 20 4" stroke="#0E7490" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="74" cy="52" r="4" fill="rgba(255,255,255,.6)"/>
    ${label('Fish', PALETTE.mist, 112, 12)}`,
  animal_dog: () => face({
    body: '#D97706', ear: 'floppy', earColor: '#92400E', caption: 'Dog',
    extras: `<ellipse cx="60" cy="76" rx="13" ry="9" fill="#FDE68A"/><ellipse cx="60" cy="72" rx="5" ry="3.5" fill="#1F2937"/>`,
  }),
  animal_puppy: () => face({
    body: '#FCD34D', ear: 'floppy', earColor: '#B45309', caption: 'Puppy',
    extras: `<ellipse cx="60" cy="78" rx="12" ry="8" fill="#FEF3C7"/><ellipse cx="60" cy="74" rx="5" ry="3.5" fill="#1F2937"/>`,
    eyes: 'sleepy',
  }),
  animal_bear: () => face({
    body: '#92400E', ear: 'round', earColor: '#78350F', caption: 'Bear',
    extras: `<ellipse cx="60" cy="78" rx="15" ry="10" fill="#FDE68A"/><ellipse cx="60" cy="72" rx="5" ry="4" fill="#1F2937"/>
      <circle cx="42" cy="44" r="5" fill="#FDE68A"/>`,
  }),
  animal_lion: () => `
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(60 + Math.cos(a) * 34).toFixed(1)}" cy="${(62 + Math.sin(a) * 30).toFixed(1)}" r="10" fill="#B45309"/>`;
    }).join('')}
    <ellipse cx="60" cy="62" rx="28" ry="26" fill="${PALETTE.gold}"/>
    <circle cx="50" cy="56" r="5" fill="#1F2937"/><circle cx="70" cy="56" r="5" fill="#1F2937"/>
    <path d="M60 66 l-6 6 h12z" fill="#78350F"/>
    <path d="M50 78 q10 8 20 0" stroke="#78350F" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${label('Lion', PALETTE.mist, 112, 12)}`,
  animal_turtle: () => `
    <ellipse cx="58" cy="66" rx="30" ry="22" fill="#15803D"/>
    <ellipse cx="58" cy="62" rx="22" ry="15" fill="#22C55E"/>
    <path d="M58 47 v30 M36 62 h44 M44 50 l28 24 M72 50 l-28 24" stroke="#166534" stroke-width="2.5"/>
    <circle cx="96" cy="58" r="10" fill="#4ADE80"/><circle cx="99" cy="55" r="2.5" fill="#1F2937"/>
    <ellipse cx="30" cy="80" rx="8" ry="5" fill="#4ADE80"/><ellipse cx="86" cy="80" rx="8" ry="5" fill="#4ADE80"/>`,
  animal_chameleon: () => `
    <path d="M34 62 q0 -22 26 -22 q28 0 30 22 q2 18 -18 18 h-24 q-14 0 -14 -18z" fill="#4ADE80"/>
    <path d="M90 66 q16 2 14 14 q-10 4 -16 -6" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round"/>
    <circle cx="62" cy="52" r="9" fill="#BBF7D0"/><circle cx="62" cy="52" r="4" fill="#1F2937"/>
    <circle cx="44" cy="66" r="4" fill="#16A34A"/><circle cx="62" cy="70" r="4" fill="#16A34A"/>
    <path d="M30 56 q-8 -6 -4 -14" stroke="#22C55E" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  animal_ostrich: () => `
    <path d="M70 40 q-6 -18 -4 -22 q4 2 8 2 q4 0 8 -2 q2 6 -4 22z" fill="#FBCFE8"/>
    <ellipse cx="62" cy="58" rx="22" ry="20" fill="#111827"/>
    <circle cx="88" cy="34" r="7" fill="#FBCFE8"/><circle cx="90" cy="32" r="2" fill="#111827"/>
    <path d="M60 78 q-2 16 6 20 M72 78 q4 14 -2 20" stroke="${PALETTE.gold}" stroke-width="5" stroke-linecap="round"/>`,
  animal_giraffe: () => `
    <path d="M56 34 q-4 -16 6 -18 q10 2 6 18z" fill="${PALETTE.gold}"/>
    <rect x="54" y="30" width="18" height="34" rx="8" fill="${PALETTE.gold}"/>
    <circle cx="63" cy="30" r="9" fill="#FDE68A"/>
    <circle cx="68" cy="24" r="2" fill="#B45309"/><circle cx="58" cy="30" r="2" fill="#B45309"/>
    ${[40, 48, 56].map((y) => `<circle cx="${60 + (y % 3) * 3}" cy="${y}" r="2.6" fill="#B45309"/>`).join('')}
    <ellipse cx="76" cy="72" rx="30" ry="22" fill="${PALETTE.gold}"/>
    ${[[64, 66], [78, 62], [88, 76], [70, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#B45309"/>`).join('')}
    <path d="M100 88 q6 12 -2 18 M80 92 q0 12 6 16" stroke="#B45309" stroke-width="4" stroke-linecap="round"/>`,
};

const ILLUSTRATIONS = { ...TECH, ...SPACE, ...ANIMALS };

/** Render an illustration key to SVG markup. Unknown keys render nothing. */
export function illustrationSVG(key) {
  if (!key) return '';
  const fn = ILLUSTRATIONS[key];
  if (!fn) return '';
  try {
    return plate(fn(), key.replace(/_/g, ' '));
  } catch {
    return '';
  }
}

export const ILLUSTRATION_KEYS = Object.keys(ILLUSTRATIONS);
export default illustrationSVG;
