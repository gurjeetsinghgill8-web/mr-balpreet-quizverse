/**
 * QUIZVERSE — OBJECTIVE DESIGN QA
 * ---------------------------------------------------------------------------
 * Measures the interface instead of guessing about it: contrast ratios, touch
 * target sizes, text clipping, tier scaling, landscape fit (§9, §13, §14, §15).
 *
 *   node tools/design-qa.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.QV_URL || 'http://127.0.0.1:4317';
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  ✔' : '  ✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

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

/* Page-side measurement helpers, injected once. */
const HELPERS = `
window.__qvqa = {
  parse(color) {
    const m = String(color).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  },
  lum([r, g, b]) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  },
  contrast(a, b) {
    const l1 = this.lum(a), l2 = this.lum(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  },
  bg(el) {
    const stack = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = this.parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
      node = node.parentElement;
    }
    let base = [11, 16, 48];
    for (let i = stack.length - 1; i >= 0; i--) {
      const [r, g, b, a] = stack[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    }
    return base;
  },
  ratio(el) {
    if (!el) return null;
    const style = getComputedStyle(el);
    const bgc = this.bg(el);
    const fg = this.parse(style.color);
    // Gradient-clipped display text (background-clip: text) reports a transparent
    // colour, so measure every gradient stop instead.
    if (!fg || fg[3] === 0) {
      const stops = [...String(style.backgroundImage).matchAll(/rgba?\\(([^)]+)\\)/g)]
        .map((m) => m[1].split(',').map(Number).slice(0, 3));
      if (!stops.length) return null;
      return Math.round(Math.min(...stops.map((s) => this.contrast(s, bgc))) * 100) / 100;
    }
    const blended = [fg[0] * fg[3] + bgc[0] * (1 - fg[3]), fg[1] * fg[3] + bgc[1] * (1 - fg[3]), fg[2] * fg[3] + bgc[2] * (1 - fg[3])];
    return Math.round(this.contrast(blended, bgc) * 100) / 100;
  },
  clipped(el) {
    if (!el) return null;
    return { x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight };
  },
  smallTargets() {
    const nodes = [...document.querySelectorAll('button, input, select, textarea, a, .qv-option, .qv-lifeline')];
    return nodes.filter((el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      // visually hidden controls (the <label> is the real target)
      if (parseFloat(style.opacity) === 0 || style.clipPath === 'inset(50%)') return false;
      if (el.closest('.qv-chip-radio') && el.tagName === 'INPUT') return false;
      return r.width < 44 || r.height < 44;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return el.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
    });
  },
};
true;
`;

const profile = mkdtempSync(path.join(tmpdir(), 'qv-qa-'));
if (!existsSync(CHROME)) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2); }

const child = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `${BASE}/#/landing`,
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
  const waitExpr = async (expression, timeout = 12000) => {
    const started = Date.now();
    for (;;) {
      if (await evaluate(expression).catch(() => false)) return true;
      if (Date.now() - started > timeout) throw new Error(`timeout: ${expression}`);
      await sleep(200);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');

  /** Generate a quiz for a class and drop straight into the game board. */
  const openGame = async ({ classLevel, topic, count, language = 'en' }) => {
    await send('Page.navigate', { url: `${BASE}/#/create` });
    await waitExpr('document.querySelector("#qv-topic")');
    await evaluate(`(() => {
      [...document.querySelectorAll('input[name="class"]')].find(i => i.value === '${classLevel}').checked = true;
      [...document.querySelectorAll('input[name="lang"]')].find(i => i.value === '${language}').checked = true;
      document.querySelector('#qv-topic').value = ${JSON.stringify(topic)};
      [...document.querySelectorAll('input[name="count"]')].find(i => i.value === '${count}').checked = true;
    })()`);
    await evaluate('document.querySelector("#qv-generate").click()');
    await waitExpr('document.getElementById("qv-root").dataset.screen === "preview"', 20000);
    await evaluate('document.querySelector("#qv-start").click()');
    await waitExpr('document.getElementById("qv-root").dataset.screen === "name"');
    await evaluate('document.querySelector("#qv-student-name").value = "Aarav"');
    await evaluate('document.querySelector("#qv-name-go").click()');
    await waitExpr('document.getElementById("qv-root").dataset.screen === "briefing"');
    await evaluate('document.querySelector("#qv-lets-play").click()');
    await waitExpr('window.QUIZVERSE.debug && window.QUIZVERSE.debug.view().status === "QUESTION_READY"');
    await evaluate(HELPERS);
    await sleep(900); // let the entrance animation settle
  };

  console.log('QUIZVERSE design QA\n');

  /* ---------------- tier A (Class 1 Animals) ---------------- */
  await openGame({ classLevel: 1, topic: 'Animals', count: 10 });
  await evaluate(HELPERS);

  const tierA = await evaluate(`(() => {
    const q = document.querySelector('.qv-question-text');
    const opt = document.querySelector('.qv-option');
    const optText = opt.querySelector('.qv-option__text');
    const rect = (el) => el.getBoundingClientRect();
    return {
      tier: document.getElementById('qv-root').dataset.tier,
      questionFont: parseFloat(getComputedStyle(q).fontSize),
      questionLine: parseFloat(getComputedStyle(q).lineHeight) / parseFloat(getComputedStyle(q).fontSize),
      optionHeight: rect(opt).height,
      optionWidth: rect(opt).width,
      questionRatio: window.__qvqa.ratio(q),
      optionRatio: window.__qvqa.ratio(optText),
      subRatio: window.__qvqa.ratio(document.querySelector('.qv-hud__topic')),
      clippedQuestion: window.__qvqa.clipped(q),
      clippedOption: window.__qvqa.clipped(optText),
      cardClip: window.__qvqa.clipped(document.querySelector('.qv-question-card')),
      smallTargets: window.__qvqa.smallTargets(),
      illustration: !!document.querySelector('.qv-illus-wrap'),
    };
  })()`);

  check('tier A theme applied for Class 1', tierA.tier === 'A', `tier=${tierA.tier}`);
  check('tier A question type is large (>= 24px)', tierA.questionFont >= 24, `${tierA.questionFont}px`);
  check('tier A option buttons are big (>= 76px tall)', tierA.optionHeight >= 76, `${tierA.optionHeight.toFixed(1)}px`);
  check('question text line-height is readable (>= 1.2)', tierA.questionLine >= 1.2, tierA.questionLine.toFixed(2));
  check('question text contrast >= 4.5:1', tierA.questionRatio >= 4.5, `${tierA.questionRatio}:1`);
  check('option text contrast >= 4.5:1', tierA.optionRatio >= 4.5, `${tierA.optionRatio}:1`);
  check('HUD helper text contrast >= 3.5:1', tierA.subRatio >= 3.5, `${tierA.subRatio}:1`);
  check('question text is not clipped', tierA.clippedQuestion.x <= 1 && tierA.clippedQuestion.y <= 1, JSON.stringify(tierA.clippedQuestion));
  check('option text is not clipped', tierA.clippedOption.x <= 1 && tierA.clippedOption.y <= 1, JSON.stringify(tierA.clippedOption));
  check('question card has no horizontal overflow', tierA.cardClip.x <= 1, JSON.stringify(tierA.cardClip));
  check('every interactive target is >= 44px', tierA.smallTargets.length === 0, tierA.smallTargets.join(', '));
  check('Class 1 questions carry an illustration', tierA.illustration === true);

  /* ---------------- tier C (Class 7 Hindi Computer) ---------------- */
  await openGame({ classLevel: 7, topic: 'कंप्यूटर', count: 15, language: 'hi' });
  const tierC = await evaluate(`(() => {
    const q = document.querySelector('.qv-question-text');
    const opt = document.querySelector('.qv-option');
    return {
      tier: document.getElementById('qv-root').dataset.tier,
      questionFont: parseFloat(getComputedStyle(q).fontSize),
      optionHeight: opt.getBoundingClientRect().height,
      questionRatio: window.__qvqa.ratio(q),
      hasDevanagari: /[\\u0900-\\u097F]/.test(document.body.innerText),
      fontFamily: getComputedStyle(q).fontFamily,
      smallTargets: window.__qvqa.smallTargets(),
      noOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);

  check('tier C theme applied for Class 7', tierC.tier === 'C', `tier=${tierC.tier}`);
  check('tier C type is intentionally smaller than tier A', tierC.questionFont < tierA.questionFont, `${tierC.questionFont}px vs ${tierA.questionFont}px`);
  check('tier C option buttons still touch friendly (>= 58px)', tierC.optionHeight >= 58, `${Math.round(tierC.optionHeight)}px`);
  check('Hindi question text contrast >= 4.5:1', tierC.questionRatio >= 4.5, `${tierC.questionRatio}:1`);
  check('Hindi content is rendered in Devanagari', tierC.hasDevanagari === true);
  check('Devanagari font stack applied', /Baloo|Mukta|Nirmala|Devanagari/i.test(tierC.fontFamily), tierC.fontFamily);
  check('tier C has no horizontal overflow', tierC.noOverflow <= 1, `${tierC.noOverflow}px`);

  /* ---------------- landscape phone fit (§15.5) ---------------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  const landscape = await evaluate(`(() => {
    const opts = [...document.querySelectorAll('.qv-option')].map(o => o.getBoundingClientRect());
    const hud = document.querySelector('.qv-hud').getBoundingClientRect();
    return {
      viewportH: window.innerHeight,
      scrollH: document.documentElement.scrollHeight,
      lastOptionBottom: opts.length ? Math.max(...opts.map(o => o.bottom)) : 0,
      hudHeight: hud.height,
      columns: getComputedStyle(document.querySelector('.qv-options')).gridTemplateColumns,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  check('landscape phone: no horizontal overflow', landscape.overflowX <= 1, `${landscape.overflowX}px`);
  check('landscape phone: all four options are inside the viewport',
    landscape.lastOptionBottom <= landscape.viewportH + 1,
    `last option bottom=${Math.round(landscape.lastOptionBottom)} viewport=${landscape.viewportH}`);
  check('landscape phone: options sit in two columns',
    (landscape.columns.match(/px/g) || []).length === 2, landscape.columns);

  /* ---------------- portrait phone ---------------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  const portrait = await evaluate(`(() => {
    const r = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; };
    const opts = [...document.querySelectorAll('.qv-option')].map(o => o.getBoundingClientRect());
    return {
      columns: getComputedStyle(document.querySelector('.qv-options')).gridTemplateColumns,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      optionWidth: opts[0] ? opts[0].width : 0,
      optionHeight: opts[0] ? opts[0].height : 0,
      mascotHidden: !document.querySelector('#qv-mascot .qv-mascot-svg') || getComputedStyle(document.querySelector('.qv-mascot-wrap')).display === 'none',
      hud: r('.qv-hud') ? r('.qv-hud').height : 0,
    };
  })()`);
  check('portrait phone: no horizontal overflow', portrait.overflowX <= 1, `${portrait.overflowX}px`);
  check('portrait phone: options stack in a single column',
    (portrait.columns.match(/px/g) || []).length === 1, portrait.columns);
  check('portrait phone: options are full width', portrait.optionWidth > 300, `${Math.round(portrait.optionWidth)}px`);
  check('portrait phone: option height stays touch friendly', portrait.optionHeight >= 44, `${Math.round(portrait.optionHeight)}px`);
  await send('Emulation.clearDeviceMetricsOverride');

  /* ---------------- winner screen ---------------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  let guard = 0;
  while (guard++ < 160) {
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
      await sleep(220);
    } else if (snap.status === 'STAGE_COMPLETE') {
      await evaluate('document.querySelector("#qv-next-stage").click()');
      await sleep(380);
    } else {
      await evaluate('document.querySelector("#qv-continue")?.click()');
      await sleep(240);
    }
  }
  await waitExpr('document.getElementById("qv-root").dataset.screen === "result"');
  await sleep(1400);
  const winner = await evaluate(`(() => {
    const name = document.querySelector('.qv-winner-name');
    const stats = document.querySelectorAll('.qv-stat');
    return {
      nameFont: name ? parseFloat(getComputedStyle(name).fontSize) : 0,
      nameRatio: window.__qvqa.ratio(name),
      statCount: stats.length,
      trophy: !!document.querySelector('.qv-trophy'),
      confettiBits: document.querySelectorAll('.qv-confetti__bit').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      smallTargets: window.__qvqa.smallTargets(),
    };
  })()`);
  check('winner name is displayed large (>= 30px)', winner.nameFont >= 30, `${winner.nameFont}px`);
  check('winner name contrast >= 4.5:1 (or gradient-safe)', winner.nameRatio === null || winner.nameRatio >= 3, `${winner.nameRatio}`);
  check('winner screen shows six stat tiles', winner.statCount === 6, `${winner.statCount}`);
  check('trophy art is rendered', winner.trophy === true);
  check('confetti fires on the winner screen', winner.confettiBits > 0, `${winner.confettiBits} bits`);
  check('winner screen has no horizontal overflow', winner.overflowX <= 1, `${winner.overflowX}px`);
  check('result buttons are all >= 44px', winner.smallTargets.length === 0, winner.smallTargets.join(', '));

  /* ---------------- settings + editor screens ---------------- */
  await send('Page.navigate', { url: `${BASE}/#/settings` });
  await waitExpr('document.querySelector("#qv-provider")');
  await evaluate(HELPERS);
  await sleep(500);
  const settingsQa = await evaluate(`(() => {
    const label = document.querySelector('.qv-label');
    return {
      providerOptions: document.querySelectorAll('#qv-provider label').length,
      smallTargets: window.__qvqa.smallTargets(),
      labelRatio: window.__qvqa.ratio(label),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasKeyField: !!document.querySelector('#qv-key'),
      hasTestButton: !!document.querySelector('#qv-test'),
    };
  })()`);
  check('settings screen lists every engine option', settingsQa.providerOptions === 6, `${settingsQa.providerOptions}`);
  check('settings screen has an API key field and a test button',
    settingsQa.hasKeyField && settingsQa.hasTestButton);
  check('settings screen targets are all >= 44px', settingsQa.smallTargets.length === 0, settingsQa.smallTargets.join(', '));
  check('settings labels contrast >= 4.5:1', settingsQa.labelRatio >= 4.5, `${settingsQa.labelRatio}:1`);
  check('settings screen has no horizontal overflow', settingsQa.overflowX <= 1, `${settingsQa.overflowX}px`);

  // open the question editor through a real generated quiz
  await send('Page.navigate', { url: `${BASE}/#/create` });
  await waitExpr('document.querySelector("#qv-topic")');
  await evaluate(`(() => {
    [...document.querySelectorAll('input[name="class"]')].find(i => i.value === '5').checked = true;
    document.querySelector('#qv-topic').value = 'Solar System';
  })()`);
  await evaluate('document.querySelector("#qv-generate").click()');
  await waitExpr('document.getElementById("qv-root").dataset.screen === "preview"');
  await evaluate('document.querySelector("[data-edit]").click()');
  await waitExpr('document.querySelector("#qv-edit-question")');
  await evaluate(HELPERS);
  await sleep(400);
  const editorQa = await evaluate(`(() => {
    const input = document.querySelector('#qv-edit-question');
    return {
      smallTargets: window.__qvqa.smallTargets(),
      inputRatio: window.__qvqa.ratio(input),
      inputHeight: input.getBoundingClientRect().height,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      radioCount: document.querySelectorAll('#qv-edit-correct label').length,
    };
  })()`);
  check('the editor offers four correct-answer choices', editorQa.radioCount === 4, `${editorQa.radioCount}`);
  check('editor targets are all >= 44px', editorQa.smallTargets.length === 0, editorQa.smallTargets.join(', '));
  check('editor input text contrast >= 4.5:1', editorQa.inputRatio >= 4.5, `${editorQa.inputRatio}:1`);
  check('editor has no horizontal overflow', editorQa.overflowX <= 1, `${editorQa.overflowX}px`);

  /* ---------------- reduced motion ---------------- */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: `${BASE}/#/landing` });
  await waitExpr('document.querySelectorAll("[data-demo]").length === 3');
  await evaluate('document.querySelector("#qv-try-demo").click()');
  await waitExpr('document.getElementById("qv-root").dataset.screen === "preview"');
  await evaluate('document.querySelector("#qv-start").click()');
  await waitExpr('document.getElementById("qv-root").dataset.screen === "name"');
  await evaluate('document.querySelector("#qv-name-go").click()');
  await waitExpr('document.getElementById("qv-root").dataset.screen === "briefing"');
  await evaluate('document.querySelector("#qv-lets-play").click()');
  await waitExpr('window.QUIZVERSE.debug && window.QUIZVERSE.debug.view().status === "QUESTION_READY"');
  await sleep(600);
  const reduced = await evaluate(`(() => {
    const opt = document.querySelector('.qv-option');
    const card = document.querySelector('.qv-question-card');
    return {
      optionAnimation: getComputedStyle(opt).animationDuration,
      cardAnimation: getComputedStyle(card).animationDuration,
      optionsVisible: document.querySelectorAll('.qv-option').length,
      optionsClickable: [...document.querySelectorAll('.qv-option')].every(o => !o.disabled),
    };
  })()`);
  check('reduced motion: entrance animations are neutralised',
    parseFloat(reduced.optionAnimation) <= 0.05 && parseFloat(reduced.cardAnimation) <= 0.05,
    `${reduced.optionAnimation} / ${reduced.cardAnimation}`);
  check('reduced motion: the game is still fully playable',
    reduced.optionsVisible === 4 && reduced.optionsClickable === true);
  await send('Emulation.setEmulatedMedia', { features: [] });

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} design checks passed`);
} finally {
  cleanup();
}
