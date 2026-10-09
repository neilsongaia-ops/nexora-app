// Componentes básicos: botão, chip, selo, valor, item de lista, campos, seletores, medidores, estados.
import { h, money, r2, dmy, relDate, HOJE, initials, reduced, debounce } from '../util.js';
import { icon } from '../icons.js';
import { pick, pickDate } from './sheet.js';
import { load } from '../api.js';

export function btn(label, { icon: ic, kind = 'primary', size, onClick, type = 'button', full, aria, disabled, cls = '' } = {}) {
  return h('button', { class: `btn btn--${kind}${size ? ' btn--' + size : ''}${full ? ' btn--full' : ''} ${cls}`, type, onclick: onClick, 'aria-label': aria, disabled },
    ic ? icon(ic) : null, label ? h('span', { class: 'btn-label' }, label) : null);
}
export const iconBtn = (ic, label, onClick, { kind = '', cls = '', badge } = {}) =>
  h('button', { class: `icon-btn ${kind ? 'icon-btn--' + kind : ''} ${cls}`, type: 'button', 'aria-label': label, title: label, onclick: onClick }, icon(ic), badge ? h('span', { class: 'dot-badge' }) : null);
export const chip = (label, { selected, onClick, ic, tone, aria, cls = '' } = {}) =>
  h('button', { class: `chip${selected ? ' is-sel' : ''}${tone ? ' tone-' + tone : ''} ${cls}`, type: 'button', 'aria-pressed': selected != null ? String(!!selected) : null, onclick: onClick, 'aria-label': aria }, ic ? icon(ic) : null, h('span', {}, label));
export const badge = (text, tone = 'neutral', ic) => h('span', { class: 'badge tone-' + tone }, ic ? icon(ic) : null, text);

export const TIPO = {
  ENTRADA: { label: 'Entrada', tone: 'in', icon: 'in', sign: 1 },
  SAIDA: { label: 'Saída', tone: 'out', icon: 'out', sign: -1 },
  TRANSFERENCIA: { label: 'Transferência', tone: 'xfer', icon: 'swap', sign: 0 },
};
export const STATUS = {
  PLANEJADO: { label: 'Planejado', tone: 'neutral', icon: 'calendar' },
  PENDENTE: { label: 'Pendente', tone: 'warn', icon: 'clock' },
  EFETIVADO: { label: 'Efetivado', tone: 'in', icon: 'check' },
  CANCELADO: { label: 'Cancelado', tone: 'muted', icon: 'ban' },
  ESTORNADO: { label: 'Estornado', tone: 'muted', icon: 'undo' },
};
export const FATURA = {
  ABERTA: { label: 'Aberta', tone: 'xfer' }, FECHADA: { label: 'Fechada', tone: 'warn' }, PARCIALMENTE_PAGA: { label: 'Paga em parte', tone: 'warn' },
  PAGA: { label: 'Paga', tone: 'in' }, VENCIDA: { label: 'Vencida', tone: 'out' }, CANCELADA: { label: 'Cancelada', tone: 'muted' },
};
export const statusBadge = (s) => { const m = STATUS[s]; return m ? badge(m.label, m.tone, m.icon) : null; };
export const tipoIcon = (tipo, extra = '') => { const m = TIPO[tipo] || TIPO.SAIDA; return h('span', { class: `tipo-ico tone-${m.tone} ${extra}`, role: 'img', 'aria-label': m.label }, icon(m.icon)); };

// Valor com sinal e cor (nunca só cor: sempre com sinal)
export function amount(v, { tipo, sign, strike, cls = '' } = {}) {
  let n = Number(v) || 0, tone = '';
  if (tipo) { const m = TIPO[tipo]; tone = m.tone; if (m.sign) n = Math.abs(n) * m.sign; }
  else if (sign) tone = n < 0 ? 'out' : n > 0 ? 'in' : '';
  return h('span', { class: `amount num ${tone ? 'tone-' + tone : ''} ${strike ? 'is-strike' : ''} ${cls}` }, money(n, { sign: !!(tipo || sign) && tipo !== 'TRANSFERENCIA' }));
}

// Item de lista acessível; recebe filhos livres
export function row({ lead, title, sub, trail, trailSub, onClick, aria, cls = '', badges }) {
  const el = h('div', { class: 'row ' + cls, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null, 'aria-label': aria || null },
    lead ? h('div', { class: 'row-lead' }, lead) : null,
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title), sub || badges ? h('div', { class: 'row-sub' }, badges || null, sub ? h('span', { class: 'row-subtext' }, sub) : null) : null),
    trail != null ? h('div', { class: 'row-trail' }, trail, trailSub ? h('div', { class: 'row-trailsub' }, trailSub) : null) : null);
  if (onClick) {
    el.addEventListener('click', (e) => { if (el.dataset.suppress) { delete el.dataset.suppress; return; } onClick(e); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } });
  }
  return el;
}
export const sectionHead = (title, action) => h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, title), action || null);
export const card = (cls, ...kids) => h('div', { class: 'card ' + (cls || '') }, ...kids);

export const empty = ({ ic = 'list', title, action }) => h('div', { class: 'empty' }, h('span', { class: 'empty-ico' }, icon(ic)), h('p', { class: 'empty-title' }, title), action || null);
export const errorState = (msg, retry) => h('div', { class: 'empty is-error', role: 'alert' }, h('span', { class: 'empty-ico' }, icon('wifiOff')), h('p', { class: 'empty-title' }, msg || 'Não foi possível carregar.'), retry ? btn('Tentar de novo', { kind: 'secondary', icon: 'refresh', onClick: retry }) : null);
export const skel = (cls = '') => h('span', { class: 'skel ' + cls, 'aria-hidden': 'true' });
export const skelRows = (n = 6) => h('div', { class: 'skel-list', 'aria-busy': 'true', 'aria-label': 'Carregando' }, Array.from({ length: n }, () => h('div', { class: 'row' }, h('div', { class: 'row-lead' }, skel('skel-circle')), h('div', { class: 'row-main' }, skel('skel-line w-60'), skel('skel-line w-35 sm')), skel('skel-line w-20'))));
export const skelCards = (n = 3, cls = '') => h('div', { class: 'skel-cards ' + cls, 'aria-busy': 'true', 'aria-label': 'Carregando' }, Array.from({ length: n }, () => h('div', { class: 'card' }, skel('skel-line w-40 sm'), skel('skel-line w-70 lg'), skel('skel-line w-50 sm'))));

// Dica curta "?" — padrão único do app
let openTip = null;
export function tip(text) {
  const b = h('button', { class: 'tip', type: 'button', 'aria-label': 'Ajuda: ' + text, 'aria-expanded': 'false' }, icon('help'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openTip) { openTip.remove(); const was = openTip._for === b; openTip = null; if (was) return; }
    const r = b.getBoundingClientRect();
    const pop = h('div', { class: 'tip-pop', role: 'tooltip' }, text);
    pop._for = b;
    document.body.append(pop);
    const w = pop.offsetWidth;
    pop.style.setProperty('--x', Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px');
    pop.style.setProperty('--y', (r.bottom + 8) + 'px');
    b.setAttribute('aria-expanded', 'true');
    openTip = pop;
    const off = () => { pop.remove(); b.setAttribute('aria-expanded', 'false'); if (openTip === pop) openTip = null; document.removeEventListener('click', off); };
    setTimeout(() => document.addEventListener('click', off), 0);
  });
  return b;
}

// Campos
export function field(label, control, { error, tipText, cls = '', id } = {}) {
  const err = h('span', { class: 'field-err', role: 'alert' }, error || '');
  const wrap = h('div', { class: 'field ' + cls }, h('div', { class: 'field-top' }, h('label', { class: 'field-label', for: id || null }, label), tipText ? tip(tipText) : null), control, err);
  wrap.setError = (m) => { err.textContent = m || ''; wrap.classList.toggle('is-err', !!m); };
  if (error) wrap.classList.add('is-err');
  return wrap;
}
let fid = 0;
export function textField(label, { value = '', placeholder, type = 'text', inputmode, autocomplete, onInput, maxlength, autofocus, tipText, enterkeyhint, multiline, rows = 4 } = {}) {
  const id = 'f' + (++fid);
  const input = h(multiline ? 'textarea' : 'input', { id, class: 'input', type: multiline ? null : type, value, placeholder, inputmode, autocomplete: autocomplete || 'off', maxlength, autofocus, enterkeyhint, rows: multiline ? rows : null, oninput: (e) => onInput && onInput(e.target.value) });
  const f = field(label, input, { tipText, id });
  f.input = input;
  return f;
}

// Máscara de moeda: dígitos entram pelos centavos (R$ 1.234,56)
export function moneyField(label, { value = 0, onChange, big, autofocus, allowZero = true, tipText } = {}) {
  const id = 'f' + (++fid);
  let cents = Math.round((Number(value) || 0) * 100);
  const fmt = () => (cents ? money(cents / 100) : '');
  const input = h('input', { id, class: 'input input--money' + (big ? ' is-big' : ''), type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'R$\u00a00,00', value: fmt(), autofocus, enterkeyhint: 'next' });
  input.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
      e.preventDefault();
      const d = (e.data || '').replace(/\D/g, '');
      if (!d) return;
      cents = Math.min(99999999999, Number(String(cents) + d));
    } else if (e.inputType.startsWith('delete')) { e.preventDefault(); cents = Math.floor(cents / 10); } else return;
    input.value = fmt();
    onChange && onChange(cents / 100);
  });
  input.addEventListener('input', () => { const d = input.value.replace(/\D/g, ''); cents = Number(d || 0); input.value = fmt(); onChange && onChange(cents / 100); });
  input.addEventListener('focus', () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length)));
  const f = field(label, input, { tipText, id, cls: big ? 'field--big' : '' });
  f.input = input;
  f.get = () => cents / 100;
  f.set = (v) => { cents = Math.round((Number(v) || 0) * 100); input.value = fmt(); };
  return f;
}

// Campo que abre um seletor rico em sheet
export function pickField(label, { value, items, placeholder = 'Escolher', onChange, title, tipText, action, display, ic } = {}) {
  const id = 'f' + (++fid);
  let cur = value;
  const txt = h('span', { class: 'pickf-text' });
  const ico = h('span', { class: 'pickf-ico' });
  const b = h('button', { id, class: 'input input--pick', type: 'button', 'aria-haspopup': 'listbox' }, ico, txt, icon('chevD', 'pickf-chev'));
  const getItems = () => (typeof items === 'function' ? items() : items);
  const draw = () => {
    const it = getItems().find((i) => i.value === cur);
    txt.textContent = display ? display(cur, it) : it ? it.label : placeholder;
    txt.classList.toggle('is-ph', !it && !display);
    ico.replaceChildren(it && it.icon ? icon(it.icon) : ic ? icon(ic) : '');
    ico.className = 'pickf-ico' + (it && it.tone ? ' tone-' + it.tone : '');
  };
  b.addEventListener('click', async () => {
    const v = await pick({ title: title || label, items: getItems(), value: cur, action });
    if (v !== undefined) { cur = v; draw(); onChange && onChange(v); }
  });
  draw();
  const f = field(label, b, { tipText, id });
  f.input = b; f.get = () => cur; f.set = (v) => { cur = v; draw(); }; f.redraw = draw;
  return f;
}

export function dateField(label, { value = HOJE, onChange, min, max, tipText } = {}) {
  const id = 'f' + (++fid);
  let cur = value;
  const txt = h('span', { class: 'pickf-text' });
  const b = h('button', { id, class: 'input input--pick', type: 'button' }, h('span', { class: 'pickf-ico' }, icon('calendar')), txt, icon('chevD', 'pickf-chev'));
  const draw = () => { const r = relDate(cur); txt.textContent = r === dmy(cur) ? dmy(cur) : `${r[0].toUpperCase() + r.slice(1)} · ${dmy(cur)}`; };
  b.addEventListener('click', async () => { const v = await pickDate({ title: label, value: cur, min, max }); if (v) { cur = v; draw(); onChange && onChange(v); } });
  draw();
  const f = field(label, b, { tipText, id });
  f.input = b; f.get = () => cur; f.set = (v) => { cur = v; draw(); };
  return f;
}

export function segmented(options, { value, onChange, aria, cls = '' } = {}) {
  let cur = value;
  const el = h('div', { class: 'seg ' + cls, role: 'radiogroup', 'aria-label': aria });
  const btns = options.map((o) => h('button', {
    class: 'seg-btn' + (o.tone ? ' tone-' + o.tone : ''), type: 'button', role: 'radio', disabled: o.disabled,
    onclick: () => set(o.value, true),
  }, o.icon ? icon(o.icon) : null, h('span', {}, o.label)));
  el.append(...btns, h('span', { class: 'seg-thumb', 'aria-hidden': 'true' }));
  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = options.findIndex((o) => o.value === cur), n = options.length;
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    set(options[j].value, true); btns[j].focus();
  });
  function set(v, user) {
    cur = v;
    const i = options.findIndex((o) => o.value === v);
    btns.forEach((b, k) => { b.setAttribute('aria-checked', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    el.style.setProperty('--i', String(Math.max(0, i)));
    el.style.setProperty('--n', String(options.length));
    if (user && onChange) onChange(v);
  }
  set(cur);
  el.get = () => cur; el.set = (v) => set(v);
  return el;
}

export function stepper({ value = 1, min = 1, max = 99, step = 1, onChange, format = (v) => String(v), label = 'Quantidade', small }) {
  let v = value;
  const out = h('output', { class: 'step-val num', 'aria-live': 'polite' });
  const set = (n) => { v = Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)); out.textContent = format(v); dec.disabled = v <= min; inc.disabled = v >= max; onChange && onChange(v); };
  const dec = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Diminuir ' + label, onclick: (e) => { e.stopPropagation(); set(v - step); } }, icon('minus'));
  const inc = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Aumentar ' + label, onclick: (e) => { e.stopPropagation(); set(v + step); } }, icon('plus'));
  const el = h('div', { class: 'stepper' + (small ? ' stepper--sm' : ''), role: 'group', 'aria-label': label }, dec, out, inc);
  out.textContent = format(v); dec.disabled = v <= min; inc.disabled = v >= max;
  el.get = () => v; el.set = (n) => { v = n; out.textContent = format(v); };
  return el;
}

export function toggle(label, { checked, onChange, disabled, sub } = {}) {
  let on = !!checked;
  const sw = h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' }));
  const b = h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(on), disabled, onclick: () => { on = !on; b.setAttribute('aria-checked', String(on)); onChange && onChange(on); } },
    h('span', { class: 'toggle-text' }, h('span', { class: 'toggle-label' }, label), sub ? h('span', { class: 'toggle-sub' }, sub) : null), sw);
  b.get = () => on;
  return b;
}

export const avatar = (name, cls = '') => h('span', { class: 'avatar ' + cls, 'aria-hidden': 'true' }, initials(name));

// Barra de progresso planejado × realizado (com excedido)
export function progress(planejado, realizado, { label } = {}) {
  const p = Math.max(0, Number(planejado) || 0), r = Math.max(0, Number(realizado) || 0);
  const over = r > p, track = Math.max(p, r) || 1;
  const fill = Math.min(r, p) / track, ex = over ? (r - p) / track : 0;
  const ratio = p ? r / p : r ? 2 : 0;
  const el = h('div', { class: 'meter' + (over ? ' is-over' : ratio > 0.85 ? ' is-near' : ''), role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(p), 'aria-valuenow': String(r), 'aria-label': label || 'Realizado' },
    h('span', { class: 'meter-fill' }), over ? h('span', { class: 'meter-over' }) : null, over ? h('span', { class: 'meter-mark' }) : null);
  el.style.setProperty('--fill', String(fill));
  el.style.setProperty('--over', String(ex));
  el.style.setProperty('--start', String(fill));
  return el;
}

// Contador animado de valor
export function countUp(el, to, { from = 0, dur = 700, fmt = money } = {}) {
  el.textContent = fmt(to);
  if (reduced() || document.hidden) return;
  el.textContent = fmt(from);
  const t0 = performance.now();
  setTimeout(() => { el.textContent = fmt(to); }, dur + 100);
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// Miniatura de produto: carrega em lotes via produtos.imagens
const imgCache = new Map(); let imgQueue = new Set(), imgTimer = null; const imgWait = new Map();
export function thumb(p, cls = '') {
  const el = h('span', { class: 'thumb ' + cls, 'aria-hidden': 'true' }, h('span', { class: 'thumb-ph' }, initials(p.nome || p.descricao || '')));
  if (!p.id || !p.tem_imagem && p.tem_imagem !== undefined) return el;
  const put = (d) => { if (d && d.dados) { const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' }); img.src = d.dados; img.onload = () => el.classList.add('has-img'); el.append(img); } };
  if (imgCache.has(p.id)) { put(imgCache.get(p.id)); return el; }
  (imgWait.get(p.id) || imgWait.set(p.id, []).get(p.id)).push(put);
  imgQueue.add(p.id);
  clearTimeout(imgTimer);
  imgTimer = setTimeout(flushImgs, 60);
  return el;
}
async function flushImgs() {
  const ids = [...imgQueue]; imgQueue = new Set();
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    try {
      const r = await load('produtos.imagens', { ids: lote });
      lote.forEach((id) => { imgCache.set(id, r[id] || null); (imgWait.get(id) || []).forEach((f) => f(r[id])); imgWait.delete(id); });
    } catch { lote.forEach((id) => imgWait.delete(id)); }
  }
}
export const forgetImg = (id) => imgCache.delete(id);

// Busca com atraso
export function searchBox({ placeholder = 'Buscar', value = '', onSearch, id }) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': placeholder, value, id, enterkeyhint: 'search' });
  const fire = debounce((v) => onSearch(v.trim()), 350);
  input.addEventListener('input', () => fire(input.value));
  const el = h('label', { class: 'search' }, icon('search'), input);
  el.input = input;
  return el;
}

export const kv = (k, v, cls = '') => h('div', { class: 'kv ' + cls }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v' }, v));
export const formError = () => { const e = h('div', { class: 'form-err', role: 'alert', hidden: true }); e.show = (m) => { e.hidden = !m; e.replaceChildren(m ? icon('alert') : '', m ? h('span', {}, m) : ''); }; return e; };
export const r2s = r2;
