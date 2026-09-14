/**
 * QUIZVERSE — SOUND LEVEL METER
 * ---------------------------------------------------------------------------
 * "Is it loud enough?" answered by measurement, not by guessing: plays every
 * synthesised sound in a real browser and prints the peak/RMS actually leaving
 * the audio graph (measured after the limiter).
 *
 *   node tools/sound-meter.mjs            # needs the app server on :4317
 *   node tools/sound-meter.mjs --url http://127.0.0.1:4320
 *
 * Exits non-zero when a sound is too quiet to be heard across a classroom.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : (process.env.QV_URL || 'http://127.0.0.1:4317');
const PORT = 9341;

/** peak below this = not audible at the back of a classroom */
const MIN_PEAK = 0.5;
const MIN_MUSIC_PEAK = 0.08;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(url, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => (Date.now() - start > timeout ? reject(new Error(`timeout ${url}`)) : setTimeout(tick, 250)));
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

if (!existsSync(CHROME)) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2); }

const profile = mkdtempSync(path.join(tmpdir(), 'qv-sound-'));
const child = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  `${BASE}/#/landing`,
], { stdio: 'ignore', detached: process.platform !== 'win32' });

const cleanup = () => {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
};
process.on('exit', cleanup);

try {
  await waitFor(`http://127.0.0.1:${PORT}/json/version`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const mId = ++id; pending.set(mId, resolve); socket.send(JSON.stringify({ id: mId, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const waitExpr = async (expression, timeout = 15000) => {
    const started = Date.now();
    for (;;) {
      if (await evaluate(expression).catch(() => false)) return true;
      if (Date.now() - started > timeout) throw new Error(`timeout: ${expression}`);
      await sleep(200);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await waitExpr('window.QUIZVERSE && window.QUIZVERSE.Sound');
  await sleep(600);

  // unlock the graph the way a real tap does
  await evaluate('window.QUIZVERSE.Sound.unlock()');
  await evaluate('window.QUIZVERSE.Sound.apply({ sound: true, effects: true, music: true, volume: 1 })');
  await sleep(300);

  const diag = await evaluate('window.QUIZVERSE.Sound.diagnostics()');
  console.log(`\nQUIZVERSE sound meter — ${BASE}`);
  console.log(`  context: ${diag.state} · unlocked: ${diag.unlocked} · volume: ${diag.volume} · master: ${diag.masterGain} · limiter at ${diag.limiterThreshold} dB · source trim ×${diag.sourceTrim}\n`);

  const results = [];
  const sounds = ['intro', 'questionStart', 'select', 'tick', 'correct', 'wrong', 'stageClear', 'lifeline', 'whoosh', 'applause', 'finalWin'];

  for (const name of sounds) {
    const measured = await evaluate(`(async () => {
      const S = window.QUIZVERSE.Sound;
      S.play('${name}');
      let peak = 0; let rms = 0;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 40));
        const l = S.level();
        if (l.peak > peak) peak = l.peak;
        if (l.rms > rms) rms = l.rms;
      }
      return { peak, rms };
    })()`);
    results.push({ name, ...measured });
    const ok = measured.peak >= MIN_PEAK;
    console.log(`  ${ok ? '✔' : '✖'} ${name.padEnd(14)} peak ${String(measured.peak).padEnd(6)} rms ${String(measured.rms).padEnd(6)} ${ok ? '' : '← too quiet'}`);
  }

  // music bed: sustained level over a few seconds
  await evaluate('window.QUIZVERSE.Sound.startMusic()');
  const music = await evaluate(`(async () => {
    const S = window.QUIZVERSE.Sound;
    let peak = 0; let rms = 0;
    for (let i = 0; i < 75; i++) {
      await new Promise(r => setTimeout(r, 40));
      const l = S.level();
      if (l.peak > peak) peak = l.peak;
      if (l.rms > rms) rms = l.rms;
    }
    return { peak, rms };
  })()`);
  await evaluate('window.QUIZVERSE.Sound.stopMusic()');
  const musicOk = music.peak >= MIN_MUSIC_PEAK;
  console.log(`  ${musicOk ? '✔' : '✖'} ${'music bed'.padEnd(14)} peak ${String(music.peak).padEnd(6)} rms ${String(music.rms).padEnd(6)} ${musicOk ? '' : '← too quiet'}`);

  const quiet = results.filter((r) => r.peak < MIN_PEAK);
  const loudest = results.reduce((a, b) => (b.peak > a.peak ? b : a), results[0]);

  console.log(`\n  loudest: ${loudest.name} (peak ${loudest.peak}) · quietest: ${quiet.length ? quiet.map((q) => `${q.name} (${q.peak})`).join(', ') : 'none below target'}`);

  if (quiet.length || !musicOk) {
    console.error(`\n${quiet.length + (musicOk ? 0 : 1)} sound(s) below the ${MIN_PEAK} peak target — the class would not hear them clearly.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} sounds + music clear the ${MIN_PEAK} peak target.`);
  }
} finally {
  cleanup();
}
