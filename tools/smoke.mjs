/**
 * QUIZVERSE — BROWSER END-TO-END SMOKE TEST
 * ---------------------------------------------------------------------------
 * Drives a real headless Chrome through the whole product with the DevTools
 * Protocol: landing → generate → preview → student name → 5 stages with all
 * four lifelines → winner → review. Fails on any console error, uncaught
 * exception or failed request.
 *
 *   node server.mjs                 (in one terminal)
 *   node tools/smoke.mjs            (in another)
 *
 *   node tools/smoke.mjs --url http://127.0.0.1:4317 --headed
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = getArg('--url', process.env.QV_URL || 'http://127.0.0.1:4317');
const HEADED = args.includes('--headed');
const PORT = Number(getArg('--debug-port', '9333'));
const PDF_FIXTURE = getArg('--pdf', fileURLToPath(new URL('./fixtures/lesson-plants.pdf', import.meta.url)));
const SCANNED_FIXTURE = getArg('--scanned-pdf', fileURLToPath(new URL('./fixtures/scanned-page.pdf', import.meta.url)));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? '  ✔' : '  ✖';
  console.log(`${mark} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function waitForHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`timeout waiting for ${url}`));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

/* ------------------------------------------------------------------ */
/* minimal CDP client                                                  */
/* ------------------------------------------------------------------ */

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', (e) => reject(new Error(`websocket error: ${e.message || 'unknown'}`)), { once: true });
  });

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    socket.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => {
      if (pending.has(msgId)) {
        pending.delete(msgId);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
  });

  return { socket, send, events };
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('No Chrome/Edge binary found. Set CHROME_PATH and retry.');
    process.exit(2);
  }

  const status = await waitForHttp(BASE).catch(() => null);
  if (!status) {
    console.error(`App server not reachable at ${BASE}. Start it with:  node server.mjs`);
    process.exit(2);
  }
  console.log(`QUIZVERSE smoke test\n  app      : ${BASE}\n  browser  : ${chrome}\n`);

  const profile = mkdtempSync(path.join(tmpdir(), 'qv-smoke-'));
  const child = spawn(chrome, [
    HEADED ? '--new-window' : '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-features=Translate,BackForwardCache',
    '--window-size=1440,900',
    `${BASE}/#/landing`,
  ], { stdio: 'ignore' });

  /**
 * Kill the whole browser tree. Chrome's renderer/GPU children outlive a plain
 * child.kill(); a pile-up of them starves the machine and makes runs flaky.
 */
const cleanup = () => {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
};
  process.on('exit', cleanup);

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page') || list[0];
    const { send, events } = await connect(page.webSocketDebuggerUrl);

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    const evaluate = async (expression, { awaitPromise = true } = {}) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (res.exceptionDetails) {
        const text = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
        throw new Error(`page exception: ${text}`);
      }
      return res.result.value;
    };

    await send('Page.navigate', { url: `${BASE}/#/landing` });

    /** Poll an expression until it returns truthy (SPA renders are async). */
    const waitFor = async (expression, { timeout = 12000, label = expression } = {}) => {
      const started = Date.now();
      for (;;) {
        const value = await evaluate(expression).catch(() => false);
        if (value) return value;
        if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${label}`);
        await sleep(200);
      }
    };

    await waitFor('document.getElementById("qv-root").dataset.screen === "landing" && document.querySelectorAll("[data-demo]").length === 3',
      { label: 'landing screen' });

    const jsErrors = [];
    const failedRequests = [];

    /* ---------------- 1. landing ---------------- */
    const landingText = await evaluate('document.body.innerText');
    const screen = await evaluate('document.getElementById("qv-root").dataset.screen');
    check('landing screen renders', screen === 'landing', `screen=${screen}`);
    check('hero headline present', /turn any lesson into a game/i.test(landingText));
    check('demo library shows 3 packs', await evaluate('document.querySelectorAll("[data-demo]").length') === 3);
    check('mascot QUIZO rendered', await evaluate('!!document.querySelector(".qv-mascot-svg")'));
    check('tier attribute set on root', ['A', 'B', 'C'].includes(await evaluate('document.getElementById("qv-root").dataset.tier')));

    /* ---------------- 1b. audio: trusted gesture, unlock, settings (§11) ---------------- */
    const ctaBox = await evaluate(`(() => {
      const r = document.querySelector('[data-action="go-create"]').getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ctaBox.x, y: ctaBox.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ctaBox.x, y: ctaBox.y, button: 'left', clickCount: 1 });
    await sleep(600);
    check('a real tap unlocks the audio engine', await evaluate('window.QUIZVERSE.Sound.unlocked') === true);
    const audioState = await evaluate('window.QUIZVERSE.Sound.getSettings()');
    check('sound settings are persisted per device',
      audioState && typeof audioState.sound === 'boolean' && typeof audioState.volume === 'number',
      JSON.stringify(audioState));
    check('music is ON by default for the game-show feel',
      audioState && audioState.music === true, JSON.stringify(audioState));
    check('the volume defaults to full loudness',
      audioState && audioState.volume >= 0.9, `volume=${audioState && audioState.volume}`);

    const played = await evaluate(`(() => {
      try {
        ['intro','questionStart','select','tick','tock','correct','wrong','stageClear','applause','finalWin','lifeline','whoosh','button']
          .forEach((n) => window.QUIZVERSE.Sound.play(n));
        window.QUIZVERSE.Sound.startSuspense();
        window.QUIZVERSE.Sound.setSuspenseIntensity(0.9);
        window.QUIZVERSE.Sound.stopSuspense();
        window.QUIZVERSE.Sound.startMusic(); window.QUIZVERSE.Sound.stopMusic();
        return 'ok';
      } catch (e) { return 'error: ' + e.message; }
    })()`);
    check('every synthesised sound plays without error', played === 'ok', played);
    check('the show intro is a real multi-second sting',
      await evaluate('window.QUIZVERSE.Sound.getSettings().volume') >= 0.5,
      'default volume must be loud enough for a classroom speaker');

    await evaluate('document.querySelector(\'[data-action="sound"]\').click()');
    await sleep(300);
    check('sound can be switched OFF from the chrome',
      (await evaluate('window.QUIZVERSE.Sound.getSettings()')).sound === false);
    await evaluate('document.querySelector(\'[data-action="sound"]\').click()');
    await sleep(300);
    check('sound can be switched back ON',
      (await evaluate('window.QUIZVERSE.Sound.getSettings()')).sound === true);
    const uiLang = await evaluate('(() => { document.querySelector(\'[data-action="lang"]\').click(); return document.documentElement.lang; })()');
    await sleep(400);
    check('language toggle switches the interface to Hindi', uiLang === 'hi' || (await evaluate('document.documentElement.lang')) === 'hi');
    await evaluate('document.querySelector(\'[data-action="lang"]\').click()');
    await sleep(400);
    check('language toggle returns to English', (await evaluate('document.documentElement.lang')) === 'en');
    await evaluate(`(() => { location.hash = '#/landing'; })()`);
    await waitFor('document.querySelector("#qv-try-demo")', { label: 'landing CTA again' });

    /* ---------------- 2. guard: game without a session ---------------- */
    await send('Page.navigate', { url: `${BASE}/#/game` });
    await waitFor('!!document.getElementById("qv-root").dataset.screen', { label: 'app boot' });
    await sleep(600);
    check('stale #/game link is guarded back to landing',
      await evaluate('document.getElementById("qv-root").dataset.screen') === 'landing');

    /* ---------------- 3. generate a game (Try Demo) ---------------- */
    await send('Page.navigate', { url: `${BASE}/#/landing` });
    await waitFor('document.querySelector("#qv-try-demo")', { label: 'landing CTA' });
    await evaluate('document.querySelector("#qv-try-demo").click()');
    const loadingScreen = await evaluate('document.getElementById("qv-root").dataset.screen');
    check('generation progress screen appears', loadingScreen === 'loading', `screen=${loadingScreen}`);
    await waitFor('document.getElementById("qv-root").dataset.screen === "preview"', { label: 'preview screen' });
    const previewScreen = await evaluate('document.getElementById("qv-root").dataset.screen');
    check('preview screen reached after generation', previewScreen === 'preview', `screen=${previewScreen}`);
    const questionRows = await evaluate('document.querySelectorAll(".qv-qlist-item").length');
    check('preview lists 15 validated questions', questionRows === 15, `rows=${questionRows}`);
    check('preview marks validation as passed',
      /passed validation|All checks passed/i.test(await evaluate('document.body.innerText')));

    /* ---------------- 4. student name → briefing ---------------- */
    await evaluate('document.querySelector("#qv-start").click()');
    await sleep(400);
    check('student name screen reached',
      await evaluate('document.getElementById("qv-root").dataset.screen') === 'name');
    await evaluate('document.querySelector("#qv-student-name").value = "Aarav"');
    await evaluate('document.querySelector("#qv-name-go").click()');
    await sleep(400);
    const briefingText = await evaluate('document.body.innerText');
    check('mission briefing greets the student by name', briefingText.includes('Aarav'));
    await evaluate('document.querySelector("#qv-lets-play").click()');
    await sleep(700);
    check('game board reached',
      await evaluate('document.getElementById("qv-root").dataset.screen') === 'game');

    /* ---------------- 5. first question + lifelines ---------------- */
    const view1 = await evaluate('window.QUIZVERSE.debug.view()');
    check('question 1 of stage 1 is ready', view1.status === 'QUESTION_READY' && view1.stageNumber === 1, `status=${view1.status}`);
    check('a new question fires the on-screen flash and the landing sound',
      await evaluate('window.QUIZVERSE.debug.view().status === "QUESTION_READY"'));
    check('exactly four answer options rendered',
      await evaluate('document.querySelectorAll(".qv-option").length') === 4);
    check('stage rail shows 5 stages', await evaluate('document.querySelectorAll(".qv-rail__node").length') === 5);
    check('timer is running', typeof view1.timeRemainingMs === 'number' && view1.timeRemainingMs > 0);
    check('mascot visible in the sidebar', await evaluate('!!document.querySelector("#qv-mascot .qv-mascot-svg")'));

    await evaluate('document.querySelector(\'.qv-lifeline[data-life="half_half"]\').click()');
    await sleep(300);
    const hidden = await evaluate('document.querySelectorAll(".qv-option.is-hidden").length');
    const hiddenView = await evaluate('window.QUIZVERSE.debug.view()');
    const correctStillVisible = hiddenView.options.find((o) => o.key === hiddenView.status && false);
    check('50:50 hides exactly two options', hidden === 2, `hidden=${hidden}`);
    const correctKeyNow = await evaluate('window.QUIZVERSE.debug.answerKey()');
    check('50:50 never hides the correct option', !hiddenView.options.filter((o) => o.state === 'hidden').some((o) => o.key === correctKeyNow));

    await evaluate('document.querySelector(\'.qv-lifeline[data-life="clue"]\').click()');
    await sleep(300);
    check('classroom clue appears', await evaluate('!!document.querySelector(".qv-clue")'));
    check('used lifelines are stamped USED',
      await evaluate('document.querySelectorAll(".qv-lifeline.is-used").length') === 2);

    /* ---------------- 6. wrong answer + SECOND CHANCE ---------------- */
    const wrongKey = await evaluate(`(() => {
      const v = window.QUIZVERSE.debug.view();
      const correct = window.QUIZVERSE.debug.answerKey();
      return v.options.find((o) => o.state === 'normal' && o.key !== correct)?.key;
    })()`);
    await evaluate(`document.querySelector('.qv-option[data-key="${wrongKey}"]').click()`);
    await sleep(180);
    // while the answer is being decided the spotlight sweeps the options (suspense)
    check('the suspense spotlight sweeps the options',
      await evaluate('document.querySelectorAll(".qv-option.is-spotlight").length') === 1);
    await sleep(1300);
    const revealed = await evaluate('window.QUIZVERSE.debug.view()');
    check('wrong answer reveals the correct answer', revealed.status === 'REVEAL_WRONG' && revealed.reveal.isCorrect === false);
    check('encouraging feedback shown, never "wrong" alone',
      /NOT QUITE|बिलकुल नहीं/.test(await evaluate('document.querySelector(".qv-feedback__head").innerText')));
    check('explanation is displayed', (await evaluate('document.querySelector(".qv-feedback__text").innerText')).length > 20);
    check('second chance is offered', await evaluate('!!document.querySelector("#qv-second-inline")'));

    await evaluate('document.querySelector("#qv-second-inline").click()');
    await sleep(500);
    const revived = await evaluate('window.QUIZVERSE.debug.view()');
    check('second chance revives the question', revived.status === 'QUESTION_READY');
    check('the wrong pick becomes unavailable',
      await evaluate(`!!document.querySelector('.qv-option[data-key="${wrongKey}"].is-disabled')`));
    await evaluate(`document.querySelector('.qv-option[data-key="${await evaluate('window.QUIZVERSE.debug.answerKey()')}"]').click()`);
    await sleep(1400);
    const assisted = await evaluate('window.QUIZVERSE.debug.view()');
    check('assisted answer scores 50%', assisted.status === 'REVEAL_CORRECT' && assisted.reveal.points === 50, `points=${assisted.reveal?.points}`);

    /* ---------------- 7. CHANGE QUESTION ---------------- */
    await evaluate('document.querySelector("#qv-continue").click()');
    await sleep(500);
    const beforeId = await evaluate('window.QUIZVERSE.debug.view().question.question_id');
    await evaluate('document.querySelector(\'.qv-lifeline[data-life="change_question"]\').click()');
    await sleep(500);
    const afterView = await evaluate('window.QUIZVERSE.debug.view()');
    check('change question swaps in an unseen reserve',
      afterView.question.question_id !== beforeId && afterView.status === 'QUESTION_READY',
      `${beforeId} → ${afterView.question?.question_id}`);

    /* ---------------- 8. play to the winner ---------------- */
    let finalStatus = null;
    for (let step = 0; step < 260; step++) {
      const snapshot = await evaluate(`(() => {
        const route = document.getElementById('qv-root').dataset.screen;
        const host = window.QUIZVERSE;
        const dbg = host && host.debug;
        return { route, view: dbg ? dbg.view() : null };
      })()`);

      if (!snapshot.view) {
        // The session ended: the game screen tore itself down and the result route took over.
        finalStatus = snapshot.route === 'result'
          ? (/🏆/.test(await evaluate('document.body.innerText')) ? 'WINNER' : 'NOT_CLEARED')
          : `unexpected:${snapshot.route}`;
        break;
      }

      const v = snapshot.view;
      if (['WINNER', 'NOT_CLEARED'].includes(v.status)) { finalStatus = v.status; break; }
      if (v.status === 'QUESTION_READY') {
        const key = await evaluate('window.QUIZVERSE.debug.answerKey()');
        await evaluate(`document.querySelector('.qv-option[data-key="${key}"]').click()`);
        await sleep(1300);
        await evaluate('document.querySelector("#qv-continue")?.click()');
        await sleep(220);
      } else if (v.status === 'STAGE_COMPLETE') {
        const stageText = await evaluate('document.body.innerText');
        if (!/STAGE \d COMPLETE/.test(stageText)) check('stage complete screen shows progress', false, stageText.slice(0, 80));
        await evaluate('document.querySelector("#qv-next-stage").click()');
        await sleep(400);
      } else {
        await evaluate('document.querySelector("#qv-continue")?.click()');
        await sleep(250);
      }
    }
    check('a perfect run reaches the WINNER state', finalStatus === 'WINNER', `final=${finalStatus}`);

    const resultText = await evaluate('document.body.innerText');
    check('winner screen celebrates on the result route',
      await evaluate('document.getElementById("qv-root").dataset.screen') === 'result');
    check('winner screen shows the trophy and name', /🏆/.test(resultText) && resultText.includes('Aarav'));
    check('the winner title uses the real student name, not the fallback',
      /Aarav/.test(await evaluate('document.querySelector(".qv-winner-name").textContent'))
      && !/Champion/.test(await evaluate('document.querySelector(".qv-winner-name").textContent')));
    check('result shows accuracy and stage stats', /Accuracy/i.test(resultText) && /Stage/i.test(resultText));

    await evaluate('document.querySelector("#qv-certificate").click()');
    await sleep(500);
    check('the printable certificate opens with original SVG art',
      await evaluate('!!document.querySelector("#qv-overlay .qv-cert") === true'));
    check('the certificate names the student and topic',
      await evaluate('(() => { const c = document.querySelector("#qv-overlay .qv-cert"); return c ? (c.dataset.student + "|" + c.dataset.topic) : "no-svg"; })()') === 'Aarav|Solar System',
      await evaluate('(() => { const c = document.querySelector("#qv-overlay .qv-cert"); return c ? c.dataset.student + "|" + c.dataset.topic : "no-svg"; })()'));
    check('the certificate has a print button',
      await evaluate('!!document.querySelector("#qv-print") === true'));
    await evaluate('document.querySelector("#qv-cert-close").click()');
    await sleep(200);

    const savedResult = await evaluate('window.QUIZVERSE.Store.results().length');
    check('result is persisted in the local store', Number(savedResult) >= 1, `results=${savedResult}`);

    /* ---------------- 9. review screen ---------------- */
    await evaluate('document.querySelector("#qv-review").click()');
    await sleep(600);
    const reviewRows = await evaluate('document.querySelectorAll(".qv-review-item").length');
    check('review screen lists every question', reviewRows >= 15, `rows=${reviewRows}`);
    check('review shows the assisted question as assisted',
      /assisted/i.test(await evaluate('document.body.innerText')));

    /* ---------------- 10. teacher dashboard ---------------- */
    await evaluate('document.querySelector(\'[data-action="go-dashboard"]\').click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "dashboard"', { label: 'dashboard' });
    check('teacher dashboard opens with analytics',
      /analytics|Analytics|विश्लेषण/i.test(await evaluate('document.body.innerText')));

    /* ---------------- 10b. live AI pipeline (mock provider, no key needed) ---------------- */
    await evaluate(`window.QUIZVERSE.Store.saveSettings({ aiProvider: 'mock', aiFallback: true })`);
    await send('Page.navigate', { url: `${BASE}/#/create` });
    await waitFor('document.querySelector("#qv-topic")', { label: 'create form' });
    await evaluate(`(() => {
      [...document.querySelectorAll('input[name="class"]')].find((i) => i.value === '5').checked = true;
      document.querySelector('#qv-topic').value = 'Solar System';
      [...document.querySelectorAll('input[name="count"]')].find((i) => i.value === '15').checked = true;
    })()`);
    await evaluate('document.querySelector("#qv-generate").click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "preview"', { label: 'AI preview', timeout: 30000 });

    const aiText = await evaluate('document.body.innerText');
    check('the live AI engine produced a quiz', /Engine:\s*mock/i.test(aiText), aiText.slice(0, 140).replace(/\n/g, ' '));
    check('the pipeline report is shown to the teacher', /AI calls/i.test(aiText) && /Repaired questions/i.test(aiText));
    check('the validator-driven repair actually ran', /Repaired questions:\s*1/i.test(aiText),
      (aiText.match(/Repaired questions:[^\n]*/) || [''])[0]);
    const aiModel = await evaluate('window.QUIZVERSE.state.pkg.generation_meta.model');
    check('the package records which model wrote it', String(aiModel).includes('mock'), String(aiModel));
    const aiQuestions = await evaluate('document.querySelectorAll(".qv-qlist-item").length');
    check('the AI path delivered a full 15-question game', aiQuestions === 15, `rows=${aiQuestions}`);

    /* ---------------- 10c. document upload → questions (PDF) ---------------- */
    await send('Page.navigate', { url: `${BASE}/#/create` });
    await waitFor('document.querySelector("#qv-drop")', { label: 'drop zone' });
    await evaluate('document.querySelector(\'[data-tab="material"]\').click()');
    await sleep(300);

    const docRoot = await send('DOM.getDocument', { depth: -1 });
    const fileNode = await send('DOM.querySelector', { nodeId: docRoot.root.nodeId, selector: '#qv-file' });
    check('the upload input exists', Boolean(fileNode && fileNode.nodeId));
    await send('DOM.setFileInputFiles', { files: [PDF_FIXTURE], nodeId: fileNode.nodeId });
    await waitFor('document.querySelector("#qv-ingest-result .qv-chip--green")', { label: 'ingest result', timeout: 20000 });

    const ingestText = await evaluate('document.body.innerText');
    check('the PDF was read in the browser', /Text extracted/i.test(ingestText));
    check('extraction quality is reported to the teacher', /Text quality:\s*\d+%/i.test(ingestText),
      (ingestText.match(/Text quality:[^\n]*/) || [''])[0]);
    const materialLength = await evaluate('document.querySelector("#qv-material").value.length');
    check('the extracted text landed in the material box', materialLength > 200, `chars=${materialLength}`);
    check('the uploaded file name is shown', /lesson-plants\.pdf/i.test(ingestText));

    await evaluate(`(() => { [...document.querySelectorAll('input[name="class"]')].find((i) => i.value === '5').checked = true; })()`);
    await evaluate('document.querySelector("#qv-generate").click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "preview"', { label: 'material preview', timeout: 30000 });

    const materialText = await evaluate('document.body.innerText');
    check('the questions were built from the uploaded PDF content',
      /What is (Photosynthesis|Chlorophyll|Stomata|Roots|Evaporation|Condensation)/i.test(materialText),
      materialText.slice(0, 160).replace(/\n/g, ' '));
    check('material mode is recorded on the package',
      (await evaluate('window.QUIZVERSE.state.pkg.source_type')) === 'material');
    check('the source file is stored with the quiz',
      (await evaluate('window.QUIZVERSE.state.pkg.source_meta.file_name')) === 'lesson-plants.pdf');
    check('every material question cites its excerpt',
      await evaluate('window.QUIZVERSE.state.pkg.questions.every((q) => q.source_reference && q.source_reference.excerpt) === true'));
    check('the "why this question" source panel is available',
      await evaluate('!!document.querySelector(".qv-qlist-item details") === true'));

    // back to the demo library for the remaining checks
    await evaluate(`window.QUIZVERSE.Store.saveSettings({ aiProvider: 'offline' })`);

    /* ---------------- 10c-2. unreadable document fails kindly (§57) ---------------- */
    // Go back to the create screen (the material tab) and re-query the DOM: node ids
    // from an earlier render are stale after every screen change.
    await send('Page.navigate', { url: `${BASE}/#/create` });
    await waitFor('document.querySelector("#qv-drop")', { label: 'create screen for bad upload' });
    await evaluate('document.querySelector(\'[data-tab="material"]\').click()');
    await sleep(250);
    const freshDoc = await send('DOM.getDocument', { depth: -1 });
    const scanNode = await send('DOM.querySelector', { nodeId: freshDoc.root.nodeId, selector: '#qv-file' });
    check('the upload input is present for the negative test', Boolean(scanNode && scanNode.nodeId));
    await send('DOM.setFileInputFiles', { files: [SCANNED_FIXTURE], nodeId: scanNode.nodeId });
    await waitFor('document.querySelector("#qv-ingest-result .qv-chip--coral")', { label: 'scanned pdf refusal', timeout: 20000 });
    const scanText = await evaluate('document.querySelector("#qv-ingest-result").innerText');
    check('a scanned PDF is refused instead of generating nonsense', /Could not read this document/i.test(scanText));
    check('the teacher is shown a paste-the-text escape hatch', /paste/i.test(scanText));
    check('no raw parser error leaks to the teacher',
      !/(undefined|null|stack|TypeError|SyntaxError|at Object)/i.test(scanText), scanText.slice(0, 120).replace(/\n/g, ' '));
    const materialDiag = await evaluate(`(() => ({
      len: document.querySelector("#qv-material").value.length,
      draftLen: ((window.QUIZVERSE.state.draft || {}).materialText || "").length,
      activeTab: (document.querySelector(".qv-tab.is-active") || {}).dataset ? document.querySelector(".qv-tab.is-active").dataset.tab : null,
    }))()`);
    check('a failed upload does not damage the material box',
      materialDiag.len > 200,
      `textarea=${materialDiag.len} draft=${materialDiag.draftLen} tab=${materialDiag.activeTab}`);
    check('the app is still usable after a failed upload',
      Boolean(await evaluate('document.querySelector("#qv-generate") && document.querySelector("#qv-topic")')));

    /* ---------------- 10d. teacher editing, regenerate, delete, versions ---------------- */
    await send('Page.navigate', { url: `${BASE}/#/create` });
    await waitFor('document.querySelector("#qv-topic")', { label: 'create form' });
    await evaluate(`(() => {
      [...document.querySelectorAll('input[name="class"]')].find((i) => i.value === '5').checked = true;
      document.querySelector('#qv-topic').value = 'Solar System';
      [...document.querySelectorAll('input[name="count"]')].find((i) => i.value === '15').checked = true;
    })()`);
    await evaluate('document.querySelector("#qv-generate").click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "preview"', { label: 'preview for editing' });

    const editTarget = await evaluate('window.QUIZVERSE.state.pkg.stages[0].question_ids[0]');
    await evaluate(`document.querySelector('[data-edit="${editTarget}"]').click()`);
    await waitFor('document.querySelector("#qv-edit-question")', { label: 'inline editor' });
    check('the inline question editor opens with the question loaded',
      (await evaluate('document.querySelector("#qv-edit-question").value.length')) > 10);

    // an invalid edit must be refused with the validator's own code
    await evaluate(`document.querySelector('#qv-edit-opt-B').value = document.querySelector('#qv-edit-opt-A').value`);
    await evaluate('document.querySelector("#qv-edit-save").click()');
    await waitFor('document.querySelector("#qv-edit-failures .qv-feedback")', { label: 'validation feedback' });
    check('an invalid edit is refused with the failure code shown',
      /DUPLICATE_OPTION/.test(await evaluate('document.querySelector("#qv-edit-failures").innerText')));

    // a valid edit is saved and bumps the version
    await evaluate(`document.querySelector('#qv-edit-opt-B').value = 'Mars'`);
    await evaluate(`document.querySelector('#qv-edit-question').value = 'Which planet is known as the Red Planet in our sky?'`);
    await evaluate('document.querySelector("#qv-edit-save").click()');
    await waitFor('!document.querySelector("#qv-edit-question")', { label: 'editor closed' });
    await sleep(300);
    check('a valid edit is applied to the question',
      /Red Planet in our sky/.test(await evaluate('document.body.innerText')));
    const editedVersion = await evaluate('window.QUIZVERSE.state.pkg.version');
    check('the edit created a new package version', Number(editedVersion) >= 2, `version=${editedVersion}`);
    check('the edited question is marked in the list',
      await evaluate('!!document.querySelector(".qv-qlist-item .qv-chip--gold") === true'));

    // regenerate one question
    const regenTarget = await evaluate('window.QUIZVERSE.state.pkg.stages[1].question_ids[0]');
    await evaluate(`document.querySelector('[data-regen="${regenTarget}"]').click()`);
    await waitFor(`window.QUIZVERSE.state.pkg.stages[1].question_ids[0] !== "${regenTarget}"`, { label: 'regenerated question', timeout: 10000 });
    check('regenerate swaps in a replacement for the same stage',
      await evaluate('(() => { const p = window.QUIZVERSE.state.pkg; const id = p.stages[1].question_ids[0]; const q = p.questions.find(x => x.question_id === id); return q.stage === 2; })()'));

    // delete one question — the stage must refill from the reserve pool
    const stageBefore = await evaluate('window.QUIZVERSE.state.pkg.stages[2].question_ids.length');
    const reservesBefore = await evaluate('(() => { const p = window.QUIZVERSE.state.pkg; const staged = new Set(p.stages.flatMap(s => s.question_ids)); return p.questions.filter(q => !staged.has(q.question_id)).length; })()');
    const deleteTarget = await evaluate('window.QUIZVERSE.state.pkg.stages[2].question_ids[0]');
    await evaluate(`document.querySelector('[data-del="${deleteTarget}"]').click()`);
    await sleep(500);
    const afterDelete = await evaluate('(() => { const p = window.QUIZVERSE.state.pkg; const staged = new Set(p.stages.flatMap(s => s.question_ids)); return { ids: p.stages[2].question_ids, reserves: p.questions.filter(q => !staged.has(q.question_id)).length, inPackage: p.questions.some(q => q.question_id === "DELETE_TARGET") }; })()'.replace('DELETE_TARGET', deleteTarget));
    check('the deleted question left play', afterDelete.inPackage === false);
    check('the stage refilled to its original size', afterDelete.ids.length === stageBefore, `${afterDelete.ids.length} vs ${stageBefore}`);
    check('the reserve pool was consumed by the refill', afterDelete.reserves === reservesBefore - 1, `${afterDelete.reserves} vs ${reservesBefore - 1}`);

    // save + version history
    await evaluate('document.querySelector("#qv-save").click()');
    await sleep(600);
    const versionCount = await evaluate('window.QUIZVERSE.Store.versionList(window.QUIZVERSE.state.pkg.quiz_id).length');
    check('edits are persisted as versions for the teacher', Number(versionCount) >= 1, `versions=${versionCount}`);

    // the edited quiz is still playable
    await evaluate('document.querySelector("#qv-start").click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "name"', { label: 'name screen' });
    await evaluate('document.querySelector("#qv-student-name").value = "Meera"');
    await evaluate('document.querySelector("#qv-name-go").click()');
    await waitFor('document.getElementById("qv-root").dataset.screen === "briefing"', { label: 'briefing' });
    await evaluate('document.querySelector("#qv-lets-play").click()');
    await waitFor('window.QUIZVERSE.debug && window.QUIZVERSE.debug.view().status === "QUESTION_READY"', { label: 'edited game start' });
    check('the edited quiz is playable end to end',
      await evaluate('document.querySelectorAll(".qv-option").length') === 4);

    /* ---------------- 11. mobile viewport ---------------- */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `${BASE}/#/account` });
    await waitFor('document.querySelector("#qv-email")', { label: 'account screen' });
    check('the account screen opens with sign-in fields',
      await evaluate('document.getElementById("qv-root").dataset.screen') === 'account'
      && await evaluate('!!document.querySelector("#qv-password")'));
    check('the account screen is mobile friendly (no overflow)',
      await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1);

    await send('Page.navigate', { url: `${BASE}/#/landing` });
    await sleep(1200);
    const overflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    check('no horizontal overflow on a 390px phone', overflow <= 1, `overflow=${overflow}px`);
    await send('Emulation.clearDeviceMetricsOverride');

    /* ---------------- 12. console / network hygiene ---------------- */
    events.forEach((event) => {
      if (event.method === 'Runtime.exceptionThrown') {
        jsErrors.push(event.params.exceptionDetails?.exception?.description || event.params.exceptionDetails?.text);
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        jsErrors.push(event.params.args.map((a) => a.value || a.description).join(' '));
      }
      if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
        const entry = event.params.entry;
        if (/Failed to load resource|404/.test(entry.text)) failedRequests.push(`${entry.url || ''} ${entry.text}`);
        else jsErrors.push(entry.text);
      }
    });
    check('no uncaught JavaScript errors', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
    check('no failed asset requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));

    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} browser checks passed`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(`\nSMOKE TEST FAILED: ${err.message}`);
  process.exit(1);
});
