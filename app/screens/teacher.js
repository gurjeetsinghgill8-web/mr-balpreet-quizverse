/**
 * QUIZVERSE — TEACHER FLOW (Screens S1–S4, S12)
 * ---------------------------------------------------------------------------
 * Landing → Create → Generation → Preview → Dashboard.
 * The teacher's required input is only Class + Topic (§15.2); everything else
 * is optional and defaults intelligently.
 */

import { t, setLang, getLang } from '../i18n.js';
import { esc, $, $$, toast, tierFor, fmtTime } from '../ui.js';
import { Store } from '../store.js';
import { Sound } from '../audio.js';
import { demoLibrary } from '../offline-generator.js';
import { generateQuiz, describeProgress, engineBadge } from '../quiz-service.js';
import {
  updateQuestion, deleteQuestion, regenerateQuestion, packageStats, packageWarnings,
} from '../quiz-editor.js';
import { PROVIDERS, testAiProvider, serverAiStatus, aiEndpoint } from '../ai-client.js';
import { ingestFile } from '../document-ingest.js';
import { quizoSVG } from '../mascot.js';

const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8];
const COUNTS = [5, 10, 15, 20, 25];
const TIMERS = [
  ['auto', 'Auto'],
  ['15', '15s'],
  ['30', '30s'],
  ['45', '45s'],
  ['60', '60s'],
  ['none', '—'],
];
const PASS_MODES = [
  ['auto', 'Auto'],
  ['strict', 'Strict'],
  ['always', 'Always advance'],
];

/* ------------------------------------------------------------------ */
/* S1 — landing                                                        */
/* ------------------------------------------------------------------ */

export function landing(ctx) {
  const lib = demoLibrary;
  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}

    <section class="qv-card qv-card--hero">
      <div class="qv-hero">
        <div style="display:grid;gap:18px">
          <span class="qv-chip qv-chip--gold qv-chip--live">${esc(t('app.tagline'))}</span>
          <h1 class="qv-h1 qv-gradient-text">${esc(t('landing.headline'))}</h1>
          <p class="qv-sub" style="max-width:56ch">${esc(t('landing.sub'))}</p>
          <div class="qv-row">
            <button class="qv-btn qv-btn--primary qv-btn--lg" data-action="go-create">🎮 ${esc(t('landing.create'))}</button>
            <button class="qv-btn qv-btn--lg" id="qv-try-demo">⚡ ${esc(t('landing.demo'))}</button>
          </div>
          <div class="qv-row qv-small qv-muted">
            <span>🎯 ${esc(t('game.stage'))} × 5</span><span>•</span>
            <span>💡 ${esc(t('create.lifelines'))} × 4</span><span>•</span>
            <span>⏱ ${esc(t('create.timer'))}</span><span>•</span>
            <span>🏆 ${esc(t('win.title', { name: '' }).trim())}</span>
          </div>
        </div>
        <div class="qv-hero__stage">
          <div class="qv-hero__lights" aria-hidden="true"></div>
          <div style="display:grid;place-items:center;gap:10px;text-align:center">
            ${quizoSVG('welcome', 170)}
            <div class="qv-speech">${esc(t('briefing.title'))}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="qv-grid qv-grid--3">
      ${[
        ['⚡', 'landing.value1'],
        ['🎓', 'landing.value2'],
        ['📚', 'landing.value3'],
      ].map(([icon, key]) => `
        <div class="qv-card">
          <div class="qv-value">
            <div class="qv-value__icon" aria-hidden="true">${icon}</div>
            <div>
              <h3 class="qv-h3">${esc(t(`${key}.title`))}</h3>
              <p class="qv-sub qv-small">${esc(t(`${key}.text`))}</p>
            </div>
          </div>
        </div>`).join('')}
    </section>

    <section class="qv-card">
      <div class="qv-row qv-row--between">
        <h2 class="qv-h2">${esc(t('create.demoLibrary'))}</h2>
        <span class="qv-chip qv-small qv-chip--cyan">Layer 1 · offline demo library</span>
      </div>
      <p class="qv-sub qv-small" style="margin-top:8px">
        ${esc(t('landing.value3.text'))}
      </p>
      <div class="qv-grid qv-grid--3" style="margin-top:16px">
        ${lib.map((p, i) => `
          <div class="qv-card qv-card--flat">
            <div class="qv-row qv-row--between">
              <span class="qv-chip qv-chip--gold">${esc(t('create.class'))} ${p.class_level}</span>
              <span class="qv-chip qv-small">${p.language === 'hi' ? 'हिंदी' : 'English'}</span>
            </div>
            <h3 class="qv-h3 ${p.language === 'hi' ? 'qv-hi-font' : ''}" style="margin-top:12px">${esc(p.topic)}</h3>
            <p class="qv-sub qv-small">${esc(p.description)}</p>
            <div class="qv-row qv-row--between" style="margin-top:14px">
              <span class="qv-small qv-muted">${p.questions} ${esc(t('preview.questions'))} · ${esc(p.subject)}</span>
              <button class="qv-btn qv-btn--sm qv-btn--primary" data-demo="${i}">▶ ${esc(t('dash.play'))}</button>
            </div>
          </div>`).join('')}
      </div>
    </section>
  </div>`;

  $('#qv-try-demo', ctx.root).onclick = () => {
    Sound.play('button');
    ctx.state.request = { mode: 'topic', classLevel: 5, topic: 'Solar System', count: 15, timer: 'auto', language: 'en' };
    ctx.go('loading');
  };

  $$('[data-demo]', ctx.root).forEach((btn) => {
    btn.onclick = () => {
      Sound.play('button');
      const pack = lib[Number(btn.dataset.demo)];
      ctx.state.request = {
        mode: 'topic',
        classLevel: pack.class_level,
        topic: pack.topic,
        count: pack.questions,
        timer: 'auto',
        language: pack.language,
      };
      ctx.go('loading');
    };
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* S2 — create your game                                               */
/* ------------------------------------------------------------------ */

export function create(ctx) {
  // The draft survives a page refresh: pasted or extracted material is never lost.
  const draft = ctx.state.draft || Store.draft() || {};
  const state = {
    classLevel: draft.classLevel || 5,
    topic: draft.topic || '',
    language: draft.language || 'en',
    count: draft.count || 15,
    timer: draft.timer || 'auto',
    passMode: draft.passMode || 'auto',
    materialText: draft.materialText || '',
    allowAdditionalKnowledge: !!draft.allowAdditionalKnowledge,
    lifelines: draft.lifelines || { half_half: 1, clue: 1, second_chance: 1, change_question: 1 },
  };
  if (draft.fileMeta) state.fileMeta = draft.fileMeta;
  let tab = ctx.state.createTab || 'topic';

  const engine = engineBadge();
  const engineTone = engine.tone === 'gold' ? 'qv-chip--gold' : engine.tone === 'cyan' ? 'qv-chip--cyan' : '';

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-row qv-row--between">
      <h1 class="qv-h2">${esc(t('create.title'))}</h1>
      <div class="qv-row">
        <span class="qv-chip qv-small ${engineTone}" title="${esc(t('settings.title'))}">🧠 ${esc(t('pipeline.engine'))}: ${esc(engine.label)}</span>
        <button class="qv-btn qv-btn--sm qv-btn--ghost" data-action="go-settings">⚙ ${esc(t('settings.title'))}</button>
      </div>
    </div>
    <div class="qv-tabs" style="align-self:flex-start">
      <button class="qv-tab is-active" data-tab="topic">${esc(t('create.topic'))}</button>
      <button class="qv-tab" data-tab="material">${esc(t('create.fromMaterial'))}</button>
    </div>

    <div class="qv-grid qv-grid--2" style="align-items:start">
      <div class="qv-card" style="display:grid;gap:18px">
        <div class="qv-field">
          <span class="qv-label">${esc(t('create.class'))} *</span>
          <div class="qv-chip-radio" id="qv-class">
            ${CLASSES.map((c) => `
              <label>
                <input type="radio" name="class" value="${c}" ${c === state.classLevel ? 'checked' : ''}>
                <span>${c}</span>
              </label>`).join('')}
          </div>
        </div>

        <div id="qv-tab-topic" style="display:grid;gap:18px">
          <div class="qv-field">
            <label class="qv-label" for="qv-topic">${esc(t('create.topic'))} *</label>
            <input id="qv-topic" class="qv-input" placeholder="${esc(t('create.topicPh'))}" value="${esc(state.topic)}">
            <span class="qv-small qv-muted">${esc(t('create.materialHint'))}</span>
          </div>
          <div class="qv-row" style="gap:8px">
            ${demoLibrary.map((p) => `<button class="qv-chip qv-chip--cyan qv-small" data-fill="${esc(p.topic)}">${esc(p.topic)} · C${p.class_level}</button>`).join('')}
          </div>
        </div>

        <div id="qv-tab-material" style="display:none;gap:14px">
          <div id="qv-drop" class="qv-card qv-card--flat qv-center" style="cursor:pointer;border-style:dashed;display:grid;gap:8px;padding:22px;transition:border-color 140ms">
            <div style="font-size:30px" aria-hidden="true">📄</div>
            <div style="font-weight:700">${esc(t('create.dropHint'))}</div>
            <div class="qv-small qv-muted">${esc(t('create.materialHint'))}</div>
            <input type="file" id="qv-file" accept=".pdf,.docx,.txt,.text,.md,.markdown,.csv,.tsv" hidden>
          </div>
          <div id="qv-ingest-result"></div>
          <label class="qv-field">
            <span class="qv-label" for="qv-material">${esc(t('create.fromMaterial'))}</span>
            <textarea id="qv-material" class="qv-textarea" placeholder="${esc(t('create.materialPh'))}">${esc(state.materialText)}</textarea>
          </label>
          <label class="qv-toggle">
            <input type="checkbox" id="qv-additional" ${state.allowAdditionalKnowledge ? 'checked' : ''}>
            <span class="qv-toggle__track"></span>
            <span class="qv-toggle__label">Allow additional knowledge (questions may go beyond the material)</span>
          </label>
        </div>
      </div>

      <div class="qv-card" style="display:grid;gap:18px">
        <div class="qv-field">
          <span class="qv-label">${esc(t('create.language'))}</span>
          <div class="qv-chip-radio" id="qv-lang">
            <label><input type="radio" name="lang" value="en" ${state.language === 'en' ? 'checked' : ''}><span>English</span></label>
            <label><input type="radio" name="lang" value="hi" ${state.language === 'hi' ? 'checked' : ''}><span>हिंदी</span></label>
          </div>
        </div>

        <div class="qv-field">
          <span class="qv-label">${esc(t('create.count'))}</span>
          <div class="qv-chip-radio" id="qv-count">
            ${COUNTS.map((c) => `<label><input type="radio" name="count" value="${c}" ${c === state.count ? 'checked' : ''}><span>${c}</span></label>`).join('')}
          </div>
        </div>

        <div class="qv-field">
          <span class="qv-label">${esc(t('create.advanced'))}</span>
          <div class="qv-grid" style="gap:12px">
            <label class="qv-field">
              <span class="qv-small qv-muted">${esc(t('create.timer'))}</span>
              <select class="qv-select" id="qv-timer">
                ${TIMERS.map(([v, label]) => `<option value="${v}" ${v === state.timer ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label class="qv-field">
              <span class="qv-small qv-muted">Stage rule</span>
              <select class="qv-select" id="qv-pass">
                ${PASS_MODES.map(([v, label]) => `<option value="${v}" ${v === state.passMode ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div class="qv-field">
          <span class="qv-label">${esc(t('create.lifelines'))}</span>
          <div style="display:grid;gap:8px">
            ${[['half_half', 'life.half_half'], ['clue', 'life.clue'], ['second_chance', 'life.second_chance'], ['change_question', 'life.change_question']]
              .map(([k, key]) => `
              <label class="qv-toggle">
                <input type="checkbox" data-life="${k}" ${state.lifelines[k] ? 'checked' : ''}>
                <span class="qv-toggle__track"></span>
                <span class="qv-toggle__label">${esc(t(key))}</span>
              </label>`).join('')}
          </div>
        </div>

        <button class="qv-btn qv-btn--primary qv-btn--lg qv-btn--block" id="qv-generate">✨ ${esc(t('create.generate'))}</button>
        <div class="qv-row qv-small qv-muted" style="justify-content:center">
          <span>10-point question validation runs automatically</span>
        </div>
      </div>
    </div>

    <div class="qv-card qv-card--flat">
      <div class="qv-row">
        <span class="qv-chip qv-chip--gold">Demo build</span>
        <span class="qv-small qv-muted">
          Layer 1 runs on the offline demo library + the full 10-point validation engine.
          Live AI generation (PDF → questions) plugs into the same interface.
        </span>
      </div>
    </div>
  </div>`;

  const readForm = () => {
    state.classLevel = Number($('input[name="class"]:checked', ctx.root)?.value || 5);
    state.language = $('input[name="lang"]:checked', ctx.root)?.value || 'en';
    state.count = Number($('input[name="count"]:checked', ctx.root)?.value || 15);
    state.timer = $('#qv-timer', ctx.root).value;
    state.passMode = $('#qv-pass', ctx.root).value;
    state.topic = ($('#qv-topic', ctx.root)?.value || '').trim();
    state.materialText = ($('#qv-material', ctx.root)?.value || '').trim();
    state.allowAdditionalKnowledge = !!$('#qv-additional', ctx.root)?.checked;
    $$('[data-life]', ctx.root).forEach((cb) => { state.lifelines[cb.dataset.life] = cb.checked ? 1 : 0; });
    ctx.state.draft = { ...state };
    ctx.state.createTab = tab;
    Store.saveDraft(ctx.state.draft);
    return state;
  };

  $$('[data-tab]', ctx.root).forEach((tabBtn) => {
    tabBtn.onclick = () => {
      tab = tabBtn.dataset.tab;
      ctx.state.createTab = tab;
      $$('[data-tab]', ctx.root).forEach((b) => b.classList.toggle('is-active', b === tabBtn));
      $('#qv-tab-topic', ctx.root).style.display = tab === 'topic' ? 'grid' : 'none';
      $('#qv-tab-material', ctx.root).style.display = tab === 'material' ? 'grid' : 'none';
    };
  });
  // honour the tab the teacher was last on (survives a refresh too)
  if (tab === 'material') {
    const materialTab = $('[data-tab="material"]', ctx.root);
    if (materialTab) materialTab.click();
  }

  $$('[data-fill]', ctx.root).forEach((chip) => {
    chip.onclick = () => { $('#qv-topic', ctx.root).value = chip.dataset.fill; readForm(); };
  });

  // The quiz language follows the topic script: typing Devanagari selects Hindi,
  // typing Latin switches back to English. The teacher can always override after.
  $('#qv-topic', ctx.root).addEventListener('input', (e) => {
    const value = e.target.value;
    if (!value.trim()) return;
    const wantsHindi = /[\u0900-\u097F]/.test(value);
    const target = $(`input[name="lang"][value="${wantsHindi ? 'hi' : 'en'}"]`, ctx.root);
    if (target && !target.checked) target.checked = true;
  });

  /* ---- document ingestion (PDF / DOCX / TXT / MD) ---- */
  const dropEl = $('#qv-drop', ctx.root);
  const fileEl = $('#qv-file', ctx.root);
  const resultEl = $('#qv-ingest-result', ctx.root);
  const materialEl = $('#qv-material', ctx.root);

  const showIngestResult = (result) => {
    if (!result || !result.ok) {
      resultEl.innerHTML = `
        <div class="qv-card qv-card--flat" style="border-color:rgba(248,113,113,.5);display:grid;gap:8px">
          <div class="qv-row">
            <span class="qv-chip qv-chip--coral qv-small">✖ ${esc(t('create.ingestFailed'))}</span>
            <span class="qv-small">${esc(result && result.message ? result.message : t('error.pdf'))}</span>
          </div>
          ${result && result.warnings && result.warnings.length
            ? `<div class="qv-small qv-muted">${result.warnings.map((w) => esc(w)).join('<br>')}</div>` : ''}
          <div class="qv-small qv-muted">${esc(t('create.pasteInstead'))}</div>
        </div>`;
      return;
    }

    state.fileMeta = {
      fileName: result.file_name || null,
      pages: result.pages ?? null,
      kind: result.kind,
      quality: result.quality,
    };
    materialEl.value = result.text;

    const qualityPct = Math.round((result.quality || 0) * 100);
    resultEl.innerHTML = `
      <div class="qv-card qv-card--flat" style="border-color:rgba(34,197,94,.45);display:grid;gap:8px">
        <div class="qv-row qv-row--between">
          <div class="qv-row">
            <span class="qv-chip qv-chip--green qv-small">✔ ${esc(t('create.extracted'))}</span>
            ${result.file_name ? `<span class="qv-chip qv-small">${esc(result.file_name)}</span>` : ''}
            <span class="qv-chip qv-small">${esc(String(result.kind).toUpperCase())}</span>
            ${result.pages ? `<span class="qv-chip qv-small">${esc(t('create.pages'))}: ${esc(result.pages)}</span>` : ''}
            <span class="qv-chip qv-small ${qualityPct >= 60 ? 'qv-chip--green' : 'qv-chip--gold'}">${esc(t('create.quality'))}: ${qualityPct}%</span>
            <span class="qv-chip qv-small">${esc(result.words)} ${esc(t('create.words'))}</span>
          </div>
          <button class="qv-btn qv-btn--sm qv-btn--ghost" id="qv-preview-toggle">${esc(t('create.preview'))}</button>
        </div>
        <div id="qv-text-preview" class="qv-small qv-muted" hidden
             style="margin-top:4px;white-space:pre-wrap;max-height:190px;overflow:auto;border-top:1px solid var(--qv-line);padding-top:8px">${esc(result.text.slice(0, 900))}…</div>
        ${result.warnings && result.warnings.length
          ? `<div class="qv-small qv-gold">${result.warnings.map((w) => esc(w)).join('<br>')}</div>` : ''}
      </div>`;

    const toggle = $('#qv-preview-toggle', resultEl);
    if (toggle) {
      toggle.onclick = () => {
        const preview = $('#qv-text-preview', resultEl);
        if (preview) preview.hidden = !preview.hidden;
      };
    }
    readForm();
  };

  const handleFile = async (file) => {
    if (!file) return;
    resultEl.innerHTML = `<div class="qv-card qv-card--flat qv-small qv-muted">⏳ ${esc(t('create.ingesting'))} — ${esc(file.name)}</div>`;
    let result;
    try {
      result = await ingestFile(file);
    } catch (err) {
      result = { ok: false, message: t('error.pdf'), warnings: [String(err && err.message)] };
    }
    showIngestResult(result);
  };

  dropEl.onclick = () => fileEl.click();
  dropEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); } };
  dropEl.setAttribute('tabindex', '0');
  dropEl.setAttribute('role', 'button');
  fileEl.onchange = (e) => handleFile(e.target.files && e.target.files[0]);
  ['dragenter', 'dragover'].forEach((name) => dropEl.addEventListener(name, (e) => {
    e.preventDefault();
    dropEl.style.borderColor = 'var(--qv-cyan-400)';
  }));
  ['dragleave', 'drop'].forEach((name) => dropEl.addEventListener(name, (e) => {
    e.preventDefault();
    dropEl.style.borderColor = '';
  }));
  dropEl.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  $('#qv-generate', ctx.root).onclick = () => {
    const form = readForm();
    Sound.play('button');
    const mode = tab === 'material' ? 'material' : 'topic';
    if (mode === 'topic' && !form.topic) { toast(t('create.topicPh')); $('#qv-topic', ctx.root).focus(); return; }
    if (mode === 'material' && form.materialText.length < 80) { toast(t('error.materialTooFew')); return; }

    // Never send a language that contradicts the topic's script — that would fail
    // validation and look like a bug to the teacher.
    if (mode === 'topic') {
      const wantsHindi = /[\u0900-\u097F]/.test(form.topic);
      const contradicting = (wantsHindi && form.language === 'en') || (!wantsHindi && form.language === 'hi');
      if (contradicting) {
        form.language = wantsHindi ? 'hi' : 'en';
        const radio = $(`input[name="lang"][value="${form.language}"]`, ctx.root);
        if (radio) radio.checked = true;
        state.language = form.language;
        readForm();
        toast(t(wantsHindi ? 'create.languageAutoHi' : 'create.languageAutoEn'));
      }
    }

    ctx.state.request = {
      mode,
      classLevel: form.classLevel,
      topic: mode === 'material' ? (form.topic || 'My Material') : form.topic,
      text: form.materialText,
      count: form.count,
      timer: form.timer,
      passPolicy: form.passMode,
      language: form.language,
      lifelines: form.lifelines,
      allowAdditionalKnowledge: !!form.allowAdditionalKnowledge,
      fileName: state.fileMeta ? state.fileMeta.fileName : null,
      pages: state.fileMeta ? state.fileMeta.pages : null,
    };
    ctx.go('loading');
  };

  return null;
}

/* ------------------------------------------------------------------ */
/* S3 — generation progress (real pipeline, not theatre)               */
/* ------------------------------------------------------------------ */

export function loading(ctx) {
  const req = ctx.state.request;
  if (!req) return ctx.go('create');

  let cancelled = false;
  let interval = null;
  const startedAt = Date.now();
  const messages = ['loading.understanding', 'loading.preparing', 'loading.checking', 'loading.balancing', 'loading.building', 'loading.almost'];
  const pipeline = [];

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-loading">
      ${quizoSVG('thinking', 150)}
      <div class="qv-loading__msg" id="qv-loading-msg">${esc(t(messages[0]))}</div>
      <div class="qv-loading__steps" id="qv-loading-steps">
        ${messages.map(() => '<span class="qv-loading__step"></span>').join('')}
      </div>
      <div class="qv-card qv-card--flat" style="width:min(520px,92vw)">
        <div class="qv-label">${esc(t('loading.pipeline'))}</div>
        <div id="qv-pipeline" class="qv-small qv-muted" style="margin-top:10px;display:grid;gap:6px;min-height:5.5em"></div>
      </div>
      <div class="qv-small qv-muted">
        ${esc(req.mode === 'material' ? t('create.fromMaterial') : (req.topic || ''))} · ${esc(t('create.class'))} ${esc(req.classLevel)}
      </div>
    </div>
  </div>`;

  const msgEl = $('#qv-loading-msg', ctx.root);
  const stepsEl = $$('.qv-loading__step', ctx.root);
  const pipeEl = $('#qv-pipeline', ctx.root);

  const setStep = (index) => stepsEl.forEach((el, i) => el.classList.toggle('is-done', i <= index));
  const pushPipeline = (line) => {
    pipeline.push(line);
    pipeEl.innerHTML = pipeline.slice(-8).map((l) => `<div>▸ ${esc(l)}</div>`).join('');
  };
  setStep(0);

  let step = 0;
  interval = setInterval(() => {
    step = Math.min(step + 1, messages.length - 1);
    msgEl.textContent = t(messages[step]);
    setStep(step - 1);
    if (step >= messages.length - 1) { clearInterval(interval); interval = null; }
  }, 420);

  generateQuiz({
    request: req,
    settings: Store.settings(),
    onProgress: (event) => {
      const info = describeProgress(event);
      if (!info) return;
      msgEl.textContent = t(info.key);
      pushPipeline(`${event.stage}${info.detail ? ` · ${info.detail}` : ''}`);
      if (['building', 'fallback', 'ai_failed'].includes(event.stage)) setStep(messages.length - 1);
    },
  })
    .then((result) => {
      if (cancelled) return;
      const wait = Math.max(0, 1500 - (Date.now() - startedAt));
      setTimeout(() => { if (!cancelled) finish(result); }, wait);
    })
    .catch((err) => {
      if (cancelled) return;
      finish({ ok: false, error: 'unexpected', message: err && err.message });
    });

  function finish(result) {
    if (interval) { clearInterval(interval); interval = null; }
    if (result.ok) {
      ctx.state.pkg = result.package;
      ctx.state.validation = result.validation;
      ctx.state.validationNote = result.package.generation_meta.note || null;
      ctx.state.generationMeta = result.meta || null;
      ctx.state.engine = result.engine || 'offline';
      ctx.state.engineLabel = result.engineLabel || null;
      ctx.state.aiError = result.aiError || null;
      ctx.state.request = req;
      Sound.play('stageClear');
      ctx.go('preview');
      return;
    }

    const errorCard = `
      <div class="qv-card" style="max-width:620px;margin:40px auto;display:grid;gap:14px">
        <h2 class="qv-h2">${esc(t('error.generation'))}</h2>
        <p class="qv-sub">${
          result.message
            ? esc(result.message)
            : result.error === 'no_pack'
              ? esc(t('error.noPack'))
              : result.error === 'material_too_thin'
                ? esc(t('error.materialTooFew'))
                : esc(t('error.tooFew', { n: (result.validation && result.validation.stats.passed) || 0 }))
        }</p>
        ${result.pack && result.pack.class_level && Number(result.pack.class_level) !== Number(req.classLevel)
          ? `<div class="qv-row"><span class="qv-chip qv-chip--gold">${esc(t('error.packClass', { pack: result.pack.class_level }))}</span>
             <button class="qv-btn qv-btn--sm qv-btn--primary" id="qv-switch-class">${esc(t('error.switchClass', { pack: result.pack.class_level }))}</button></div>`
          : ''}
        <div class="qv-row">
          <button class="qv-btn qv-btn--primary" id="qv-retry">${esc(t('error.tryAgain'))}</button>
          <button class="qv-btn" id="qv-edit">${esc(t('error.editInput'))}</button>
          <button class="qv-btn qv-btn--ghost" data-action="go-settings">⚙ ${esc(t('settings.title'))}</button>
        </div>
        <div class="qv-card qv-card--flat">
          <div class="qv-label">${esc(t('create.demoLibrary'))}</div>
          <div class="qv-row" style="margin-top:8px">
            ${demoLibrary.map((p) => `<span class="qv-chip qv-small">${esc(p.topic)} · ${esc(t('create.class'))} ${p.class_level}</span>`).join('')}
          </div>
        </div>
      </div>`;
    ctx.root.innerHTML = `<div class="qv-shell qv-screen">${ctx.header()}${errorCard}</div>`;

    $('#qv-retry', ctx.root).onclick = () => { Sound.play('button'); ctx.go('loading'); };
    $('#qv-edit', ctx.root).onclick = () => { Sound.play('button'); ctx.go('create'); };
    const switcher = $('#qv-switch-class', ctx.root);
    if (switcher) {
      switcher.onclick = () => {
        Sound.play('button');
        ctx.state.request = { ...req, classLevel: result.pack.class_level, topic: result.pack.topic, mode: 'topic' };
        ctx.go('loading');
      };
    }
  }

  return () => { cancelled = true; if (interval) clearInterval(interval); };
}

/* ------------------------------------------------------------------ */
/* S3b — generation engine settings                                    */
/* ------------------------------------------------------------------ */

export function settings(ctx) {
  const s = Store.settings();
  const form = {
    aiProvider: s.aiProvider || 'offline',
    aiModel: s.aiModel || '',
    aiBaseUrl: s.aiBaseUrl || '',
    aiApiKey: s.aiApiKey || '',
    aiFallback: s.aiFallback !== false,
  };
  const providerList = ['offline', 'mock', 'openai', 'anthropic', 'gemini', 'ollama'];

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-row qv-row--between">
      <h1 class="qv-h2">⚙ ${esc(t('settings.title'))}</h1>
      <span class="qv-chip qv-small" id="qv-server-status">${esc(t('settings.serverKey'))}: …</span>
    </div>
    <p class="qv-sub" style="max-width:74ch">${esc(t('settings.intro'))}</p>

    <div class="qv-grid qv-grid--2" style="align-items:start">
      <div class="qv-card" style="display:grid;gap:16px">
        <div class="qv-field">
          <span class="qv-label">${esc(t('settings.engine'))}</span>
          <div class="qv-chip-radio" id="qv-provider">
            ${providerList.map((id) => `
              <label title="${esc(PROVIDERS[id].label)}">
                <input type="radio" name="provider" value="${id}" ${id === form.aiProvider ? 'checked' : ''}>
                <span>${esc(id)}</span>
              </label>`).join('')}
          </div>
          <span class="qv-small qv-muted" id="qv-provider-note"></span>
        </div>

        <label class="qv-field">
          <span class="qv-label">${esc(t('settings.model'))}</span>
          <input class="qv-input" id="qv-model" placeholder="${esc(t('settings.defaultModel'))}" value="${esc(form.aiModel)}">
        </label>

        <label class="qv-field" id="qv-base-wrap">
          <span class="qv-label">${esc(t('settings.baseUrl'))}</span>
          <input class="qv-input" id="qv-base" placeholder="https://…" value="${esc(form.aiBaseUrl)}">
        </label>

        <label class="qv-field" id="qv-key-wrap">
          <span class="qv-label">${esc(t('settings.apiKey'))}</span>
          <input class="qv-input" id="qv-key" type="password" autocomplete="off" placeholder="sk-…" value="${esc(form.aiApiKey)}">
          <span class="qv-small qv-muted">${esc(t('settings.keyNote'))}</span>
        </label>

        <label class="qv-toggle">
          <input type="checkbox" id="qv-fallback" ${form.aiFallback ? 'checked' : ''}>
          <span class="qv-toggle__track"></span>
          <span class="qv-toggle__label">${esc(t('settings.fallback'))}</span>
        </label>

        <div class="qv-row">
          <button class="qv-btn qv-btn--primary" id="qv-save">💾 ${esc(t('settings.save'))}</button>
          <button class="qv-btn" id="qv-test">🔌 ${esc(t('settings.test'))}</button>
          <button class="qv-btn qv-btn--ghost" data-action="go-create">${esc(t('create.back'))}</button>
        </div>
        <div id="qv-test-result" class="qv-small qv-muted"></div>
      </div>

      <div class="qv-card" style="display:grid;gap:12px">
        <h2 class="qv-h3">🔊 ${esc(t('settings.testSounds'))}</h2>
        <label class="qv-field">
          <span class="qv-label">${esc(t('settings.volume'))}</span>
          <input type="range" id="qv-volume" class="qv-range" min="0" max="100" step="5"
                 value="${Math.round((s.volume ?? 0.9) * 100)}" aria-label="${esc(t('settings.volume'))}">
        </label>
        <div class="qv-row">
          <button class="qv-btn qv-btn--sm" data-test="intro">▶ ${esc(t('settings.testIntro'))}</button>
          <button class="qv-btn qv-btn--sm" data-test="questionStart">▶ ${esc(t('settings.testQuestion'))}</button>
          <button class="qv-btn qv-btn--sm" data-test="wrong">▶ ${esc(t('settings.testWrong'))}</button>
          <button class="qv-btn qv-btn--sm" data-test="applause">▶ ${esc(t('settings.testApplause'))}</button>
        </div>
        <div class="qv-small qv-muted">${esc(t('settings.soundHint'))}</div>
        <hr class="qv-divider">
        <h2 class="qv-h3">${esc(t('loading.pipeline'))}</h2>
        <div class="qv-small qv-muted" style="line-height:1.7">
          <div>1. prompt → provider</div>
          <div>2. JSON parse (tolerant)</div>
          <div>3. 10-point validation</div>
          <div>4. bounded repair loop</div>
          <div>5. spare pool → 5 stages</div>
          <div>6. frozen Quiz Package</div>
        </div>
        <hr class="qv-divider">
        <div class="qv-label">${esc(t('settings.privacy'))}</div>
        <div class="qv-small qv-muted">${esc(t('settings.viewerNote'))}</div>
        <div class="qv-small qv-muted">${esc(t('pipeline.mock'))}</div>
      </div>
    </div>
  </div>`;

  const providerNote = $('#qv-provider-note', ctx.root);
  const baseWrap = $('#qv-base-wrap', ctx.root);
  const keyWrap = $('#qv-key-wrap', ctx.root);

  const readForm = () => {
    form.aiProvider = $('input[name="provider"]:checked', ctx.root)?.value || 'offline';
    form.aiModel = $('#qv-model', ctx.root).value.trim();
    form.aiBaseUrl = $('#qv-base', ctx.root).value.trim();
    form.aiApiKey = $('#qv-key', ctx.root).value.trim();
    form.aiFallback = $('#qv-fallback', ctx.root).checked;
    return { ...form };
  };

  const refresh = () => {
    const current = readForm();
    const spec = PROVIDERS[current.aiProvider] || {};
    providerNote.textContent = current.aiProvider === 'offline'
      ? t('pipeline.demoLibrary')
      : current.aiProvider === 'mock'
        ? t('pipeline.mock')
        : `${spec.label || current.aiProvider}${spec.needsKey ? ' · needs an API key' : ' · no key needed'}`;
    const needsEndpointFields = current.aiProvider !== 'offline' && current.aiProvider !== 'mock';
    baseWrap.style.display = needsEndpointFields ? 'grid' : 'none';
    keyWrap.style.display = needsEndpointFields ? 'grid' : 'none';
  };

  $$('input[name="provider"]', ctx.root).forEach((radio) => radio.addEventListener('change', refresh));
  refresh();

  /* ---- classroom speaker: volume + one-tap sound checks ---- */
  const volumeEl = $('#qv-volume', ctx.root);
  if (volumeEl) {
    volumeEl.oninput = () => {
      const volume = Number(volumeEl.value) / 100;
      Store.saveSettings({ volume });
      Sound.apply({ volume, sound: true });
    };
    volumeEl.onchange = () => Sound.play('select');
  }
  $$('[data-test]', ctx.root).forEach((btn) => {
    btn.onclick = () => {
      Sound.unlock();
      Sound.apply({ sound: true, effects: true, volume: Number(volumeEl ? volumeEl.value : 90) / 100 });
      Sound.play(btn.dataset.test);
    };
  });

  // server-side status (does the dev server already hold a key?)
  serverAiStatus().then((status) => {
    const badge = $('#qv-server-status', ctx.root);
    if (!badge) return;
    if (!status) {
      // No API = a static host (Netlify / GitHub Pages). Live AI cannot work here.
      badge.textContent = 'static host — live AI needs the Node server';
      badge.className = 'qv-chip qv-small qv-chip--coral';
      const note = $('#qv-provider-note', ctx.root);
      if (note) note.textContent = t('settings.viewerNote');
      return;
    }
    badge.textContent = `${t('settings.serverKey')}: ${status.serverKeyConfigured ? t('settings.serverKeyYes') : t('settings.serverKeyNo')} · default ${status.serverProvider}`;
    badge.className = `qv-chip qv-small ${status.serverKeyConfigured ? 'qv-chip--green' : ''}`;
  });

  $('#qv-save', ctx.root).onclick = () => {
    const values = readForm();
    Store.saveSettings(values);
    Sound.play('correct');
    toast(t('settings.saved'));
    ctx.go('preview');
  };

  $('#qv-test', ctx.root).onclick = async () => {
    const values = readForm();
    const out = $('#qv-test-result', ctx.root);
    out.textContent = '…';
    Sound.play('button');
    const res = await testAiProvider(values);
    const parts = [];
    if (res.server) parts.push(`server default provider: ${res.server.serverProvider}${res.server.serverKeyConfigured ? ' (key on server)' : ''}`);
    if (!aiEndpoint()) parts.push('served without the dev server — direct calls only');
    out.innerHTML = `${res.ok ? '✔' : '✖'} ${esc(res.message)}${res.model ? ` · model: ${esc(res.model)}` : ''}
      ${parts.length ? `<div class="qv-muted">${esc(parts.join(' · '))}</div>` : ''}`;
    out.className = `qv-small ${res.ok ? 'qv-green' : 'qv-coral'}`;
  };

  return null;
}

/* ------------------------------------------------------------------ */
/* S4 — preview & manage                                               */
/* ------------------------------------------------------------------ */

export function preview(ctx) {
  const pkg = ctx.state.pkg;
  if (!pkg) return ctx.go('create');

  const isSaved = () => Store.quizzes().some((q) => q.quiz_id === pkg.quiz_id);
  /** Edits are never lost: if the quiz is saved, the new version is persisted too. */
  const persist = (note) => { if (isSaved()) Store.savePackageVersion(ctx.state.pkg, note); };

  const renderAll = () => {
    const current = ctx.state.pkg;
    const validation = ctx.state.validation;
    const meta = ctx.state.generationMeta;
    const badge = engineBadge();
    const engineTone = badge.tone === 'gold' ? 'qv-chip--gold' : badge.tone === 'cyan' ? 'qv-chip--cyan' : '';
    const stats = packageStats(current);
    const warn = packageWarnings(current);
    const versions = isSaved() ? Store.versionList(current.quiz_id) : [];
    const editingId = ctx.state.editingId || null;

    const failureRows = validation && Object.keys(validation.byCode).length
      ? Object.entries(validation.byCode).map(([code, count]) => `<span class="qv-chip qv-chip--coral qv-small">${esc(code)} × ${count}</span>`).join('')
      : '<span class="qv-chip qv-chip--green qv-small">All checks passed</span>';

    const optionKeys = ['A', 'B', 'C', 'D'];

    const editForm = (q) => `
      <div class="qv-qlist-item ${current.language === 'hi' ? 'qv-hi-font' : ''}" style="border-color:var(--qv-gold-400);gap:12px">
        <div class="qv-field">
          <span class="qv-label">${esc(t('preview.questionLabel'))}</span>
          <textarea class="qv-input" id="qv-edit-question" rows="2">${esc(q.question)}</textarea>
        </div>
        <div class="qv-grid qv-grid--2" style="gap:10px">
          ${optionKeys.map((key) => `
            <label class="qv-field">
              <span class="qv-label">${key}</span>
              <input class="qv-input" id="qv-edit-opt-${key}" value="${esc(q.options[key] || '')}">
            </label>`).join('')}
        </div>
        <div class="qv-field">
          <span class="qv-label">${esc(t('preview.correctIs'))}</span>
          <div class="qv-chip-radio" id="qv-edit-correct">
            ${optionKeys.map((key) => `
              <label><input type="radio" name="edit-correct" value="${key}" ${key === q.correct_option ? 'checked' : ''}><span>${key}</span></label>`).join('')}
          </div>
        </div>
        <label class="qv-field">
          <span class="qv-label">${esc(t('preview.explanationLabel'))}</span>
          <textarea class="qv-input" id="qv-edit-explanation" rows="2">${esc(q.explanation || '')}</textarea>
        </label>
        <label class="qv-field">
          <span class="qv-label">${esc(t('preview.clueLabel'))}</span>
          <input class="qv-input" id="qv-edit-clue" value="${esc(q.clue || '')}">
        </label>
        <div id="qv-edit-failures"></div>
        <div class="qv-row">
          <button class="qv-btn qv-btn--primary qv-btn--sm" id="qv-edit-save">💾 ${esc(t('preview.saveEdit'))}</button>
          <button class="qv-btn qv-btn--sm" id="qv-edit-cancel">${esc(t('preview.cancel'))}</button>
        </div>
      </div>`;

    const questionRow = (q, index) => {
      if (editingId === q.question_id) return editForm(q);
      const source = q.source_reference;
      return `
      <div class="qv-qlist-item ${current.language === 'hi' ? 'qv-hi-font' : ''}">
        <div class="qv-row qv-row--between">
          <div class="qv-row qv-small">
            <span class="qv-chip qv-small">${index + 1}</span>
            <span class="qv-chip qv-chip--green qv-small">✔ ${esc(q.options[q.correct_option] || '')}</span>
            ${q.concept_tag ? `<span class="qv-chip qv-small">${esc(q.concept_tag)}</span>` : ''}
            ${q.origin === 'teacher' ? `<span class="qv-chip qv-chip--gold qv-small">✏️ ${esc(t('preview.edited'))}</span>` : ''}
            ${q.origin === 'ai' ? '<span class="qv-chip qv-chip--cyan qv-small">🤖 AI</span>' : ''}
            ${q.origin === 'reserve' ? `<span class="qv-chip qv-chip--cyan qv-small">${esc(t('preview.reservesLeft'))}</span>` : ''}
          </div>
          <div class="qv-row">
            <button class="qv-btn qv-btn--sm qv-btn--ghost" data-edit="${esc(q.question_id)}">✏️ ${esc(t('preview.edit'))}</button>
            <button class="qv-btn qv-btn--sm qv-btn--ghost" data-regen="${esc(q.question_id)}">🔄 ${esc(t('preview.regenerateOne'))}</button>
            <button class="qv-btn qv-btn--sm qv-btn--ghost" data-del="${esc(q.question_id)}">🗑 ${esc(t('preview.deleteQuestion'))}</button>
          </div>
        </div>
        <div style="font-weight:700">${esc(q.question)}</div>
        <div class="qv-small qv-muted">${esc(q.simple_explanation || q.explanation || '')}</div>
        ${source && source.excerpt ? `
          <details class="qv-small qv-muted">
            <summary style="cursor:pointer">🔎 ${esc(t('preview.why'))}</summary>
            <div style="margin-top:6px;padding-left:12px;border-left:2px solid var(--qv-cyan-400)">
              <div>${esc(t('preview.excerpt'))}${source.page ? ` · ${esc(t('preview.page'))} ${esc(source.page)}` : ''}${source.section ? ` · ${esc(source.section)}` : ''}</div>
              <div style="margin-top:4px">“${esc(source.excerpt)}”</div>
            </div>
          </details>` : ''}
      </div>`;
    };

    ctx.root.innerHTML = `
    <div class="qv-shell qv-screen">
      ${ctx.header()}
      <div class="qv-card">
        <div class="qv-row qv-row--between">
          <div>
            <h1 class="qv-h2 ${current.language === 'hi' ? 'qv-hi-font' : ''}">${esc(current.title)}</h1>
            <p class="qv-sub qv-small">${esc(current.subject)} · ${esc(current.topic)} · ${esc(t('create.class'))} ${current.class_level} · ${current.language === 'hi' ? 'हिंदी' : 'English'}</p>
          </div>
          <div class="qv-row">
            <span class="qv-chip qv-chip--gold">${stats.questions} ${esc(t('preview.questions'))}</span>
            <span class="qv-chip">${esc(t('game.stage'))} ${current.stages.length}</span>
            <span class="qv-chip">${current.settings.timer_seconds ? `⏱ ${current.settings.timer_seconds}s` : esc(t('stage.noTimer'))}</span>
            <span class="qv-chip qv-chip--cyan">${esc(t('preview.version'))} ${current.version || 1}</span>
            <span class="qv-chip">${esc(current.source_type)}</span>
            ${versions.length > 1 ? `
              <select class="qv-select" id="qv-version" style="min-height:40px;padding:8px 34px 8px 12px;width:auto">
                ${versions.map((v) => `<option value="${v.version}" ${v.version === (current.version || 1) ? 'selected' : ''}>v${v.version} · ${v.questions} Q${v.note ? ` · ${esc(v.note.slice(0, 28))}` : ''}</option>`).join('')}
              </select>` : ''}
          </div>
        </div>
        <hr class="qv-divider">
        <div class="qv-row qv-row--between">
          <div class="qv-row">
            <span class="qv-chip qv-chip--green">✔ ${validation ? validation.stats.passed : stats.questions} ${esc(t('preview.validated'))}</span>
            <span class="qv-chip qv-small">${stats.reserves} ${esc(t('preview.reserves'))}</span>
            ${failureRows}
          </div>
          <div class="qv-row">
            <button class="qv-btn qv-btn--ghost qv-btn--sm" id="qv-regen">🔄 ${esc(t('preview.regenerate'))}</button>
            <button class="qv-btn qv-btn--sm" id="qv-save" ${isSaved() ? 'disabled' : ''}>${isSaved() ? '✔ Saved' : `💾 ${esc(t('preview.save'))}`}</button>
            <button class="qv-btn qv-btn--primary qv-btn--lg" id="qv-start">🚀 ${esc(t('preview.start'))}</button>
          </div>
        </div>
        ${ctx.state.validationNote ? `<p class="qv-small qv-muted" style="margin-top:10px">${esc(t('preview.note'))}: ${esc(ctx.state.validationNote)}</p>` : ''}
        ${warn.warnings.length ? `
          <div class="qv-card qv-card--flat" style="margin-top:12px;border-color:rgba(245,179,1,.4)">
            <div class="qv-label">⚠ ${esc(t('preview.warnings'))}</div>
            <div class="qv-small" style="margin-top:6px">${warn.warnings.map((w) => `<div>• ${esc(w)}</div>`).join('')}</div>
          </div>` : ''}
      </div>

      ${meta ? `
      <div class="qv-card qv-card--flat">
        <div class="qv-row qv-row--between">
          <div class="qv-label">${esc(t('loading.pipeline'))}</div>
          ${ctx.state.aiError ? `<span class="qv-chip qv-chip--coral qv-small">${esc(t('pipeline.fallback'))}</span>` : ''}
        </div>
        <div class="qv-row" style="margin-top:10px">
          <span class="qv-chip qv-small ${engineTone}">${esc(t('pipeline.engine'))}: ${esc(ctx.state.engine || 'offline')}</span>
          <span class="qv-chip qv-small">${esc(t('pipeline.model'))}: ${esc(current.generation_meta.model || '—')}</span>
          <span class="qv-chip qv-small">${esc(t('pipeline.calls'))}: ${meta.calls ?? 0}</span>
          <span class="qv-chip qv-small qv-chip--green">${esc(t('pipeline.repairs'))}: ${meta.repairs ?? 0}</span>
          <span class="qv-chip qv-small ${meta.dropped ? 'qv-chip--coral' : ''}">${esc(t('pipeline.dropped'))}: ${meta.dropped ?? 0}</span>
          ${meta.latencyMs ? `<span class="qv-chip qv-small">${esc(t('pipeline.latency'))}: ${(meta.latencyMs / 1000).toFixed(1)}s</span>` : ''}
        </div>
      </div>` : ''}

      ${current.stages.map((stage) => `
        <div class="qv-card">
          <div class="qv-row qv-row--between">
            <h2 class="qv-h3">${esc(t('game.stage'))} ${stage.stage} · ${esc(stage.name)}</h2>
            <span class="qv-chip qv-small">${esc(String(stage.difficulty).replace('_', ' '))} · ${stage.question_ids.length} ${esc(t('preview.questions'))}</span>
          </div>
          <div class="qv-grid" style="gap:10px;margin-top:14px">
            ${stage.question_ids.map((id, i) => {
              const q = current.questions.find((x) => x.question_id === id);
              return q ? questionRow(q, i) : '';
            }).join('')}
          </div>
        </div>`).join('')}
    </div>`;

    /* ---------------- handlers ---------------- */
    $('#qv-start', ctx.root).onclick = () => { Sound.play('button'); ctx.go('name'); };
    $('#qv-save', ctx.root).onclick = () => {
      Store.addQuiz(ctx.state.pkg);
      Sound.play('correct');
      toast(`${t('preview.save')} ✔`);
      renderAll();
    };
    $('#qv-regen', ctx.root).onclick = () => {
      Sound.play('button');
      const req = ctx.state.request || { mode: 'topic', classLevel: current.class_level, topic: current.topic, count: 15 };
      ctx.state.request = { ...req, classLevel: current.class_level };
      ctx.go('loading');
    };

    const versionSelect = $('#qv-version', ctx.root);
    if (versionSelect) {
      versionSelect.onchange = () => {
        const chosen = Store.versionPackage(current.quiz_id, versionSelect.value);
        if (!chosen) return;
        Sound.play('button');
        ctx.state.pkg = chosen;
        ctx.state.validation = null;
        ctx.state.editingId = null;
        renderAll();
      };
    }

    $$('[data-edit]', ctx.root).forEach((btn) => {
      btn.onclick = () => { Sound.play('button'); ctx.state.editingId = btn.dataset.edit; renderAll(); };
    });
    $$('[data-del]', ctx.root).forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.del;
        const res = deleteQuestion(ctx.state.pkg, id);
        if (!res.ok) { toast(res.message || t('preview.lastQuestion')); return; }
        Sound.play('correct');
        ctx.state.pkg = res.pkg;
        ctx.state.editingId = null;
        persist(`Question ${id} removed by the teacher.`);
        toast(t('preview.deleted'));
        renderAll();
      };
    });
    $$('[data-regen]', ctx.root).forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.regen;
        Sound.play('button');
        toast(t('preview.regenerating'));
        const res = await regenerateQuestion({ pkg: ctx.state.pkg, questionId: id, settings: Store.settings() });
        if (!res.ok) { toast(res.message || t('preview.noReplacement')); return; }
        ctx.state.pkg = res.pkg;
        persist(`Question ${id} regenerated (${res.source}).`);
        Sound.play('correct');
        toast(res.source === 'ai' ? t('preview.replacedAI') : t('preview.replacedReserve'));
        renderAll();
      };
    });

    const saveBtn = $('#qv-edit-save', ctx.root);
    if (saveBtn) {
      const cancelBtn = $('#qv-edit-cancel', ctx.root);
      if (cancelBtn) cancelBtn.onclick = () => { ctx.state.editingId = null; renderAll(); };
      saveBtn.onclick = () => {
        const questionId = ctx.state.editingId;
        const options = {};
        optionKeys.forEach((key) => { options[key] = $(`#qv-edit-opt-${key}`, ctx.root).value.trim(); });
        const patch = {
          question: $('#qv-edit-question', ctx.root).value.trim(),
          options,
          correct_option: $('input[name="edit-correct"]:checked', ctx.root)?.value,
          explanation: $('#qv-edit-explanation', ctx.root).value.trim(),
          simple_explanation: $('#qv-edit-explanation', ctx.root).value.trim(),
          clue: $('#qv-edit-clue', ctx.root).value.trim(),
        };
        const res = updateQuestion(ctx.state.pkg, questionId, patch);
        if (!res.ok) {
          const box = $('#qv-edit-failures', ctx.root);
          if (box) {
            box.innerHTML = `<div class="qv-feedback qv-feedback--wrong" style="padding:10px 12px">
              <strong>${esc(t('preview.editFailed'))}</strong>
              <div class="qv-small" style="margin-top:6px">${res.failures.map((f) => `• <code>${esc(f.code)}</code> — ${esc(f.detail)}`).join('<br>')}</div>
            </div>`;
          }
          Sound.play('wrong');
          return;
        }
        ctx.state.pkg = res.pkg;
        ctx.state.editingId = null;
        persist(`Question ${questionId} edited by the teacher.`);
        Sound.play('correct');
        toast(t('preview.editSaved'));
        renderAll();
      };
    }
  };

  renderAll();
  return null;
}

/* ------------------------------------------------------------------ */
/* S12 — dashboard                                                     */
/* ------------------------------------------------------------------ */

export function dashboard(ctx) {
  const quizzes = Store.quizzes();
  const analytics = Store.analytics();

  const analyticsBlock = !analytics ? `
    <div class="qv-card qv-center qv-muted">${esc(t('dash.noData'))}</div>` : `
    <div class="qv-card">
      <div class="qv-row qv-row--between">
        <h2 class="qv-h2">${esc(t('dash.analytics'))}</h2>
        <span class="qv-chip qv-small">${analytics.plays} ${esc(t('dash.plays'))}</span>
      </div>
      <div class="qv-stat-grid" style="margin-top:14px">
        <div class="qv-stat"><div class="qv-stat__value">${analytics.avgScore}</div><div class="qv-stat__label">${esc(t('dash.avgScore'))}</div></div>
        <div class="qv-stat"><div class="qv-stat__value">${analytics.avgAccuracy}%</div><div class="qv-stat__label">${esc(t('dash.avgAccuracy'))}</div></div>
        <div class="qv-stat"><div class="qv-stat__value">${analytics.wins}</div><div class="qv-stat__label">🏆 Winner</div></div>
        <div class="qv-stat"><div class="qv-stat__value">${fmtTime(analytics.avgTime)}</div><div class="qv-stat__label">${esc(t('result.time'))}</div></div>
      </div>

      ${analytics.weakConcepts.length ? `
      <hr class="qv-divider">
      <div class="qv-label">${esc(t('dash.insight'))}</div>
      <div style="display:grid;gap:10px;margin-top:10px">
        ${analytics.weakConcepts.map((c) => `
          <div>
            <div class="qv-row qv-row--between qv-small"><span>${esc(c.tag)}</span><span class="qv-coral">${c.accuracy}%</span></div>
            <div class="qv-bar"><div class="qv-bar__fill is-weak" style="width:${Math.max(4, c.accuracy)}%"></div></div>
          </div>`).join('')}
      </div>` : ''}

      ${analytics.mostMissed ? `
      <hr class="qv-divider">
      <div class="qv-label">${esc(t('dash.mostMissed'))}</div>
      <div class="qv-small" style="margin-top:8px">
        <strong>${esc(Store.questionText(analytics.mostMissed.question_id) || analytics.mostMissed.question_id)}</strong>
        <div class="qv-muted">${analytics.mostMissed.wrong} / ${analytics.mostMissed.total} attempts wrong</div>
      </div>` : ''}
    </div>`;

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-row qv-row--between">
      <h1 class="qv-h2">${esc(t('dash.title'))}</h1>
      <button class="qv-btn qv-btn--primary" data-action="go-create">+ ${esc(t('landing.create'))}</button>
    </div>

    <div class="qv-card">
      <h2 class="qv-h2">${esc(t('dash.myQuizzes'))}</h2>
      ${quizzes.length ? `
      <div class="qv-grid qv-grid--3" style="margin-top:14px">
        ${quizzes.map((q) => `
          <div class="qv-card qv-card--flat">
            <div class="qv-row qv-row--between">
              <span class="qv-chip qv-chip--gold qv-small">${esc(t('create.class'))} ${q.class_level}</span>
              <span class="qv-chip qv-small">${q.question_count} Q</span>
            </div>
            <h3 class="qv-h3" style="margin-top:10px">${esc(q.title)}</h3>
            <p class="qv-sub qv-small">${esc(q.subject)} · ${q.language === 'hi' ? 'हिंदी' : 'English'} · ${q.plays || 0} ${esc(t('dash.plays'))}</p>
            <div class="qv-row" style="margin-top:12px">
              <button class="qv-btn qv-btn--sm qv-btn--primary" data-play="${esc(q.quiz_id)}">▶ ${esc(t('dash.play'))}</button>
              <button class="qv-btn qv-btn--sm qv-btn--ghost" data-del="${esc(q.quiz_id)}">🗑 ${esc(t('dash.delete'))}</button>
            </div>
          </div>`).join('')}
      </div>` : `<p class="qv-sub qv-small" style="margin-top:10px">${esc(t('dash.empty'))}</p>`}
    </div>

    ${analyticsBlock}

    ${analytics && analytics.rows.length ? `
    <div class="qv-card">
      <h2 class="qv-h2">${esc(t('dash.results'))}</h2>
      <div style="overflow:auto">
        <table class="qv-table">
          <thead><tr>
            <th>Student</th><th>${esc(t('game.score'))}</th><th>${esc(t('result.accuracy'))}</th>
            <th>${esc(t('result.stage'))}</th><th>${esc(t('result.time'))}</th><th>${esc(t('result.lifelines'))}</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${analytics.rows.slice(0, 40).map((r) => `
              <tr>
                <td>${esc(r.student_name)}</td>
                <td class="qv-gold">${r.score}</td>
                <td>${r.accuracy}%</td>
                <td>${r.stage_reached}/5</td>
                <td>${fmtTime(r.time_taken_seconds)}</td>
                <td>${r.lifelines_used.length}</td>
                <td>${r.status === 'WINNER' ? '🏆 Winner' : r.status === 'NOT_CLEARED' ? '🌟 Effort' : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  </div>`;

  $$('[data-play]', ctx.root).forEach((btn) => {
    btn.onclick = () => {
      const pkg = Store.getQuiz(btn.dataset.play);
      if (!pkg) return;
      Sound.play('button');
      ctx.state.pkg = pkg;
      ctx.go('name');
    };
  });
  $$('[data-del]', ctx.root).forEach((btn) => {
    btn.onclick = () => {
      Store.removeQuiz(btn.dataset.del);
      toast(t('dash.delete'));
      ctx.go('dashboard');
    };
  });
  return null;
}

export default { landing, create, loading, settings, preview, dashboard };
