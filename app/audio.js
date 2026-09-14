/**
 * QUIZVERSE — SOUND ENGINE v2 (Layer 3)
 * ---------------------------------------------------------------------------
 * Game-show audio, synthesised at runtime. Nothing is sampled, nothing is
 * downloaded and no broadcast/third-party audio is used — which is both the IP
 * guardrail (PRODUCT_DEVELOPMENT.md §2) and what lets us master the loudness for
 * a classroom speaker instead of hoping a stock clip is audible.
 *
 * Signal chain:  source → bus (fx/music) → master gain → compressor → speakers
 *
 * The show sequence (§11), as the teacher asked for it:
 *   intro        → the game is starting (riser + impact + stab + shimmer)
 *   questionStart→ a new question lands (whoosh + thud + sparkle + screen flash)
 *   suspense     → the answer is being decided (heartbeat + tension pad + riser)
 *   tick/tock    → the clock, loud, accelerating in the last five seconds
 *   correct      → bright arpeggio + sparkle
 *   wrong        → buzzer + thud (dramatic, never harsh or mocking)
 *   stageClear   → rising fanfare
 *   applause     → claps + crowd, for the winner
 *   finalWin     → fanfare + applause together
 *   lifeline     → magical sweep
 */

const DEFAULTS = { sound: true, music: false, effects: true, volume: 0.9 };

let settings = { ...DEFAULTS };
let ctx = null;
let master = null;
let comp = null;
let fxBus = null;
let musicBus = null;
let unlocked = false;

let musicTimer = null;
let suspenseTimer = null;
let suspenseNodes = null;
let suspenseIntensity = 0.4;

export const SOUND_NAMES = [
  'intro', 'questionStart', 'select', 'tick', 'correct', 'wrong',
  'stageClear', 'applause', 'finalWin', 'lifeline', 'whoosh', 'button',
];

/* ------------------------------------------------------------------ */
/* graph                                                              */
/* ------------------------------------------------------------------ */

function ensureCtx() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();

  // A compressor is what makes this audible on a classroom speaker without clipping.
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 7;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  master = ctx.createGain();
  master.gain.value = settings.sound ? settings.volume : 0;
  master.connect(comp).connect(ctx.destination);

  fxBus = ctx.createGain();
  fxBus.gain.value = settings.effects ? 1 : 0;
  fxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music ? 0.45 : 0;
  musicBus.connect(master);

  return ctx;
}

const t0 = () => ctx.currentTime;

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

/** A single envelope-shaped oscillator. */
function tone({
  freq, to, dur = 0.2, type = 'triangle', gain = 0.3, delay = 0, bus = 'fx', attack = 0.008, detune = 0,
}) {
  if (!ensureCtx()) return;
  const start = t0() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, start);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(bus === 'music' ? musicBus : fxBus);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Filtered noise burst — claps, cymbals, whooshes, crowd. */
function noise({
  dur = 0.25, gain = 0.2, from = 400, to = 3000, delay = 0, q = 1, type = 'bandpass', attack = 0.005, bus = 'fx',
}) {
  if (!ensureCtx()) return;
  const start = t0() + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  src.connect(filter).connect(g).connect(bus === 'music' ? musicBus : fxBus);
  src.start(start);
  src.stop(start + dur + 0.05);
}

/** Low impact used under intros and question reveals. */
function impact(delay = 0, gain = 0.42) {
  tone({ freq: 92, to: 34, dur: 1.1, type: 'sine', gain, delay });
  noise({ dur: 0.5, gain: gain * 0.5, from: 2400, to: 120, delay, type: 'lowpass', q: 0.7 });
}

/* ------------------------------------------------------------------ */
/* the sound library (all original)                                    */
/* ------------------------------------------------------------------ */

const SOUNDS = {
  button: () => tone({ freq: 940, to: 720, dur: 0.07, type: 'triangle', gain: 0.18 }),

  select: () => {
    tone({ freq: 660, dur: 0.08, type: 'square', gain: 0.16 });
    tone({ freq: 990, dur: 0.16, type: 'triangle', gain: 0.26, delay: 0.07 });
  },

  /** "The show is starting." ~3.8s */
  intro: () => {
    // riser
    tone({ freq: 110, to: 900, dur: 1.7, type: 'sawtooth', gain: 0.16 });
    noise({ dur: 1.7, gain: 0.14, from: 200, to: 5200, q: 0.8 });
    // impact + stab
    impact(1.72, 0.5);
    [523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, dur: 1.6, type: 'triangle', gain: 0.24, delay: 1.78 + i * 0.02 }));
    // shimmer
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone({ freq: f, dur: 0.9, type: 'sine', gain: 0.14, delay: 2.1 + i * 0.11 }));
    tone({ freq: 130.81, dur: 2.2, type: 'sine', gain: 0.2, delay: 1.8 });
  },

  /** "Here comes the next question." whoosh + thud + sparkle (the screen flashes at the same moment). */
  questionStart: () => {
    noise({ dur: 0.34, gain: 0.24, from: 260, to: 4200, q: 0.9 });
    impact(0.16, 0.44);
    [1174.66, 1567.98].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.16, delay: 0.22 + i * 0.07 }));
  },

  /** Loud clock tick. */
  tick: () => {
    tone({ freq: 2200, dur: 0.035, type: 'square', gain: 0.22 });
    noise({ dur: 0.03, gain: 0.16, from: 3200, to: 3200, q: 2 });
  },

  /** The alternative tick, so the clock sounds like a clock and not a metronome. */
  tock: () => {
    tone({ freq: 1650, dur: 0.04, type: 'square', gain: 0.2 });
    noise({ dur: 0.03, gain: 0.13, from: 2400, to: 2400, q: 2 });
  },

  correct: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.28, delay: i * 0.07 }));
    noise({ dur: 0.4, gain: 0.1, from: 2600, to: 6800, delay: 0.04 });
    tone({ freq: 2093, dur: 0.5, type: 'sine', gain: 0.12, delay: 0.3 });
  },

  wrong: () => {
    // dramatic buzzer + descending thud, deliberately not harsh for children
    tone({ freq: 196, to: 150, dur: 0.5, type: 'sawtooth', gain: 0.26 });
    tone({ freq: 147, to: 110, dur: 0.6, type: 'square', gain: 0.14, delay: 0.04 });
    noise({ dur: 0.4, gain: 0.12, from: 900, to: 180, delay: 0.02, type: 'lowpass', q: 0.8 });
    tone({ freq: 82, to: 55, dur: 0.7, type: 'sine', gain: 0.3, delay: 0.1 });
  },

  stageClear: () => {
    [523.25, 659.25, 783.99, 987.77, 1318.51].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.26, delay: i * 0.1 }));
    noise({ dur: 0.9, gain: 0.09, from: 2000, to: 7000, delay: 0.1 });
  },

  /** Synthesised applause: many claps + a crowd bed + a whistle. ~3.4s */
  applause: () => {
    for (let i = 0; i < 70; i++) {
      const at = Math.random() * 2.6;
      noise({
        dur: 0.05 + Math.random() * 0.05,
        gain: 0.06 + Math.random() * 0.07,
        from: 1200 + Math.random() * 2400,
        to: 1800 + Math.random() * 2600,
        q: 1.6,
        delay: at,
      });
    }
    noise({ dur: 2.8, gain: 0.09, from: 500, to: 1800, q: 0.6, attack: 0.4 }); // crowd bed
    tone({ freq: 1400, to: 2600, dur: 0.5, type: 'sine', gain: 0.07, delay: 1.1 }); // whistle
    tone({ freq: 1500, to: 2900, dur: 0.45, type: 'sine', gain: 0.06, delay: 1.9 });
  },

  finalWin: () => {
    const melody = [523.25, 523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5, 1318.51];
    melody.forEach((f, i) => tone({ freq: f, dur: 0.46, type: 'triangle', gain: 0.28, delay: i * 0.15 }));
    [261.63, 392, 523.25].forEach((f) => tone({ freq: f, dur: 2.4, type: 'sine', gain: 0.16, delay: 1.2 }));
    impact(1.2, 0.3);
    SOUNDS.applause();
  },

  lifeline: () => {
    tone({ freq: 320, to: 1240, dur: 0.36, type: 'sawtooth', gain: 0.16 });
    tone({ freq: 640, to: 2480, dur: 0.32, type: 'triangle', gain: 0.14, delay: 0.05 });
    noise({ dur: 0.3, gain: 0.1, from: 1200, to: 6000, delay: 0.02 });
  },

  whoosh: () => noise({ dur: 0.3, gain: 0.22, from: 180, to: 3600, q: 0.8 }),
};

/* ------------------------------------------------------------------ */
/* suspense bed (heartbeat + tension) with intensity                   */
/* ------------------------------------------------------------------ */

function scheduleSuspenseBar() {
  if (!ctx || !suspenseNodes) return;
  const { pad, padGain } = suspenseNodes;
  const beat = 0.72 - suspenseIntensity * 0.22; // heartbeat gets faster as time runs out

  tone({ freq: 62, to: 40, dur: 0.26, type: 'sine', gain: 0.2 + suspenseIntensity * 0.1 });
  tone({ freq: 58, to: 38, dur: 0.22, type: 'sine', gain: 0.14 + suspenseIntensity * 0.08, delay: beat * 0.42 });

  if (pad && padGain) {
    padGain.gain.setTargetAtTime(0.03 + suspenseIntensity * 0.05, t0(), 0.4);
    pad.detune.setTargetAtTime(suspenseIntensity * 40, t0(), 0.5);
  }
  if (Math.random() < 0.35 + suspenseIntensity * 0.3) {
    tone({ freq: 1200 + Math.random() * 900, dur: 0.14, type: 'sine', gain: 0.05 });
  }
}

function startSuspense() {
  if (!ensureCtx() || suspenseNodes) return;
  const pad = ctx.createOscillator();
  const padGain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  pad.type = 'sawtooth';
  pad.frequency.value = 174;
  padGain.gain.value = 0.04;
  lfo.frequency.value = 5.2;
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain).connect(pad.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 3;

  pad.connect(filter).connect(padGain).connect(fxBus);
  pad.start();
  lfo.start();

  suspenseNodes = { pad, padGain, lfo, filter };
  scheduleSuspenseBar();
  suspenseTimer = setInterval(scheduleSuspenseBar, 720);
}

function stopSuspense() {
  if (suspenseTimer) { clearInterval(suspenseTimer); suspenseTimer = null; }
  if (!suspenseNodes || !ctx) return;
  const { pad, padGain, lfo } = suspenseNodes;
  padGain.gain.setTargetAtTime(0.0001, t0(), 0.12);
  pad.stop(t0() + 0.5);
  lfo.stop(t0() + 0.5);
  suspenseNodes = null;
}

/* ------------------------------------------------------------------ */
/* background music (original loop, off by default)                    */
/* ------------------------------------------------------------------ */

const MUSIC_CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];

function musicStep() {
  if (!ctx || !settings.music || !settings.sound) return;
  const chord = MUSIC_CHORDS[Math.floor((Date.now() / 2400) % MUSIC_CHORDS.length)];
  tone({ freq: chord[Math.floor(Math.random() * chord.length)] * 2, dur: 0.5, type: 'triangle', gain: 0.06, bus: 'music' });
  if (Math.random() < 0.5) tone({ freq: chord[0], dur: 0.9, type: 'sine', gain: 0.05, bus: 'music', delay: 0.12 });
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

export const Sound = {
  /** Must be called from a real user gesture (iOS/Chrome autoplay policy). */
  unlock() {
    if (!ensureCtx()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    return true;
  },
  get unlocked() { return unlocked; },
  getSettings() { return { ...settings }; },

  apply(next = {}) {
    const clean = {};
    for (const [key, value] of Object.entries(next)) {
      if (value !== undefined && value !== null) clean[key] = value;
    }
    settings = { ...settings, ...clean };
    settings.volume = Number.isFinite(settings.volume) ? Math.min(1, Math.max(0, settings.volume)) : DEFAULTS.volume;
    if (master) master.gain.value = settings.sound ? settings.volume : 0;
    if (fxBus) fxBus.gain.value = settings.effects ? 1 : 0;
    if (musicBus) musicBus.gain.value = settings.music ? 0.45 : 0;
    if (!settings.sound || !settings.music) Sound.stopMusic();
    else if (unlocked) Sound.startMusic();
    if (!settings.sound || !settings.effects) stopSuspense();
    return Sound.getSettings();
  },

  /** Play a named sound. `name` may be 'applause', 'intro', 'tick', … */
  play(name) {
    if (!settings.sound || !settings.effects || !unlocked) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try { fn(); } catch { /* audio must never break the game */ }
  },

  /** 0..1 — raises the heartbeat tempo and the tension pad as the clock runs down. */
  setSuspenseIntensity(value) {
    suspenseIntensity = Math.min(1, Math.max(0, Number(value) || 0));
  },

  startSuspense() {
    if (!settings.sound || !settings.effects || !unlocked) return;
    try { startSuspense(); } catch { /* ignore */ }
  },
  stopSuspense,

  startMusic() {
    if (!settings.sound || !settings.music || !unlocked || musicTimer) return;
    musicTimer = setInterval(musicStep, 600);
  },
  stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },

  /** Used by the Settings screen so a teacher can check the classroom speaker. */
  test(name) {
    const wasUnlocked = unlocked;
    Sound.unlock();
    Sound.play(name);
    return wasUnlocked || unlocked;
  },

  dispose() {
    Sound.stopMusic();
    stopSuspense();
    if (ctx) { try { ctx.close(); } catch { /* ignore */ } }
    ctx = null; master = null; comp = null; fxBus = null; musicBus = null; unlocked = false;
  },
};

export default Sound;
