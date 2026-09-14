/**
 * QUIZVERSE — UI HELPERS
 * Small DOM utilities shared by every screen. No framework, no dependencies.
 */

/** Escape untrusted text before it enters innerHTML (teacher material, names). */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Age band → visual tier (§9.2). */
export function tierFor(classLevel) {
  const c = Number(classLevel);
  if (c <= 2) return 'A';
  if (c <= 5) return 'B';
  return 'C';
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSeconds(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return s >= 60 ? fmtTime(s) : `${s}s`;
}

/** Confetti: DOM particles, capped and self-cleaning (§13.1). */
export function confetti(container, { count = 90, duration = 2500, reduced = false } = {}) {
  if (!container || reduced) return;
  const total = Math.min(120, count);
  const colors = ['#F5B301', '#22D3EE', '#7C3AED', '#22C55E', '#F472B6', '#FFFFFF'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const bit = document.createElement('i');
    const size = 6 + Math.random() * 8;
    bit.className = 'qv-confetti__bit';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.width = `${size}px`;
    bit.style.height = `${size * (Math.random() > 0.5 ? 1 : 0.4)}px`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 900}ms`;
    bit.style.animationDuration = `${1400 + Math.random() * 1200}ms`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    frag.appendChild(bit);
  }
  container.appendChild(frag);
  setTimeout(() => { container.innerHTML = ''; }, duration + 1200);
}

export function burst(container, { count = 26, reduced = false } = {}) {
  if (!container || reduced) return;
  const total = Math.min(40, count);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const bit = document.createElement('i');
    const angle = (i / total) * Math.PI * 2;
    const dist = 40 + Math.random() * 90;
    bit.className = 'qv-burst__bit';
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    bit.style.background = i % 3 === 0 ? '#F5B301' : i % 3 === 1 ? '#22D3EE' : '#FFFFFF';
    frag.appendChild(bit);
  }
  container.appendChild(frag);
  setTimeout(() => { container.innerHTML = ''; }, 900);
}

let toastTimer = null;
export function toast(message, ms = 2600) {
  const node = document.getElementById('qv-toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), ms);
}

/** Tiny event delegation helper. */
export function on(root, eventName, selector, handler) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}

export function fullscreenToggle() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => toast('Fullscreen is blocked by the browser.'));
  } else {
    document.exitFullscreen?.();
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default { esc, $, $$, tierFor, fmtTime, fmtSeconds, confetti, burst, toast, on, fullscreenToggle };
