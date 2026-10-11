// Bottom sheets: arrastar para fechar, pontos de parada, fundo que fecha, Esc e botão voltar (History API).
import { h, clamp, haptic, HOJE, parseISO, isoLocal, MESES, dmy, addDays } from '../util.js';
import { icon } from '../icons.js';

const stack = [];
let seq = 0;
const host = () => document.getElementById('sheets') || document.body.appendChild(h('div', { id: 'sheets' }));

if (history.state && history.state.nxSheet) history.replaceState(null, '');
window.addEventListener('popstate', () => {
  const cur = (history.state && history.state.nxSheet) || 0;
  while (stack.length && stack[stack.length - 1].id > cur) stack[stack.length - 1]._dismiss();
});
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); top.close(); }
  if (e.key === 'Tab') trapFocus(top.el, e);
});
function trapFocus(el, e) {
  const f = [...el.querySelectorAll('button,[href],input,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
export const sheetsOpen = () => stack.length;
export async function closeAll() {
  if (!stack.length) return;
  const n = stack.length, p = stack[0]._closed;
  history.go(-n);
  await Promise.race([p, new Promise((r) => setTimeout(r, 400))]);
  while (stack.length) stack[stack.length - 1]._dismiss();
}

export function openSheet({ title, content, footer, size = 'auto', snap = false, onClose, label, className = '', headerExtra } = {}) {
  const id = ++seq;
  const prevFocus = document.activeElement;
  const titleEl = h('h2', { class: 'sheet-title', id: 'sh-t' + id }, title || '');
  const closeBtn = h('button', { class: 'icon-btn sheet-x', type: 'button', 'aria-label': 'Fechar', onclick: () => s.close() }, icon('x'));
  const head = h('header', { class: 'sheet-head' + (title ? '' : ' is-bare') }, h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }, h('span')), h('div', { class: 'sheet-headrow' }, titleEl, headerExtra || null, closeBtn));
  const body = h('div', { class: 'sheet-body' });
  const foot = h('footer', { class: 'sheet-foot' });
  const panel = h('section', { class: `sheet sheet--${size} ${snap ? 'sheet--snap' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sh-t' + id, 'aria-label': label || null, tabindex: '-1' }, head, body, foot);
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: () => s.close() });
  let resolveClosed;
  const s = {
    id, el: panel, body, foot, offset: 0, closing: false,
    _closed: new Promise((r) => { resolveClosed = r; }),
    setTitle(t) { titleEl.textContent = t; },
    setContent(c) { body.replaceChildren(...[c].flat(Infinity).filter(Boolean)); },
    setFooter(f) { foot.replaceChildren(...[].concat(f || []).filter(Boolean)); foot.hidden = !f; },
    close() {
      if (s.closing) return s._closed;
      const i = stack.indexOf(s);
      if (i < 0) return s._closed;
      const n = stack.length - i;
      if (history.state && history.state.nxSheet) history.go(-n); else s._dismiss();
      setTimeout(() => { if (!s.closing) s._dismiss(); }, 450);
      return s._closed;
    },
    _dismiss() {
      if (s.closing) return;
      s.closing = true;
      const i = stack.indexOf(s);
      if (i >= 0) stack.splice(i, 1);
      panel.classList.remove('is-open'); backdrop.classList.remove('is-open');
      panel.style.removeProperty('--off');
      const done = () => { panel.remove(); backdrop.remove(); };
      panel.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 420);
      if (!stack.length) document.documentElement.classList.remove('has-sheet');
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      onClose && onClose();
      resolveClosed();
    },
    expand() { setOff(0); },
  };
  s.setContent(content);
  s.setFooter(footer);
  history.pushState({ nxSheet: id }, '');
  stack.push(s);
  document.documentElement.classList.add('has-sheet');
  host().append(backdrop, panel);
  const setOff = (v) => { s.offset = v; panel.style.setProperty('--off', v + 'px'); };
  requestAnimationFrame(() => {
    if (snap) setOff(Math.round(panel.offsetHeight * 0.42));
    requestAnimationFrame(() => { backdrop.classList.add('is-open'); panel.classList.add('is-open'); });
    setTimeout(() => {
      const af = panel.querySelector('[autofocus]');
      (af && matchMedia('(pointer:fine)').matches || af && af.dataset.forceFocus ? af : panel).focus({ preventScroll: true });
    }, 80);
  });
  drag(panel, head, body, backdrop, s, snap, setOff);
  return s;
}

function drag(panel, head, body, backdrop, s, snap, setOff) {
  let y0 = 0, dy = 0, t0 = 0, base = 0, on = false;
  const start = (y) => { on = true; y0 = y; dy = 0; t0 = performance.now(); base = s.offset; panel.classList.add('is-drag'); };
  const move = (y) => {
    dy = y - y0;
    let off = base + dy;
    if (off < 0) off = off / 4;
    panel.style.setProperty('--off', off + 'px');
    backdrop.style.setProperty('--fade', String(clamp(1 - off / panel.offsetHeight, 0, 1)));
  };
  const end = () => {
    if (!on) return;
    on = false;
    panel.classList.remove('is-drag');
    backdrop.style.removeProperty('--fade');
    const v = dy / Math.max(1, performance.now() - t0), off = base + dy, H = panel.offsetHeight, half = Math.round(H * 0.42);
    if (snap) {
      if (off > half + 90 || (v > 0.7 && base > 0)) { haptic(8); s.close(); return; }
      if (v < -0.4 || off < half / 2) setOff(0); else if (v > 0.4 || off > half / 2) setOff(half); else setOff(0);
      return;
    }
    if (off > Math.min(150, H * 0.3) || (v > 0.5 && dy > 24)) { haptic(8); s.close(); } else setOff(0);
  };
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    head.setPointerCapture(e.pointerId); start(e.clientY);
  });
  head.addEventListener('pointermove', (e) => { if (on) move(e.clientY); });
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  let ty = 0, tracking = false;
  body.addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; tracking = !e.target.closest('[data-no-sheet-drag]'); }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const y = e.touches[0].clientY, d = y - ty;
    if (!on) {
      const atTop = body.scrollTop <= 0;
      if ((atTop && d > 8) || (snap && s.offset > 0 && d < -8)) start(y);
      else if (Math.abs(d) > 8) { tracking = false; return; }
      else return;
    }
    e.preventDefault();
    move(y);
  }, { passive: false });
  body.addEventListener('touchend', () => { tracking = false; end(); });
  body.addEventListener('touchcancel', () => { tracking = false; end(); });
}

// Menu de ações (toque no item abre as opções)
export function openMenu({ title, subtitle, header, items }) {
  const list = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((it) => h('button', {
      class: 'menu-item' + (it.tone ? ' tone-' + it.tone : ''), role: 'menuitem', type: 'button', disabled: it.disabled,
      onclick: async () => { await s.close(); it.onClick && it.onClick(); },
    }, h('span', { class: 'menu-ico' }, icon(it.icon || 'chevR')), h('span', { class: 'menu-label' }, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null)));
  const s = openSheet({ title, content: [subtitle ? h('p', { class: 'menu-sub' }, subtitle) : null, header || null, list] });
  return s;
}

export function confirmSheet({ title, content, confirm = 'Confirmar', tone = 'primary', cancel = 'Voltar' }) {
  return new Promise((res) => {
    let ok = false;
    const s = openSheet({
      title, content,
      footer: h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => s.close() }, cancel),
        h('button', { class: 'btn btn--' + tone, type: 'button', autofocus: true, onclick: () => { ok = true; haptic(15); s.close(); } }, confirm)),
      onClose: () => res(ok),
    });
  });
}

// Seletor rico (substitui <select>): busca, grupos, ícones
export function pick({ title, items, value, search, emptyText = 'Nada encontrado', action }) {
  return new Promise((res) => {
    let chosen;
    const useSearch = search ?? items.length > 7;
    const list = h('div', { class: 'pick-list', role: 'listbox', 'aria-label': title });
    const draw = (t = '') => {
      const nt = t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      const f = items.filter((i) => !nt || (i.label + ' ' + (i.sub || '') + ' ' + (i.group || '')).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(nt));
      const out = [];
      let g = null;
      for (const i of f) {
        if (i.group && i.group !== g) { g = i.group; out.push(h('div', { class: 'pick-group' }, g)); }
        const sel = i.value === value;
        out.push(h('button', {
          class: 'pick-item' + (sel ? ' is-sel' : '') + (i.indent ? ' is-indent' : ''), type: 'button', role: 'option', 'aria-selected': String(sel),
          onclick: () => { chosen = i.value; haptic(6); s.close(); },
        }, i.icon ? h('span', { class: 'pick-ico' + (i.tone ? ' tone-' + i.tone : '') }, icon(i.icon)) : null,
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-label' }, i.label), i.sub ? h('span', { class: 'pick-sub' }, i.sub) : null),
        i.right ? h('span', { class: 'pick-right num' }, i.right) : null,
        sel ? icon('check', 'pick-check') : null));
      }
      list.replaceChildren(...(out.length ? out : [h('p', { class: 'pick-empty' }, emptyText)]));
    };
    draw();
    const sInput = useSearch ? h('label', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'Buscar', 'aria-label': 'Buscar', autofocus: true, oninput: (e) => draw(e.target.value) })) : null;
    const s = openSheet({
      title, size: items.length > 9 ? 'tall' : 'auto',
      content: [sInput, list],
      footer: action ? h('button', { class: 'btn btn--ghost btn--full', type: 'button', onclick: async () => { await s.close(); action.onClick(); } }, icon(action.icon || 'plus'), action.label) : null,
      onClose: () => res(chosen),
    });
  });
}

// Seletor de data próprio
export function pickDate({ title = 'Data', value, min, max } = {}) {
  return new Promise((res) => {
    let chosen;
    let cur = parseISO(value || HOJE); cur.setDate(1);
    const grid = h('div', { class: 'cal-grid', role: 'grid' });
    const label = h('span', { class: 'cal-month', 'aria-live': 'polite' });
    const choose = (iso) => { chosen = iso; haptic(6); s.close(); };
    const draw = () => {
      label.textContent = MESES[cur.getMonth()] + ' ' + cur.getFullYear();
      const first = new Date(cur), start = new Date(first); start.setDate(1 - first.getDay());
      const cells = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d));
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const iso = isoLocal(d), out = d.getMonth() !== cur.getMonth(), dis = (min && iso < min) || (max && iso > max);
        cells.push(h('button', {
          class: 'cal-day' + (out ? ' is-out' : '') + (iso === HOJE ? ' is-today' : '') + (iso === value ? ' is-sel' : ''),
          type: 'button', disabled: dis, 'aria-label': dmy(iso), 'aria-pressed': String(iso === value), onclick: () => choose(iso),
        }, String(d.getDate())));
      }
      grid.replaceChildren(...cells);
    };
    draw();
    const nav = (n) => { cur.setMonth(cur.getMonth() + n); draw(); };
    const quick = [['Ontem', addDays(HOJE, -1)], ['Hoje', HOJE], ['Amanhã', addDays(HOJE, 1)]]
      .filter(([, d]) => (!min || d >= min) && (!max || d <= max))
      .map(([l, d]) => h('button', { class: 'chip' + (d === value ? ' is-sel' : ''), type: 'button', onclick: () => choose(d) }, l));
    const s = openSheet({
      title,
      content: [h('div', { class: 'chip-row' }, quick),
        h('div', { class: 'cal-head' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mês anterior', onclick: () => nav(-1) }, icon('chevL')), label,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Próximo mês', onclick: () => nav(1) }, icon('chevR'))),
        grid],
      onClose: () => res(chosen),
    });
  });
}
