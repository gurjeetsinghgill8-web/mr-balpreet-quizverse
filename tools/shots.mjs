/**
 * QUIZVERSE — screenshot harness (design review)
 * Captures the key screens so the UI can be judged, not assumed.
 *
 *   node tools/shots.mjs           → writes PNGs into ./shots
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.QV_URL || 'http://127.0.0.1:4317';
const PORT = 9335;
const OUT = 'shots';
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

if (!existsSync(OUT)) mkdirSync(OUT);
if (!existsSync(CHROME)) { console.error('Chrome not found'); process.exit(2); }

const profile = mkdtempSync(path.join(tmpdir(), 'qv-shots-'));
const child = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--hide-scrollbars', '--window-size=1440,900', `${BASE}/#/landing`,
], { stdio: 'ignore' });

/** Kill the whole browser tree (see tools/smoke.mjs for why). */
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    socket.send(JSON.stringify({ id: msgId, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const waitForExpr = async (expression, timeout = 12000) => {
    const started = Date.now();
    for (;;) {
      if (await evaluate(expression).catch(() => false)) return true;
      if (Date.now() - started > timeout) throw new Error(`timeout: ${expression}`);
      await sleep(200);
    }
  };
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log(`  📸 ${file}`);
  };

  await send('Runtime.enable');
  await send('Page.enable');

  /* landing */
  await waitForExpr('document.querySelectorAll("[data-demo]").length === 3');
  await sleep(600);
  await shot('01-landing');

  /* create form */
  await evaluate('document.querySelector(\'[data-action="go-create"]\').click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "create"');
  await sleep(500);
  await shot('02-create');

  /* preview (Class 1 Animals for tier A visuals) */
  await evaluate(`(() => {
    const cls = [...document.querySelectorAll('input[name="class"]')].find(i => i.value === '1');
    cls.checked = true;
    document.querySelector('#qv-topic').value = 'Animals';
    const c = [...document.querySelectorAll('input[name="count"]')].find(i => i.value === '10');
    c.checked = true;
  })()`);
  await evaluate('document.querySelector("#qv-generate").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "preview"');
  await sleep(600);
  await shot('03-preview-tierA');

  /* student name + briefing */
  await evaluate('document.querySelector("#qv-start").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "name"');
  await sleep(400);
  await shot('04-name');
  await evaluate('document.querySelector("#qv-student-name").value = "Aarav"');
  await evaluate('document.querySelector("#qv-name-go").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "briefing"');
  await sleep(500);
  await shot('05-briefing');

  /* game — question */
  await evaluate('document.querySelector("#qv-lets-play").click()');
  await waitForExpr('window.QUIZVERSE.debug && window.QUIZVERSE.debug.view().status === "QUESTION_READY"');
  await sleep(900);
  await shot('06-question-tierA');

  /* lifelines used */
  await evaluate('document.querySelector(\'.qv-lifeline[data-life="half_half"]\').click()');
  await sleep(300);
  await evaluate('document.querySelector(\'.qv-lifeline[data-life="clue"]\').click()');
  await sleep(500);
  await shot('07-lifelines');

  /* wrong answer feedback */
  const wrongKey = await evaluate(`(() => {
    const v = window.QUIZVERSE.debug.view();
    const correct = window.QUIZVERSE.debug.answerKey();
    return v.options.find(o => o.state === 'normal' && o.key !== correct)?.key;
  })()`);
  await evaluate(`document.querySelector('.qv-option[data-key="${wrongKey}"]').click()`);
  await sleep(1500);
  await shot('08-wrong-feedback');

  /* stage complete */
  await evaluate('document.querySelector("#qv-continue")?.click()');
  await sleep(400);
  let guard = 0;
  while (guard++ < 80) {
    const snap = await evaluate(`(() => {
      const dbg = window.QUIZVERSE.debug;
      if (!dbg) return { route: document.getElementById('qv-root').dataset.screen };
      return { route: 'game', status: dbg.view().status };
    })()`);
    if (snap.route !== 'game') break;
    if (snap.status === 'STAGE_COMPLETE') break;
    if (snap.status === 'QUESTION_READY') {
      const k = await evaluate('window.QUIZVERSE.debug.answerKey()');
      await evaluate(`document.querySelector('.qv-option[data-key="${k}"]').click()`);
      await sleep(1250);
      await evaluate('document.querySelector("#qv-continue")?.click()');
      await sleep(250);
    } else {
      await evaluate('document.querySelector("#qv-continue")?.click()');
      await sleep(250);
    }
  }
  await sleep(500);
  await shot('09-stage-complete');

  /* finish the game → winner */
  guard = 0;
  while (guard++ < 120) {
    const snap = await evaluate(`(() => {
      const dbg = window.QUIZVERSE.debug;
      return { route: document.getElementById('qv-root').dataset.screen, status: dbg ? dbg.view().status : null };
    })()`);
    if (snap.route !== 'game') break;
    if (snap.status === 'QUESTION_READY') {
      const k = await evaluate('window.QUIZVERSE.debug.answerKey()');
      await evaluate(`document.querySelector('.qv-option[data-key="${k}"]').click()`);
      await sleep(1250);
      await evaluate('document.querySelector("#qv-continue")?.click()');
      await sleep(250);
    } else if (snap.status === 'STAGE_COMPLETE') {
      await evaluate('document.querySelector("#qv-next-stage").click()');
      await sleep(400);
    } else {
      await evaluate('document.querySelector("#qv-continue")?.click()');
      await sleep(250);
    }
  }
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "result"');
  await sleep(1600);
  await shot('10-winner');

  /* review */
  await evaluate('document.querySelector("#qv-review").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "review"');
  await sleep(700);
  await shot('11-review');

  /* dashboard */
  await evaluate('document.querySelector(\'[data-action="go-dashboard"]\').click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "dashboard"');
  await sleep(700);
  await shot('12-dashboard');

  /* settings — generation engine */
  await evaluate(`(() => { location.hash = '#/settings'; })()`);
  await waitForExpr('document.querySelector("#qv-provider")');
  await sleep(800);
  await shot('17-settings-engine');

  /* tier C — Class 7 Hindi Computer */
  await evaluate(`(() => {
    location.hash = '#/create';
  })()`);
  await sleep(700);
  await evaluate(`(() => {
    const cls = [...document.querySelectorAll('input[name="class"]')].find(i => i.value === '7');
    cls.checked = true;
    document.querySelector('#qv-topic').value = 'कंप्यूटर';
    const lang = [...document.querySelectorAll('input[name="lang"]')].find(i => i.value === 'hi');
    lang.checked = true;
    const c = [...document.querySelectorAll('input[name="count"]')].find(i => i.value === '15');
    c.checked = true;
  })()`);
  await evaluate('document.querySelector("#qv-generate").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "preview"');
  await sleep(500);
  await shot('13-preview-hindi');
  await evaluate('document.querySelector("#qv-start").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "name"');
  await evaluate('document.querySelector("#qv-student-name").value = "आरव"');
  await evaluate('document.querySelector("#qv-name-go").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "briefing"');
  await evaluate('document.querySelector("#qv-lets-play").click()');
  await waitForExpr('window.QUIZVERSE.debug && window.QUIZVERSE.debug.view().status === "QUESTION_READY"');
  await sleep(900);
  await shot('14-question-hindi-tierC');

  /* teacher preview + inline question editor */
  await evaluate(`(() => { location.hash = '#/create'; })()`);
  await waitForExpr('document.querySelector("#qv-topic")');
  await evaluate(`(() => {
    [...document.querySelectorAll('input[name="class"]')].find(i => i.value === '5').checked = true;
    [...document.querySelectorAll('input[name="lang"]')].find(i => i.value === 'en').checked = true;
    document.querySelector('#qv-topic').value = 'Solar System';
    [...document.querySelectorAll('input[name="count"]')].find(i => i.value === '15').checked = true;
  })()`);
  await evaluate('document.querySelector("#qv-generate").click()');
  await waitForExpr('document.getElementById("qv-root").dataset.screen === "preview"');
  await sleep(700);
  await shot('18-preview-with-pipeline');
  await evaluate('document.querySelector("[data-edit]").click()');
  await waitForExpr('document.querySelector("#qv-edit-question")');
  await sleep(500);
  await shot('19-question-editor');

  /* mobile portrait */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(800);
  await shot('15-mobile-game');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await sleep(800);
  await shot('16-mobile-landscape');
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('\nScreenshots written to ./shots');
} finally {
  cleanup();
}
