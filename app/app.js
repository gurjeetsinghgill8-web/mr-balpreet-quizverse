/**
 * QUIZVERSE — APP BOOTSTRAP & ROUTER
 * ---------------------------------------------------------------------------
 * Wires the screens together, owns device settings, the game-show chrome
 * (header, sound, language, fullscreen) and browser history.
 */

import { t, setLang, getLang } from './i18n.js';
import { Store } from './store.js';
import { Sound } from './audio.js';
import { esc, $, $$, toast, tierFor, fullscreenToggle, prefersReducedMotion } from './ui.js';
import * as teacher from './screens/teacher.js';
import * as game from './screens/game.js';

const root = document.getElementById('qv-root');

const state = {
  pkg: null,
  request: null,
  validation: null,
  validationNote: null,
  lastResult: null,
  lastStudent: '',
  draft: null,
  cleanup: null,
  currentRoute: null,
};

/* ------------------------------------------------------------------ */
/* chrome                                                             */
/* ------------------------------------------------------------------ */

function header({ compact = false } = {}) {
  const s = Store.settings();
  const lang = getLang();
  return `
  <header class="qv-hud" style="margin-bottom:4px">
    <button class="qv-brand" data-action="go-landing" style="background:none;border:0;cursor:pointer">
      <span class="qv-brand__mark" aria-hidden="true">Q</span>
      <span style="text-align:left">
        <span class="qv-brand__name">${esc(t('app.name'))}</span><br>
        <span class="qv-brand__tag">${esc(t('app.tagline'))}</span>
      </span>
    </button>
    <div class="qv-spacer"></div>
    ${compact ? '' : `
      <button class="qv-btn qv-btn--sm qv-btn--ghost" data-action="go-dashboard">📊 ${esc(t('dash.title'))}</button>
      <button class="qv-btn qv-btn--sm qv-btn--ghost" data-action="go-settings" title="${esc(t('settings.title'))}">⚙</button>
      <button class="qv-btn qv-btn--sm qv-btn--primary" data-action="go-create">🎮 ${esc(t('landing.create'))}</button>`}
    <button class="qv-icon-btn" data-action="lang" title="${esc(t('common.language'))}" aria-label="${esc(t('common.language'))}">${lang === 'en' ? 'हिं' : 'EN'}</button>
    <button class="qv-icon-btn" data-action="sound" title="${esc(t('common.sound'))}" aria-label="${esc(t('common.sound'))}">${s.sound ? '🔊' : '🔇'}</button>
    ${compact ? '' : `
      <button class="qv-icon-btn" data-action="music" title="${esc(t('common.music'))}" aria-label="${esc(t('common.music'))}">${s.music ? '🎵' : '🎶'}</button>
      <button class="qv-icon-btn" data-action="effects" title="${esc(t('common.effects'))}" aria-label="${esc(t('common.effects'))}">${s.effects ? '✨' : '🚫'}</button>`}
    <button class="qv-icon-btn" data-action="fullscreen" title="${esc(t('common.fullscreen'))}" aria-label="${esc(t('common.fullscreen'))}">⛶</button>
  </header>`;
}

/* ------------------------------------------------------------------ */
/* router                                                             */
/* ------------------------------------------------------------------ */

const routes = {
  landing: teacher.landing,
  create: teacher.create,
  loading: teacher.loading,
  settings: teacher.settings,
  preview: teacher.preview,
  dashboard: teacher.dashboard,
  name: game.nameScreen,
  briefing: game.briefing,
  game: game.play,
  result: game.resultScreen,
  review: game.reviewScreen,
};

/** Screens have prerequisites; a stale hash must never crash the app. */
function guard(route) {
  if (['name', 'briefing'].includes(route) && !state.pkg) return 'landing';
  if (route === 'game') {
    if (game.hasSession()) return 'game';
    return state.pkg ? 'name' : 'landing';
  }
  if (['result', 'review'].includes(route) && !state.lastResult) return state.pkg ? 'name' : 'landing';
  if (route === 'preview' && !state.pkg) return 'create';
  if (route === 'loading' && !state.request) return 'create';
  return route;
}

function applyTier() {
  const level = state.pkg ? state.pkg.class_level : 5;
  root.setAttribute('data-tier', tierFor(level));
}

function render(route) {
  const target = guard(route);
  if (state.cleanup) { try { state.cleanup(); } catch { /* ignore */ } state.cleanup = null; }
  state.currentRoute = target;
  root.setAttribute('data-screen', target);
  applyTier();
  const screen = routes[target] || routes.landing;
  const cleanup = screen(ctx);
  state.cleanup = typeof cleanup === 'function' ? cleanup : null;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function go(route, params = {}) {
  const target = routes[route] ? route : 'landing';
  if (params && typeof params === 'object') Object.assign(state, params);
  const hash = `#/${target}`;
  if (location.hash !== hash) {
    location.hash = hash; // fires hashchange → render via the same path
    return;
  }
  render(target);
}

function onHashChange() {
  const route = location.hash.replace(/^#\/?/, '') || 'landing';
  if (route === state.currentRoute) return;
  render(route);
}

const ctx = {
  root,
  state,
  go,
  header,
  fullscreen: fullscreenToggle,
};

/* ------------------------------------------------------------------ */
/* delegated chrome actions                                            */
/* ------------------------------------------------------------------ */

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const settings = Store.settings();
  switch (action) {
    case 'go-landing': Sound.play('button'); go('landing'); break;
    case 'go-create': Sound.play('button'); go('create'); break;
    case 'go-settings': Sound.play('button'); go('settings'); break;
    case 'go-dashboard': Sound.play('button'); go('dashboard'); break;
    case 'fullscreen': Sound.play('button'); fullscreenToggle(); break;
    case 'lang': {
      const next = getLang() === 'en' ? 'hi' : 'en';
      setLang(next);
      Store.saveSettings({ uiLang: next });
      Sound.play('button');
      render(state.currentRoute || 'landing');
      break;
    }
    case 'sound': {
      const sound = !settings.sound;
      Store.saveSettings({ sound });
      Sound.apply({ sound });
      if (sound) Sound.unlock();
      render(state.currentRoute || 'landing');
      break;
    }
    case 'music': {
      const music = !settings.music;
      Store.saveSettings({ music });
      Sound.apply({ music });
      render(state.currentRoute || 'landing');
      break;
    }
    case 'effects': {
      const effects = !settings.effects;
      Store.saveSettings({ effects });
      Sound.apply({ effects });
      render(state.currentRoute || 'landing');
      break;
    }
    default: break;
  }
});

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  Store.init();
  const settings = Store.settings(); // device settings, not the whole store

  setLang(settings.uiLang || 'en');
  document.documentElement.dataset.motion = settings.reducedMotion || prefersReducedMotion() ? 'reduced' : 'standard';

  Sound.apply({
    sound: settings.sound,
    music: settings.music,
    effects: settings.effects,
    volume: settings.volume,
  });

  // Browsers only allow audio after a real gesture (§11.2).
  const unlock = () => {
    Sound.unlock();
    Sound.apply({});
    if (Store.settings().music) Sound.startMusic();
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  window.addEventListener('hashchange', onHashChange);

  const initial = location.hash.replace(/^#\/?/, '') || 'landing';
  if (location.hash !== `#/${initial}`) {
    history.replaceState(null, '', `#/${initial}`);
  }
  render(initial);

  // Second click on a lifeline / option in quick succession must not double-fire.
  window.addEventListener('error', (e) => {
    console.error('[QUIZVERSE]', e.error || e.message);
  });
}

window.QUIZVERSE = { state, go, render, Store, Sound, t };

boot();
