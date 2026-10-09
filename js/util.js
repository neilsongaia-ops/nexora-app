// Utilidades: DOM seguro, formatação pt-BR, datas ISO, armazenamento.
export const qs = (s, r = document) => r.querySelector(s);

// h(): cria elementos. Texto sempre via textNode (nunca innerHTML com dado da API).
// "html" só é aceito para SVG estático do próprio app (icons.js).
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') for (const s in v) el.style.setProperty(s, v[s]);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'ref') v(el);
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c) el.append(c);
  return el;
}

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const haptic = (p = 12) => { try { if (!reduced() && navigator.vibrate) navigator.vibrate(p); } catch { /* sem vibração */ } };
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* bloqueado */ } },
};
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const initials = (s = '') => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Dinheiro
const NF = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(v, o = {}) {
  const n = r2(v);
  const abs = 'R$\u00a0' + NF.format(Math.abs(n));
  if (n < 0) return '\u2212' + abs;
  if (o.sign && n > 0) return '+' + abs;
  return abs;
}
export function moneyShort(v) {
  const n = Math.abs(v), s = v < 0 ? '\u2212' : '';
  if (n >= 1e6) return s + 'R$\u00a0' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (n >= 1e3) return s + 'R$\u00a0' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return s + 'R$\u00a0' + Math.round(n);
}
export const num = (v, d = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v);
export const pct = (v, d = 0) => num(v, d) + '%';

// Datas (texto ISO aaaa-mm-dd)
const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export let HOJE = isoLocal(new Date());
export const setHoje = (d) => { if (d) HOJE = d.slice(0, 10); };
export const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d || 1); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoLocal(d); };
export const addMonths = (s, n) => { const d = parseISO(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return isoLocal(d); };
export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 864e5);
export const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
export const monthStart = (s = HOJE) => s.slice(0, 8) + '01';
export const monthEnd = (s = HOJE) => { const d = parseISO(s); return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const monthShort = (ym) => MESES[Number(ym.slice(5, 7)) - 1].slice(0, 3) + '/' + ym.slice(2, 4);
export const monthLong = (ym) => MESES[Number(ym.slice(5, 7)) - 1] + ' de ' + ym.slice(0, 4);
export function relDate(s) {
  if (!s) return '';
  const d = diffDays(s, HOJE);
  if (d === 0) return 'hoje';
  if (d === -1) return 'ontem';
  if (d === 1) return 'amanhã';
  if (d < 0 && d > -7) return `há ${-d} dias`;
  if (d > 0 && d < 7) return `em ${d} dias`;
  return dmy(s);
}
export function dayLabel(s) {
  const d = diffDays(s, HOJE);
  if (d === 0) return 'Hoje';
  if (d === -1) return 'Ontem';
  if (d === 1) return 'Amanhã';
  const w = SEM[parseISO(s).getDay()];
  return w[0].toUpperCase() + w.slice(1) + ', ' + dmy(s);
}
export const instant = (s) => (s ? dmy(s.slice(0, 10)) + ' ' + s.slice(11, 16) : '');

// Bloqueia duplo toque em ações de escrita
export async function busy(btn, fn) {
  if (btn && btn.getAttribute('aria-busy') === 'true') return;
  if (btn) { btn.setAttribute('aria-busy', 'true'); btn.disabled = true; }
  try { return await fn(); } finally { if (btn) { btn.removeAttribute('aria-busy'); btn.disabled = false; } }
}

// Rascunho de formulário (não perde dados ao fechar sem querer)
export function draft(key) {
  const k = 'nx.draft.' + key;
  return { get: () => ls.get(k, null), save: (v) => ls.set(k, v), clear: () => ls.del(k) };
}

// Eventos simples do app
const subs = {};
export const on = (ev, fn) => { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); };
export const emit = (ev, d) => (subs[ev] || []).forEach((f) => f(d));
