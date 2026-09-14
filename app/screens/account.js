/**
 * QUIZVERSE — ACCOUNT SCREEN (teacher account + cloud sync)
 * ---------------------------------------------------------------------------
 * Local-first: the game never needs an account. Signing in only adds backup,
 * cross-device quizzes and school-wide results — and this screen says so plainly.
 */

import { t } from '../i18n.js';
import { esc, $, $$, toast } from '../ui.js';
import { Store } from '../store.js';
import { Sound } from '../audio.js';
import { Cloud } from '../cloud.js';

export function account(ctx) {
  const signedIn = Cloud.signedIn();
  const teacher = Cloud.teacher();
  const syncResult = ctx.state.syncResult || null;

  ctx.root.innerHTML = `
  <div class="qv-shell qv-screen">
    ${ctx.header()}
    <div class="qv-row qv-row--between">
      <h1 class="qv-h2">👤 ${esc(t('account.title'))}</h1>
      ${signedIn ? `<span class="qv-chip qv-chip--green qv-small">${esc(t('account.signedIn'))}</span>` : ''}
    </div>
    <p class="qv-sub" style="max-width:72ch">${esc(t('account.intro'))}</p>

    <div class="qv-grid qv-grid--2" style="align-items:start">
      <div class="qv-card" style="display:grid;gap:14px">
        ${signedIn ? `
          <div style="display:grid;gap:8px">
            <div class="qv-label">${esc(t('account.you'))}</div>
            <div class="qv-h3">${esc(teacher ? teacher.name : '')}</div>
            <div class="qv-sub qv-small">${esc(teacher && teacher.email ? teacher.email : '')}${teacher && teacher.school_name ? `<br>${esc(teacher.school_name)}` : ''}</div>
          </div>
          <div class="qv-row">
            <button class="qv-btn qv-btn--primary" id="qv-sync">🔄 ${esc(t('account.syncNow'))}</button>
            <button class="qv-btn qv-btn--ghost" id="qv-logout">${esc(t('account.logout'))}</button>
          </div>
          ${syncResult ? `
            <div class="qv-card qv-card--flat" style="border-color:${syncResult.ok ? 'rgba(34,197,94,.45)' : 'rgba(248,113,113,.45)'}">
              <div class="qv-small" style="line-height:1.6">
                ${syncResult.offline
                  ? `<span class="qv-coral">${esc(t('account.noServer'))}</span>`
                  : `<div>${esc(t('account.synced'))} — ${esc(t('account.quizzesPulled'))}: ${syncResult.summary.quizzesPulled} · ${esc(t('account.quizzesPushed'))}: ${syncResult.summary.quizzesPushed} · ${esc(t('account.resultsPushed'))}: ${syncResult.summary.resultsPushed}</div>
                     ${syncResult.errors.length ? `<div class="qv-coral" style="margin-top:6px">${syncResult.errors.map(esc).join('<br>')}</div>` : ''}`}
              </div>
            </div>` : ''}
        ` : `
          <div class="qv-tabs" style="align-self:flex-start">
            <button class="qv-tab is-active" data-mode="login">${esc(t('account.login'))}</button>
            <button class="qv-tab" data-mode="register">${esc(t('account.register'))}</button>
          </div>
          <div id="qv-register-fields" style="display:none;gap:14px">
            <label class="qv-field"><span class="qv-label">${esc(t('account.name'))}</span>
              <input class="qv-input" id="qv-name" autocomplete="name" placeholder="Sunita Maam"></label>
            <label class="qv-field"><span class="qv-label">${esc(t('account.school'))}</span>
              <input class="qv-input" id="qv-school" autocomplete="organization" placeholder="Sarita Vidya Mandir"></label>
          </div>
          <label class="qv-field"><span class="qv-label">${esc(t('account.email'))}</span>
            <input class="qv-input" id="qv-email" type="email" autocomplete="email"></label>
          <label class="qv-field"><span class="qv-label">${esc(t('account.password'))}</span>
            <input class="qv-input" id="qv-password" type="password" autocomplete="current-password"></label>
          <button class="qv-btn qv-btn--primary qv-btn--lg qv-btn--block" id="qv-submit">${esc(t('account.login'))} →</button>
          <div id="qv-auth-error" class="qv-small qv-coral" role="alert"></div>
        `}
      </div>

      <div class="qv-card" style="display:grid;gap:12px">
        <h2 class="qv-h3">${esc(t('account.whatYouGet'))}</h2>
        <div class="qv-small qv-muted" style="line-height:1.7">
          <div>✔ ${esc(t('account.benefit1'))}</div>
          <div>✔ ${esc(t('account.benefit2'))}</div>
          <div>✔ ${esc(t('account.benefit3'))}</div>
          <div>✔ ${esc(t('account.benefit4'))}</div>
        </div>
        <hr class="qv-divider">
        <div class="qv-label">${esc(t('account.privacy'))}</div>
        <div class="qv-small qv-muted">${esc(t('account.privacyText'))}</div>
        <div class="qv-small qv-muted">${esc(t('account.noServerHint'))}</div>
      </div>
    </div>
  </div>`;

  const setMode = (mode) => {
    $$('[data-mode]', ctx.root).forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    const regFields = $('#qv-register-fields', ctx.root);
    if (regFields) regFields.style.display = mode === 'register' ? 'grid' : 'none';
    const submit = $('#qv-submit', ctx.root);
    if (submit) submit.textContent = (mode === 'register' ? t('account.register') : t('account.login')) + ' →';
    ctx.state.accountMode = mode;
  };

  if (!signedIn) {
    $$('[data-mode]', ctx.root).forEach((b) => {
      b.onclick = () => { Sound.play('button'); setMode(b.dataset.mode); };
    });
    setMode(ctx.state.accountMode || 'login');

    $('#qv-submit', ctx.root).onclick = async () => {
      const mode = ctx.state.accountMode || 'login';
      const email = $('#qv-email', ctx.root).value.trim();
      const password = $('#qv-password', ctx.root).value;
      const error = $('#qv-auth-error', ctx.root);
      const button = $('#qv-submit', ctx.root);
      error.textContent = '';
      Sound.play('button');

      if (!email || password.length < 8) {
        error.textContent = t('account.passwordHint');
        return;
      }

      button.disabled = true;
      button.textContent = '…';
      const res = mode === 'register'
        ? await Cloud.register({ name: $('#qv-name', ctx.root).value.trim(), email, password, school: $('#qv-school', ctx.root).value.trim() })
        : await Cloud.login({ email, password });
      button.disabled = false;

      if (!res.ok) {
        error.textContent = res.message || t('error.generation');
        Sound.play('wrong');
        return;
      }
      Sound.play('correct');
      toast(t('account.signedInToast'));
      ctx.go('account');
    };
  } else {
    $('#qv-logout', ctx.root).onclick = async () => {
      await Cloud.logout();
      Sound.play('button');
      ctx.go('account');
    };
    $('#qv-sync', ctx.root).onclick = async () => {
      const button = $('#qv-sync', ctx.root);
      button.disabled = true;
      button.textContent = '…';
      const result = await Cloud.sync();
      button.disabled = false;
      button.textContent = '🔄 ' + t('account.syncNow');
      ctx.state.syncResult = result;
      Sound.play(result.ok ? 'correct' : 'wrong');
      ctx.go('account');
    };
  }

  return null;
}

export default account;
