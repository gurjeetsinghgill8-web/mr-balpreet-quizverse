/**
 * QUIZVERSE — STUDENT GAME FLOW (Screens S5–S11)
 * ---------------------------------------------------------------------------
 * Wires the pure game engine (Layer 2) to the game-show interface (Layer 3).
 * The emotional loop lives here: select → suspense → reveal → reward → progress.
 */

import { t } from '../i18n.js';
import { esc, $, confetti, burst, toast, tierFor, fmtTime, prefersReducedMotion } from '../ui.js';
import { Store } from '../store.js';
import { Sound } from '../audio.js';
import { createGame } from '../../packages/game-engine/engine.js';
import { illustrationSVG } from '../illustrations.js';
import { quizoSVG, mascotLine as pickMascotLine } from '../mascot.js';

/* ------------------------------------------------------------------ */
/* session state                                                       */
/* ------------------------------------------------------------------ */

let S = null;

export function hasSession() { return !!S; }
export function setStudent(name) { if (S) S.student = name; }

export function startSession(ctx, pkg, student = '') {
  const tier = tierFor(pkg.class_level);
  document.getElementById('qv-root').setAttribute('data-tier', tier);
  S = {
    pkg,
    student: student || t('name.placeholder'),
    tier,
    engine: createGame(pkg),
    suspended: false,
    timerId: null,
    suspenseId: null,
    spotlightId: null,
    tickSecond: -1,
    lastRemaining: null,
    lastRevealed: null,
  };
  // Device sound settings always win over quiz defaults (§11.3).
  const device = Store.settings();
  Sound.apply({ sound: device.sound, music: device.music, effects: device.effects, volume: device.volume });
  return S;
}

export function mascotLine(key, arg) {
  const lang = S && S.pkg && S.pkg.language === 'hi' ? 'hi' : 'en';
  return pickMascotLine(key, arg, lang, S ? S.student : '');
}

function stopTimers() {
  if (!S) return;
  if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
  if (S.suspenseId) { clearTimeout(S.suspenseId); S.suspenseId = null; }
  if (S.spotlightId) { clearInterval(S.spotlightId); S.spotlightId = null; }
  Sound.stopSuspense();
}

/* ------------------------------------------------------------------ */
/* S5 — student name                                                   */
/* ------------------------------------------------------------------ */

export function nameScreen(ctx) {
  const pkg = ctx.state.pkg;
  const tier = tierFor(pkg.class_level);
  document.getElementById('qv-root').setAttribute('data-tier', tier);

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header({ compact: true })}
    <div class="qv-card qv-card--hero qv-center" style="margin:auto;max-width:620px;width:100%">
      <div style="display:grid;place-items:center;gap:18px">
        ${quizoSVG('welcome', 150)}
        <h1 class="qv-h1 qv-gradient-text">${esc(t('name.title'))}</h1>
        <p class="qv-sub">${esc(pkg.title)} · ${esc(t('create.class'))} ${esc(pkg.class_level)}</p>
        <div class="qv-field" style="width:min(420px,90%)">
          <label class="qv-label" for="qv-student-name">${esc(t('name.placeholder'))}</label>
          <input id="qv-student-name" class="qv-input qv-center" maxlength="20" autocomplete="off"
                 placeholder="${esc(t('name.placeholder'))}" value="${esc(ctx.state.lastStudent || '')}">
        </div>
        <div class="qv-row" style="justify-content:center">
          <button class="qv-btn qv-btn--primary qv-btn--lg" id="qv-name-go">🚀 ${esc(t('name.start'))}</button>
          <button class="qv-btn qv-btn--ghost" id="qv-name-back">${esc(t('create.back'))}</button>
        </div>
        <p class="qv-small qv-muted">👤 ${esc(t('name.skip'))} — first name or nickname only. No account needed.</p>
      </div>
    </div>
  </div>`;

  const input = $('#qv-student-name', ctx.root);
  input.focus();

  const submit = () => {
    Sound.play('button');
    const raw = input.value.trim().slice(0, 20);
    const safeName = raw.replace(/[<>]/g, '') || 'Champion';
    ctx.state.lastStudent = safeName;
    startSession(ctx, pkg, safeName);
    ctx.go('briefing');
  };

  $('#qv-name-go', ctx.root).onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $('#qv-name-back', ctx.root).onclick = () => { Sound.play('button'); ctx.go('landing'); };
  return null;
}

/* ------------------------------------------------------------------ */
/* S6 — mission briefing                                               */
/* ------------------------------------------------------------------ */

export function briefing(ctx) {
  if (!S) return ctx.go('create');
  const pkg = S.pkg;
  const ll = pkg.settings.lifelines;
  const names = {
    half_half: t('life.half_half'),
    clue: t('life.clue'),
    second_chance: t('life.second_chance'),
    change_question: t('life.change_question'),
  };

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen" style="justify-content:center">
    <div class="qv-card qv-card--hero qv-center" style="margin:auto;max-width:880px;width:100%">
      <div style="display:grid;place-items:center;gap:16px">
        <span class="qv-chip qv-chip--gold">${esc(t('game.stage'))} 1 / 5</span>
        <h1 class="qv-h1 qv-gradient-text">${esc(t('briefing.title'))}</h1>
        <p class="qv-sub" style="font-size:clamp(15px,1.7vw,20px)">
          ${esc(t('briefing.mission', { name: S.student }))}<br>${esc(t('briefing.tip'))}
        </p>
        <div class="qv-row" style="justify-content:center">
          <span class="qv-chip">${esc(pkg.title)}</span>
          <span class="qv-chip qv-chip--cyan">${esc(t('create.class'))} ${esc(pkg.class_level)}</span>
          ${pkg.settings.timer_seconds
            ? `<span class="qv-chip">⏱ ${esc(String(pkg.settings.timer_seconds))}s</span>`
            : `<span class="qv-chip">${esc(t('stage.noTimer'))}</span>`}
        </div>
        <div class="qv-grid qv-grid--3" style="width:100%;margin-top:6px">
          ${Object.entries(names).map(([key, label]) => ll[key]
            ? `<div class="qv-card qv-card--flat qv-center" style="padding:14px">
                 <div style="font-size:24px">${{ half_half: '➗', clue: '💡', second_chance: '🔄', change_question: '🔀' }[key]}</div>
                 <div style="font-weight:700;margin-top:6px">${esc(label)}</div>
               </div>`
            : '').join('')}
        </div>
        <div class="qv-row" style="justify-content:center;margin-top:10px">
          <button class="qv-btn qv-btn--primary qv-btn--lg" id="qv-lets-play">${esc(t('briefing.letsPlay'))} →</button>
          <button class="qv-btn qv-btn--ghost" id="qv-brief-back">${esc(t('create.back'))}</button>
        </div>
        <div class="qv-mascot-wrap" style="margin-top:4px">
          ${quizoSVG('welcome', 120)}
          <div class="qv-speech">${esc(mascotLine('welcome'))}</div>
        </div>
      </div>
    </div>
  </div>`;

  $('#qv-lets-play', ctx.root).onclick = () => {
    Sound.unlock();
    Sound.play('intro'); // the show is starting
    ctx.go('game');
  };
  $('#qv-brief-back', ctx.root).onclick = () => { Sound.play('button'); ctx.go('name'); };
  return null;
}

/* ------------------------------------------------------------------ */
/* S7 — the game board                                                 */
/* ------------------------------------------------------------------ */

const icons = { half_half: '➗', clue: '💡', second_chance: '🔄', change_question: '🔀' };
const lifeKeys = { half_half: 'life.half_half', clue: 'life.clue', second_chance: 'life.second_chance', change_question: 'life.change_question' };

export function play(ctx) {
  if (!S) return ctx.go('create');
  document.getElementById('qv-root').setAttribute('data-tier', S.tier);
  const pkg = S.pkg;
  const suspenseMs = S.tier === 'A' ? 1000 : S.tier === 'C' ? 700 : 850;

  ctx.root.innerHTML = `
  <div class="qv-shell qv-shell--game qv-screen">
    <div id="qv-hud" class="qv-hud"></div>
    <div class="qv-board">
      <div id="qv-question" class="qv-question-card"></div>
      <aside class="qv-side">
        <div>
          <div class="qv-label" style="margin-bottom:8px">${esc(t('create.lifelines'))}</div>
          <div id="qv-lifelines" class="qv-lifelines"></div>
        </div>
        <div id="qv-mascot" class="qv-mascot-wrap">
          ${quizoSVG('idle', 130)}
          <div class="qv-speech">${esc(mascotLine('thinking'))}</div>
        </div>
      </aside>
    </div>
    <div id="qv-live" class="qv-small qv-muted" aria-live="polite"></div>
  </div>`;

  const engine = S.engine;
  if (!S.started) { engine.start(); S.started = true; }

  const hudEl = $('#qv-hud', ctx.root);
  const qEl = $('#qv-question', ctx.root);
  const lifeEl = $('#qv-lifelines', ctx.root);
  const mascotEl = $('#qv-mascot', ctx.root);
  const liveEl = $('#qv-live', ctx.root);

  function setMascot(expression, line) {
    if (!pkg.settings.mascot) return;
    mascotEl.innerHTML = `${quizoSVG(expression, 130)}<div class="qv-speech">${esc(line || '')}</div>`;
  }

  function renderHud() {
    const v = engine.getView();
    const total = v.timerSeconds;
    const rawRemaining = v.timeRemainingMs;
    if (rawRemaining !== null) S.lastRemaining = rawRemaining;
    const remaining = rawRemaining !== null ? rawRemaining : (S.lastRemaining ?? 0);
    const ratio = total ? Math.max(0, Math.min(1, remaining / (total * 1000))) : 0;
    const C = 2 * Math.PI * 24;
    const warn = !!total && remaining <= total * 1000 * 0.34;
    const critical = !!total && remaining <= 5200;
    const soundOn = Store.settings().sound;

    hudEl.innerHTML = `
      <div class="qv-brand__mark" aria-hidden="true">Q</div>
      <div class="qv-hud__meta">
        <div class="qv-hud__student">${esc(S.student)}</div>
        <div class="qv-hud__topic">${esc(pkg.title)}</div>
      </div>
      <div class="qv-rail" role="img" aria-label="${esc(t('game.stage'))} ${v.stageNumber} / ${v.stageCount}">
        ${v.rail.map((r, i) => `
          <span class="qv-rail__node ${r.cleared ? 'is-cleared' : ''} ${r.current ? 'is-current' : ''} ${r.locked ? 'is-locked' : ''}"
                title="${esc(r.name)}">${r.cleared ? '★' : r.stage}</span>
          ${i < v.rail.length - 1 ? `<span class="qv-rail__bar ${r.cleared ? 'is-cleared' : ''}"></span>` : ''}
        `).join('')}
      </div>
      <span class="qv-chip qv-chip--cyan">${esc(v.stageName)}</span>
      <span class="qv-chip qv-small">${esc(t('game.question'))} ${v.questionInStage} / ${v.questionsInStage}</span>
      <div class="qv-spacer"></div>
      <div class="qv-hud__meta" style="text-align:right">
        <div class="qv-label">${esc(t('game.score'))}</div>
        <div class="qv-score" id="qv-score">${v.score}</div>
      </div>
      ${total ? `
      <div class="qv-timer ${critical ? 'is-critical' : warn ? 'is-warning' : ''}" id="qv-timer">
        <svg width="58" height="58" viewBox="0 0 58 58">
          <circle class="qv-timer__track" cx="29" cy="29" r="24" fill="none" stroke-width="5"/>
          <circle class="qv-timer__value" cx="29" cy="29" r="24" fill="none" stroke-width="5"
                  stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}"
                  stroke-dashoffset="${(C * (1 - ratio)).toFixed(1)}"/>
        </svg>
        <div class="qv-timer__text">${Math.ceil((remaining || 0) / 1000)}</div>
      </div>` : ''}
      <button class="qv-icon-btn" id="qv-sound" title="${esc(t('common.sound'))}" aria-label="${esc(t('common.sound'))}">${soundOn ? '🔊' : '🔇'}</button>
      <button class="qv-icon-btn" id="qv-pause" title="${esc(t('common.pause'))}" aria-label="${esc(t('common.pause'))}">⏸</button>
      <button class="qv-icon-btn" id="qv-full" title="${esc(t('common.fullscreen'))}" aria-label="${esc(t('common.fullscreen'))}">⛶</button>
    `;
    $('#qv-sound', hudEl).onclick = () => {
      const next = !Store.settings().sound;
      Store.saveSettings({ sound: next });
      Sound.apply({ sound: next });
      if (next) Sound.unlock();
      renderHud();
    };
    $('#qv-pause', hudEl).onclick = () => togglePause(true);
    $('#qv-full', hudEl).onclick = () => { Sound.play('button'); ctx.fullscreen(); };
  }

  function renderLifelines() {
    const v = engine.getView();
    lifeEl.innerHTML = v.lifelines.map((l) => `
      <button class="qv-lifeline ${l.remaining <= 0 ? 'is-used' : ''}" data-life="${l.kind}"
              ${l.remaining <= 0 ? 'disabled' : ''} aria-label="${esc(t(lifeKeys[l.kind]))}">
        <span class="qv-lifeline__icon">${icons[l.kind]}</span>
        <span>${esc(t(lifeKeys[l.kind]))}</span>
      </button>`).join('');
    lifeEl.querySelectorAll('[data-life]').forEach((btn) => {
      btn.onclick = () => useLifeline(btn.dataset.life);
    });
  }

  function renderQuestion() {
    const v = engine.getView();
    renderHud();
    renderLifelines();
    S.tickSecond = -1;
    stopSpotlight();

    const isHi = pkg.language === 'hi';
    qEl.innerHTML = `
      <div class="qv-question-head">
        <span class="qv-chip qv-chip--gold">${esc(t('game.stage'))} ${v.stageNumber} · ${esc(v.stageName)}</span>
        ${v.question && v.question.difficulty ? `<span class="qv-chip qv-small">${esc(v.question.difficulty.replace('_', ' '))}</span>` : ''}
        ${v.question && v.question.concept_tag ? `<span class="qv-chip qv-small">${esc(v.question.concept_tag)}</span>` : ''}
      </div>
      <div class="qv-question-body">
        ${v.question && v.question.illustration ? `<div class="qv-illus-wrap">${illustrationSVG(v.question.illustration)}</div>` : ''}
        <h2 class="qv-question-text ${isHi ? 'qv-hi-font' : ''}">${esc(v.question ? v.question.question : '')}</h2>
      </div>
      <div id="qv-clue-slot"></div>
      <div class="qv-options" id="qv-options">
        ${v.options.map((o) => `
          <button class="qv-option ${o.state === 'hidden' ? 'is-hidden' : ''} ${o.state === 'disabled' ? 'is-disabled' : ''}"
                  data-key="${o.key}" ${o.state === 'hidden' || o.state === 'disabled' ? 'disabled' : ''}>
            <span class="qv-option__key">${o.key}</span>
            <span class="qv-option__text ${isHi ? 'qv-hi-font' : ''}">${esc(o.text)}</span>
            <span class="qv-option__mark">${o.state === 'correct' ? '✔' : o.state === 'wrong' ? '✘' : ''}</span>
          </button>`).join('')}
      </div>
      <div id="qv-feedback-slot"></div>`;

    qEl.querySelectorAll('[data-key]').forEach((btn) => {
      btn.onclick = () => select(btn.dataset.key);
    });
    liveEl.textContent = `${t('game.question')} ${v.questionInStage} / ${v.questionsInStage}`;
    setMascot('idle', mascotLine('thinking'));

    // "Here comes the question": flash the board and play the landing sound.
    flashBoard();
    Sound.play('questionStart');

    startTimer();
  }

  /** Gold flash + settle, so a new question visibly lands on screen. */
  function flashBoard() {
    if (prefersReducedMotion()) return;
    const flash = document.createElement('div');
    flash.className = 'qv-flash';
    qEl.appendChild(flash);
    setTimeout(() => flash.remove(), 650);
  }

  /* The suspense "spotlight" that sweeps the options while the answer is decided. */
  function startSpotlight() {
    stopSpotlight();
    const btns = [...qEl.querySelectorAll('.qv-option')].filter((b) => !b.disabled && !b.classList.contains('is-hidden'));
    if (btns.length < 2 || prefersReducedMotion()) return;
    let index = 0;
    S.spotlightId = setInterval(() => {
      btns.forEach((b) => b.classList.remove('is-spotlight'));
      btns[index % btns.length].classList.add('is-spotlight');
      index += 1;
    }, 115);
  }

  function stopSpotlight() {
    if (!S) return;
    if (S.spotlightId) { clearInterval(S.spotlightId); S.spotlightId = null; }
    qEl.querySelectorAll('.is-spotlight').forEach((b) => b.classList.remove('is-spotlight'));
  }

  function paintOptions(selected, revealed) {
    const v = engine.getView();
    qEl.querySelectorAll('[data-key]').forEach((btn) => {
      const state = v.options.find((o) => o.key === btn.dataset.key);
      btn.classList.toggle('is-hidden', state.state === 'hidden');
      btn.classList.toggle('is-disabled', state.state === 'disabled');
      btn.classList.toggle('is-selected', !!selected && btn.dataset.key === selected && !revealed);
      btn.classList.toggle('is-correct', revealed && state.state === 'correct');
      btn.classList.toggle('is-wrong', revealed && state.state === 'wrong');
      btn.classList.toggle('is-dimmed', revealed && state.state === 'dimmed');
      btn.disabled = ['hidden', 'disabled'].includes(state.state);
      const mark = btn.querySelector('.qv-option__mark');
      if (mark) mark.textContent = revealed ? (state.state === 'correct' ? '✔' : state.state === 'wrong' ? '✘' : '') : '';
    });
  }

  function select(key) {
    if (S.suspended) return;
    const view = engine.getView();
    if (view.status !== 'QUESTION_READY') return;
    const res = engine.selectOption(key);
    if (!res.ok) return;

    Sound.play('select');
    paintOptions(key, false);
    setMascot('thinking', mascotLine('thinking'));
    liveEl.textContent = mascotLine('thinking');
    if (!$('#qv-suspense')) {
      const hint = document.createElement('div');
      hint.id = 'qv-suspense';
      hint.className = 'qv-suspense-hint';
      hint.innerHTML = `<span aria-hidden="true">●●●</span> ${esc(mascotLine('thinking'))}`;
      $('#qv-feedback-slot', qEl).appendChild(hint);
    }
    // Suspense: heartbeat + tension bed + the spotlight sweeping the options.
    Sound.setSuspenseIntensity(suspenseIntensityFromClock());
    Sound.startSuspense();
    startSpotlight();
    S.suspenseId = setTimeout(() => resolveReveal(engine.reveal()), suspenseMs);
  }

  function suspenseIntensityFromClock() {
    const total = pkg.settings.timer_seconds;
    const view = engine.getView();
    if (!total || view.timeRemainingMs === null) return 0.45;
    const ratio = Math.max(0, Math.min(1, view.timeRemainingMs / (total * 1000)));
    return Math.max(0.35, Math.min(1, 1 - ratio + 0.35));
  }

  function resolveReveal(res) {
    Sound.stopSuspense();
    stopSpotlight();
    if (!res || res.ok === false) return;
    S.suspenseId = null;

    const isCorrect = res.isCorrect;
    renderHud();
    renderLifelines();
    if (isCorrect) {
      Sound.play('correct');
      const scoreEl = $('#qv-score', hudEl);
      if (scoreEl) { scoreEl.classList.add('is-bump'); setTimeout(() => scoreEl.classList.remove('is-bump'), 500); }
      const burstLayer = document.createElement('div');
      burstLayer.className = 'qv-burst';
      qEl.appendChild(burstLayer);
      burst(burstLayer, { reduced: prefersReducedMotion() });
      setMascot('celebrate', mascotLine('correct'));
    } else {
      Sound.play('wrong');
      setMascot('oops', mascotLine('wrong'));
    }

    paintOptions(res.selectedOption, true);

    const v = engine.getView();
    const correctText = v.options.find((o) => o.key === res.correctOption)?.text || '';
    const explanation = S.tier === 'A' && res.simpleExplanation ? res.simpleExplanation : res.explanation;
    const showSecond = v.canSecondChance;
    const feedback = $('#qv-feedback-slot', qEl);
    feedback.innerHTML = `
      <div class="qv-feedback ${isCorrect ? 'qv-feedback--correct' : 'qv-feedback--wrong'}">
        <div class="qv-feedback__head">
          <span aria-hidden="true">${isCorrect ? '🎉' : res.timedOut ? '⏰' : '🤔'}</span>
          <span>${esc(isCorrect ? t('game.correct') : t('game.notQuite'))}</span>
        </div>
        ${isCorrect ? '' : `<div class="qv-feedback__answer">${esc(t('game.correctAnswer'))}: <span class="qv-green">${esc(correctText)}</span></div>`}
        <p class="qv-feedback__text">${esc(explanation || '')}</p>
        <div class="qv-feedback__actions">
          ${showSecond ? `<button class="qv-btn qv-btn--violet" id="qv-second-inline">🔄 ${esc(t('game.useSecondChance'))}</button>` : ''}
          <button class="qv-btn qv-btn--primary" id="qv-continue">${esc(t('game.continue'))} →</button>
        </div>
      </div>`;
    liveEl.textContent = isCorrect ? t('game.correct') : t('game.notQuite');
    if (showSecond) $('#qv-second-inline', feedback).onclick = () => useLifeline('second_chance', true);
    $('#qv-continue', feedback).onclick = () => advance();
    $('#qv-continue', feedback).focus();
  }

  function advance() {
    Sound.play('button');
    const res = engine.next();
    if (!res.ok) return;
    if (res.transition === 'next_question') { renderQuestion(); return; }
    if (res.transition === 'stage_complete') { Sound.play('stageClear'); renderStageComplete(res.summary); return; }
    if (res.transition === 'not_cleared') { finish(res.result); return; }
    if (res.transition === 'winner') { finish(res.result); return; }
  }

  function renderStageComplete(summary) {
    const v = engine.getView();
    if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
    qEl.innerHTML = `
      <div class="qv-stage-complete">
        <div class="qv-rail qv-rail--big">
          ${v.rail.map((r, i) => `
            <span class="qv-rail__node ${r.cleared ? 'is-cleared' : ''} ${r.current ? 'is-current' : ''} ${r.locked ? 'is-locked' : ''}">${r.cleared ? '★' : r.stage}</span>
            ${i < v.rail.length - 1 ? `<span class="qv-rail__bar ${r.cleared ? 'is-cleared' : ''}"></span>` : ''}`).join('')}
        </div>
        <h2 class="qv-h1 qv-gradient-text">${esc(t('stage.complete', { n: summary.stage }))}</h2>
        <p class="qv-sub">${esc(summary.name)} · ${esc(t('stage.correctOf'))}: <strong class="qv-gold">${summary.correct} / ${summary.total}</strong></p>
        <div class="qv-stat-grid" style="max-width:520px">
          <div class="qv-stat"><div class="qv-stat__value">${engine.getView().score}</div><div class="qv-stat__label">${esc(t('game.score'))}</div></div>
          <div class="qv-stat"><div class="qv-stat__value">${summary.passed ? '✔' : '—'}</div><div class="qv-stat__label">${esc(t('stage.correctOf'))}</div></div>
        </div>
        <button class="qv-btn qv-btn--primary qv-btn--lg" id="qv-next-stage">
          ${esc(summary.stage === 5 ? t('stage.final') : t('stage.next', { n: summary.stage + 1 }))} →
        </button>
      </div>`;
    setMascot('celebrate', mascotLine('stageClear', summary.stage));    $('#qv-next-stage', qEl).onclick = () => {
      Sound.play('button');
      const res = engine.next();
      if (res.transition === 'next_stage') { Sound.play('stageIntro'); renderQuestion(); }
      else if (res.transition === 'winner') finish(res.result);
    };
    qEl.scrollTop = 0;
  }

  function useLifeline(kind, fromFeedback = false) {
    if (S.suspended) return;
    const res = engine.useLifeline(kind);
    if (!res.ok) {
      if (res.reason === 'no_replacement') toast(t('life.noReplacement'));
      return;
    }
    Sound.play('lifeline');
    if (kind === 'half_half') {
      paintOptions(null, false);
      renderLifelines();
      setMascot('thinking', '50:50 — ' + mascotLine('lifeline'));
      liveEl.textContent = t('life.half_half');
    } else if (kind === 'clue') {
      renderLifelines();
      const slot = $('#qv-clue-slot', qEl);
      if (slot) {
        slot.innerHTML = `<div class="qv-clue"><strong>💡 ${esc(t('life.clue'))}:</strong> ${esc(res.clue)}</div>`;
      }
      setMascot('thinking', mascotLine('lifeline'));
    } else if (kind === 'second_chance') {
      renderLifelines();
      renderQuestion();
      liveEl.textContent = t('game.useSecondChance');
    } else if (kind === 'change_question') {
      renderQuestion();
      Sound.play('whoosh');
    }
    void fromFeedback;
  }

  function startTimer() {
    if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
    const total = S.pkg.settings.timer_seconds;
    if (!total) return;
    let lastTickAt = 0;
    S.timerId = setInterval(() => {
      if (S.suspended) return;
      const view = engine.getView();
      if (!['QUESTION_READY', 'SUSPENSE'].includes(view.status)) return;
      renderHud();

      const ms = view.timeRemainingMs;
      const sec = Math.ceil((ms || 0) / 1000);
      const nowMs = Date.now();

      // The clock: audible tick-tock in the last ten seconds, faster under five.
      if (sec <= 10 && sec >= 1 && ms !== null) {
        const interval = sec <= 5 ? 500 : 1000;
        if (nowMs - lastTickAt >= interval) {
          lastTickAt = nowMs;
          S.tickSecond += 1;
          Sound.play(S.tickSecond % 2 === 0 ? 'tick' : 'tock');
        }
      }
      if (view.status === 'SUSPENSE') Sound.setSuspenseIntensity(suspenseIntensityFromClock());

      if (ms !== null && ms <= 0) {
        clearInterval(S.timerId); S.timerId = null;
        if (engine.getView().status === 'QUESTION_READY') {
          const res = engine.timeout();
          res.timedOut = true;
          resolveReveal(res);
        }
      }
    }, 180);
  }

  /* ---------------- pause ---------------- */
  function togglePause(force) {
    const overlay = document.getElementById('qv-overlay');
    const isPaused = engine.getView().status === 'PAUSED';
    if (!force && !isPaused) return;
    if (isPaused) {
      engine.resume();
      S.suspended = false;
      overlay.hidden = true;
      overlay.innerHTML = '';
      startTimer();
      return;
    }
    if (!engine.pause().ok) return;
    S.suspended = true;
    if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
    overlay.innerHTML = `
      <div class="qv-card qv-center" style="max-width:460px">
        <div style="display:grid;place-items:center;gap:14px">
          ${quizoSVG('encourage', 110)}
          <h2 class="qv-h2">${esc(t('common.pause'))}</h2>
          <p class="qv-sub">${esc(t('game.score'))}: <strong class="qv-gold">${engine.getView().score}</strong></p>
          <div class="qv-row" style="justify-content:center">
            <button class="qv-btn qv-btn--primary" id="qv-resume">${esc(t('common.resume'))}</button>
            <button class="qv-btn qv-btn--ghost" id="qv-end">${esc(t('common.endGame'))}</button>
          </div>
        </div>
      </div>`;
    overlay.hidden = false;
    $('#qv-resume', overlay).onclick = () => { Sound.play('button'); togglePause(); };
    $('#qv-end', overlay).onclick = () => {
      Sound.play('button');
      S.suspended = false;
      overlay.hidden = true; overlay.innerHTML = '';
      const res = engine.abort('teacher_ended');
      finish(res.result);
    };
  }

  /* ---------------- keyboard (§14) ---------------- */
  const onKey = (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    const view = engine.getView();
    if (view.status === 'PAUSED') {
      if (['escape', 'p', ' '].includes(key)) { e.preventDefault(); togglePause(); }
      return;
    }
    if (['1', '2', '3', '4'].includes(key)) {
      const idx = Number(key) - 1;
      const opt = view.options[idx];
      if (opt && opt.state === 'normal') select(opt.key);
      return;
    }
    if (['a', 'b', 'c', 'd'].includes(key)) {
      const opt = view.options.find((o) => o.key === key.toUpperCase());
      if (opt && opt.state === 'normal') select(opt.key);
      return;
    }
    if (key === 'enter') {
      const cont = $('#qv-continue', qEl);
      const nextBtn = $('#qv-next-stage', qEl);
      if (cont) cont.click(); else if (nextBtn) nextBtn.click();
      return;
    }
    if (key === 'h') useLifeline('half_half');
    if (key === 'c') useLifeline('clue');
    if (key === 's') useLifeline('second_chance');
    if (key === 'x') useLifeline('change_question');
    if (['escape', 'p'].includes(key)) togglePause(true);
  };
  document.addEventListener('keydown', onKey);

  /* ---------------- finish ---------------- */
  function finish(result) {
    stopTimers();
    const overlay = document.getElementById('qv-overlay');
    overlay.hidden = true; overlay.innerHTML = '';
    if (result.status !== 'ABORTED') {
      Store.addResult(result, { topic: pkg.topic, subject: pkg.subject });
      Store.touchQuiz(pkg.quiz_id);
    }
    ctx.state.lastResult = result;
    ctx.go('result');
  }

  renderQuestion();

  /* Automated QA hook (tools/smoke.mjs). Read-only inspection of the live session. */
  window.QUIZVERSE = window.QUIZVERSE || {};
  window.QUIZVERSE.debug = {
    view: () => engine.getView(),
    answerKey: () => (engine._state.question ? engine._state.question.correct_option : null),
    result: () => engine.getResult(),
    session: () => ({ quiz_id: pkg.quiz_id, student: S.student, tier: S.tier, class_level: pkg.class_level }),
  };

  return () => {
    document.removeEventListener('keydown', onKey);
    stopTimers();
    if (window.QUIZVERSE) window.QUIZVERSE.debug = null;
    const overlay = document.getElementById('qv-overlay');
    overlay.hidden = true; overlay.innerHTML = '';
  };
}

/* ------------------------------------------------------------------ */
/* S9 / S10 — winner and "great effort"                                */
/* ------------------------------------------------------------------ */

function statTile(value, label) {
  return `<div class="qv-stat"><div class="qv-stat__value">${esc(value)}</div><div class="qv-stat__label">${esc(label)}</div></div>`;
}

export function resultScreen(ctx) {
  const r = ctx.state.lastResult;
  if (!r) return ctx.go('landing');
  const winner = r.status === 'WINNER';
  const confettiLayer = document.getElementById('qv-confetti');
  if (winner) {
    Sound.play('finalWin'); // fanfare + synthesised applause
    confetti(confettiLayer, { reduced: prefersReducedMotion() });
  } else {
    Sound.play('stageClear'); // warm and encouraging, never a "failure" sound
  }

  const weak = [...new Set(r.per_question.filter((q) => !q.is_correct && q.concept_tag).map((q) => q.concept_tag))].slice(0, 3);
  const strong = [...new Set(r.per_question.filter((q) => q.is_correct && q.concept_tag).map((q) => q.concept_tag))].slice(0, 3);

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen" style="justify-content:center">
    <div class="qv-card qv-card--hero qv-center" style="margin:auto;max-width:920px;width:100%">
      <div style="display:grid;place-items:center;gap:14px">
        ${winner ? `
          <div class="qv-trophy" style="font-size:clamp(60px,10vw,110px);line-height:1">🏆</div>
          <h1 class="qv-winner-name qv-gradient-text">${esc(t('win.title', { name: r.student_name }))}</h1>
          <p class="qv-sub" style="font-size:clamp(15px,1.8vw,20px)">${esc(t('win.sub', { topic: r.topic || '' }))}</p>` : `
          <div style="font-size:clamp(52px,9vw,96px);line-height:1">🌟</div>
          <h1 class="qv-winner-name qv-gradient-text">${esc(t('effort.title', { name: r.student_name }))}</h1>
          <p class="qv-sub" style="font-size:clamp(15px,1.8vw,20px)">${esc(t('effort.reached', { n: r.stage_reached }))}</p>`}

        <div class="qv-stat-grid">
          ${statTile(r.score, t('game.score'))}
          ${statTile(`${r.accuracy}%`, t('result.accuracy'))}
          ${statTile(`${r.correct}/${r.questions_answered}`, t('result.correct'))}
          ${statTile(fmtTime(r.time_taken_seconds), t('result.time'))}
          ${statTile(`${r.stages_cleared}/5`, t('result.stage'))}
          ${statTile(r.lifelines_used.length, t('result.lifelines'))}
        </div>

        <div class="qv-grid qv-grid--2" style="width:100%">
          ${strong.length ? `<div class="qv-card qv-card--flat"><div class="qv-label">${esc(t('effort.strong'))}</div>
            <div style="margin-top:8px">${strong.map((s) => `<span class="qv-chip qv-chip--green" style="margin:4px 6px 0 0">${esc(s)}</span>`).join('')}</div></div>` : ''}
          ${weak.length ? `<div class="qv-card qv-card--flat"><div class="qv-label">${esc(t('effort.practise'))}</div>
            <div style="margin-top:8px">${weak.map((s) => `<span class="qv-chip qv-chip--coral" style="margin:4px 6px 0 0">${esc(s)}</span>`).join('')}</div></div>` : ''}
        </div>

        <div class="qv-row" style="justify-content:center;margin-top:6px">
          <button class="qv-btn qv-btn--primary qv-btn--lg" id="qv-play-again">🔁 ${esc(t('win.playAgain'))}</button>
          <button class="qv-btn" id="qv-new-game">${esc(t('win.newGame'))}</button>
          <button class="qv-btn qv-btn--ghost" id="qv-review">${esc(t('win.review'))}</button>
          <button class="qv-btn qv-btn--ghost" id="qv-dash">${esc(t('result.dashboard'))}</button>
        </div>
        <div class="qv-mascot-wrap">
          ${quizoSVG(winner ? 'celebrate' : 'encourage', 120)}
          <div class="qv-speech">${esc(winner ? mascotLine('winner') : mascotLine('effort'))}</div>
        </div>
      </div>
    </div>
  </div>`;

  if (r.status === 'ABORTED') toast(t('common.endGame'));

  $('#qv-play-again', ctx.root).onclick = () => {
    Sound.play('button');
    startSession(ctx, S ? S.pkg : ctx.state.pkg, r.student_name);
    ctx.go('briefing');
  };
  $('#qv-new-game', ctx.root).onclick = () => { Sound.play('button'); ctx.go('create'); };
  $('#qv-review', ctx.root).onclick = () => { Sound.play('button'); ctx.go('review'); };
  $('#qv-dash', ctx.root).onclick = () => { Sound.play('button'); ctx.go('dashboard'); };
  return null;
}

/* ------------------------------------------------------------------ */
/* S11 — review questions (learning, not punishment)                   */
/* ------------------------------------------------------------------ */

export function reviewScreen(ctx) {
  const r = ctx.state.lastResult;
  const pkg = (S && S.pkg) || ctx.state.pkg;
  if (!r || !pkg) return ctx.go('landing');
  const byId = new Map(pkg.questions.map((q) => [q.question_id, q]));

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-row qv-row--between">
      <h1 class="qv-h2">${esc(t('result.reviewQuestions'))}</h1>
      <div class="qv-row">
        <span class="qv-chip qv-chip--gold">${r.score} ${esc(t('game.score'))}</span>
        <span class="qv-chip">${r.accuracy}% ${esc(t('result.accuracy'))}</span>
        <button class="qv-btn qv-btn--sm" id="qv-back-result">${esc(t('create.back'))}</button>
      </div>
    </div>
    <div class="qv-grid" style="gap:12px">
      ${r.per_question.map((pq, i) => {
        const q = byId.get(pq.question_id);
        if (!q) return '';
        const correctText = q.options[q.correct_option];
        const yourText = pq.selected_option ? q.options[pq.selected_option] : '—';
        return `
        <div class="qv-review-item ${pq.is_correct ? 'is-correct' : 'is-wrong'}">
          <div class="qv-row qv-row--between">
            <span class="qv-chip qv-small">${esc(t('game.stage'))} ${pq.stage}</span>
            <span class="qv-row" style="gap:8px">
              ${pq.assisted ? `<span class="qv-chip qv-small qv-chip--cyan">${esc(t('result.assisted'))}</span>` : ''}
              <span class="qv-answer-pill ${pq.is_correct ? 'qv-answer-pill--correct' : 'qv-answer-pill--wrong'}">
                ${pq.is_correct ? '✔' : '✘'} ${esc(pq.concept_tag || '')}
              </span>
            </span>
          </div>
          <div style="font-weight:700;font-size:16.5px;margin-top:8px">${i + 1}. ${esc(q.question)}</div>
          <div class="qv-row" style="gap:10px;margin-top:8px;flex-wrap:wrap">
            <span class="qv-answer-pill ${pq.is_correct ? 'qv-answer-pill--correct' : 'qv-answer-pill--wrong'}">
              ${esc(t('result.yourAnswer'))}: ${esc(yourText)}
            </span>
            <span class="qv-answer-pill qv-answer-pill--correct">✔ ${esc(correctText)}</span>
            <span class="qv-small qv-muted">${pq.time_seconds}s</span>
          </div>
          <p class="qv-feedback__text">${esc(q.explanation || '')}</p>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  $('#qv-back-result', ctx.root).onclick = () => { Sound.play('button'); ctx.go('result'); };
  return null;
}

export default { nameScreen, briefing, play, resultScreen, reviewScreen, startSession, hasSession };
