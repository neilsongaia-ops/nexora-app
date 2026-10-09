// Gestos: deslizar item, pressionar e segurar, puxar para atualizar, rolagem infinita. Toque e mouse.
import { h, haptic, clamp } from '../util.js';
import { icon } from '../icons.js';

// Envolve um item com ações reveladas ao deslizar. right = deslizar para a direita (ação à esquerda).
export function swipeable(content, { left, right } = {}) {
  if (!left && !right) return content;
  const act = (a, side) => a ? h('div', { class: `swipe-act swipe-act--${side} tone-${a.tone || 'neutral'}`, 'aria-hidden': 'true' }, icon(a.icon), h('span', {}, a.label)) : null;
  const wrap = h('div', { class: 'swipe' }, act(right, 'l'), act(left, 'r'), content);
  content.classList.add('swipe-content');
  let x0 = 0, y0 = 0, dx = 0, on = false, locked = null, pid = null, fired = false;
  const TH = 88;
  content.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button,input,a')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; on = true; locked = null; pid = e.pointerId; fired = false;
  });
  content.addEventListener('pointermove', (e) => {
    if (!on || e.pointerId !== pid) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (locked == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      locked = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y';
      if (locked === 'x') { content.setPointerCapture(pid); wrap.classList.add('is-drag'); }
    }
    if (locked !== 'x') return;
    dx = mx;
    if ((dx > 0 && !right) || (dx < 0 && !left)) dx = dx / 6;
    const lim = clamp(dx, -wrap.offsetWidth * 0.8, wrap.offsetWidth * 0.8);
    content.style.setProperty('--dx', lim + 'px');
    wrap.dataset.side = dx > 0 ? 'l' : 'r';
    const over = Math.abs(dx) > TH;
    if (over !== wrap.classList.contains('is-armed')) { wrap.classList.toggle('is-armed', over); if (over) haptic(8); }
  });
  const end = () => {
    if (!on) return;
    on = false;
    wrap.classList.remove('is-drag');
    if (locked === 'x') {
      content.dataset.suppress = '1';
      setTimeout(() => delete content.dataset.suppress, 50);
      const a = dx > TH ? right : dx < -TH ? left : null;
      if (a && !fired) { fired = true; haptic(18); a.run(); }
    }
    wrap.classList.remove('is-armed');
    content.style.setProperty('--dx', '0px');
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', end);
  content.style.touchAction = 'pan-y';
  return wrap;
}

export function longPress(el, fn, ms = 480) {
  let t = null, x = 0, y = 0;
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    x = e.clientX; y = e.clientY;
    t = setTimeout(() => { t = null; haptic(20); el.dataset.suppress = '1'; fn(e); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (t && (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8)) cancel(); });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); fn(e); });
}

// Puxar para atualizar (documento rolando no topo)
export function pullToRefresh(target, indicator, fn) {
  let y0 = 0, dy = 0, on = false, busy = false;
  const TH = 72;
  const set = (v) => { indicator.style.setProperty('--pull', v + 'px'); indicator.classList.toggle('is-armed', v >= TH); };
  target.addEventListener('touchstart', (e) => {
    if (busy || window.scrollY > 0 || document.documentElement.classList.contains('has-sheet')) return;
    y0 = e.touches[0].clientY; dy = 0; on = true;
  }, { passive: true });
  target.addEventListener('touchmove', (e) => {
    if (!on) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { set(0); return; }
    if (e.cancelable) e.preventDefault();
    indicator.classList.add('is-pulling');
    set(Math.min(120, dy * 0.5));
  }, { passive: false });
  target.addEventListener('touchend', async () => {
    if (!on) return;
    on = false;
    indicator.classList.remove('is-pulling');
    if (dy * 0.5 >= TH) {
      busy = true; haptic(12);
      indicator.classList.add('is-busy'); set(TH);
      try { await fn(); } finally { busy = false; indicator.classList.remove('is-busy'); set(0); }
    } else set(0);
  });
}

// Lista paginada por offset/limite com sentinela
export function infinite({ container, load, render, limite = (window.NEXORA_CONFIG || {}).pagina || 30, onEmpty, onError, skeleton }) {
  let offset = 0, total = Infinity, loading = false, dead = false;
  const sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true' });
  const more = h('div', { class: 'list-more' });
  container.after(more); more.append(sentinel);
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) next(); }, { rootMargin: '600px 0px' });
  async function next() {
    if (loading || dead || offset >= total) return;
    loading = true;
    const sk = skeleton ? skeleton() : null;
    if (sk) more.prepend(sk);
    try {
      const r = await load(offset, limite);
      if (dead) return;
      total = r.total;
      if (offset === 0 && !r.itens.length) onEmpty && onEmpty();
      render(r.itens, offset);
      offset += r.itens.length;
      if (!r.itens.length) total = offset;
    } catch (e) {
      if (!dead) onError && onError(e, next);
    } finally { loading = false; if (sk) sk.remove(); }
    if (offset < total && !dead) requestAnimationFrame(() => { const b = sentinel.getBoundingClientRect(); if (b.top < innerHeight + 600) next(); });
  }
  io.observe(sentinel);
  next();
  return { stop() { dead = true; io.disconnect(); more.remove(); }, get total() { return total; } };
}
