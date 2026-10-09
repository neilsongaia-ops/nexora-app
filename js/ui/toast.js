// Toasts e "desfazer" no cliente
import { h, haptic } from '../util.js';
import { icon } from '../icons.js';

const host = () => document.getElementById('toasts');

export function toast(msg, { tone = '', action, duration = 3600, ico } = {}) {
  const el = h('div', { class: 'toast' + (tone ? ' tone-' + tone : ''), role: tone === 'danger' ? 'alert' : 'status' },
    ico || tone ? icon(ico || (tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'help'), 'toast-ico') : null,
    h('span', { class: 'toast-msg' }, msg),
    action ? h('button', { class: 'toast-act', type: 'button', onclick: () => { action.onClick(); dismiss(); } }, action.label) : null);
  host().append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let t = setTimeout(dismiss, duration);
  el.addEventListener('pointerenter', () => clearTimeout(t));
  el.addEventListener('pointerleave', () => { t = setTimeout(dismiss, 1500); });
  function dismiss() { clearTimeout(t); el.classList.remove('is-in'); setTimeout(() => el.remove(), 300); }
  return dismiss;
}

// Executa depois de alguns segundos, a menos que a pessoa toque em "Desfazer".
export function undoable(msg, run, { delay = 5000 } = {}) {
  return new Promise((res) => {
    let undone = false;
    haptic(15);
    toast(msg, { action: { label: 'Desfazer', onClick: () => { undone = true; res(null); } }, duration: delay, ico: 'clock' });
    setTimeout(async () => { if (undone) return; try { res(await run()); } catch (e) { toast(e.message, { tone: 'danger' }); res(null); } }, delay);
  });
}

// Selo de sucesso animado
export function successBurst(container, text = 'Pronto') {
  const el = h('div', { class: 'success-burst', role: 'status' }, h('span', { class: 'success-ring' }, icon('check')), h('span', { class: 'success-text' }, text));
  container.append(el);
  haptic([10, 40, 18]);
  return new Promise((r) => setTimeout(() => { el.remove(); r(); }, 900));
}
