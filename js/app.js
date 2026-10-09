// Shell do app: sessão, roteador por hash, navegação (barra inferior / lateral), FAB, atalhos, tema, offline.
import { h, qs, ls, on, emit, haptic } from './util.js';
import { icon } from './icons.js';
import { DEMO, session, setSession, clearSession, invalidate, load, call } from './api.js';
import { store, loadBoot, can } from './store.js';
import { openSheet, closeAll, sheetsOpen, openMenu } from './ui/sheet.js';
import { toast } from './ui/toast.js';
import { errorState, skelCards, btn, textField, formError, badge, avatar } from './ui/components.js';
import { pullToRefresh } from './ui/gestures.js';
import { applyTema } from './tema.js';

const NAV = [
  { id: 'inicio', label: 'Início', icon: 'home', key: '1' },
  { id: 'lancamentos', label: 'Lançamentos', icon: 'list', key: '2' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', key: '3', more: true },
  { id: 'contas', label: 'Contas e cartões', short: 'Contas', icon: 'wallet', key: '4' },
  { id: 'planejamentos', label: 'Planejamentos', icon: 'target', key: '5', more: true },
  { id: 'compras', label: 'Compras', icon: 'cart', key: '6' },
  { id: 'nota', label: 'Nota fiscal', icon: 'receipt', key: '7', more: true },
  { id: 'admin', label: 'Administração', icon: 'shield', more: true, admin: true },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings', more: true },
];
const SCREENS = {
  inicio: () => import('./telas/inicio.js'), lancamentos: () => import('./telas/lancamentos.js'), agenda: () => import('./telas/agenda.js'),
  contas: () => import('./telas/contas.js'), planejamentos: () => import('./telas/planejamentos.js'), compras: () => import('./telas/compras.js'),
  nota: () => import('./telas/nota.js'), admin: () => import('./telas/admin.js'), ajustes: () => import('./telas/ajustes.js'),
};
const FAB_ON = new Set(['inicio', 'lancamentos', 'agenda', 'contas']);
const view = qs('#view');
let cleanups = [], seq = 0, current = null;

export const go = async (path) => { await closeAll(); if (location.hash !== '#' + path) location.hash = path; else route(); };
const parse = () => {
  const raw = location.hash.slice(1) || '/inicio';
  const [path, qstr] = raw.split('?');
  const p = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: p[0] || 'inicio', params: p.slice(1), query: new URLSearchParams(qstr || '') };
};

// ---------- topo ----------
export function setTitle(title, { back, sub, actions = [] } = {}) {
  qs('#top-title').textContent = title;
  document.title = title + ' · Nexora';
  const s = qs('#top-sub'); s.hidden = !sub; s.textContent = sub || '';
  const b = qs('#top-back');
  b.hidden = !back;
  b.replaceChildren(icon('chevL'));
  b.onclick = back ? () => (typeof back === 'function' ? back() : go(back)) : null;
  qs('#top-actions').replaceChildren(...actions.filter(Boolean));
  qs('#top').classList.toggle('has-back', !!back);
}
function setFab(cfg) {
  const f = qs('#fab');
  if (!cfg || !can('editor')) { f.hidden = true; return; }
  f.hidden = false;
  f.replaceChildren(icon(cfg.icon || 'plus'), h('span', { class: 'fab-label' }, cfg.label));
  f.setAttribute('aria-label', cfg.label);
  f.onclick = () => { haptic(10); cfg.onClick(); };
}
export const novoLancamento = async (opts) => (await import('./telas/lancForm.js')).openLancForm(opts);

// ---------- navegação ----------
function spaceButton(compact) {
  const e = store.boot && store.boot.espaco;
  if (!e) return h('span');
  return h('button', { class: 'space-btn' + (compact ? ' is-compact' : ''), type: 'button', 'aria-label': `Espaço ${e.nome}. Trocar espaço`, onclick: switchSpace },
    avatar(e.nome, 'avatar--space'), compact ? null : h('span', { class: 'space-txt' }, h('span', { class: 'space-name' }, e.nome), h('span', { class: 'space-role' }, { leitura: 'Somente leitura', editor: 'Editor', admin: 'Admin' }[e.papel] || '')), compact ? null : icon('chevD'));
}
function renderNav() {
  const items = NAV.filter((n) => !n.admin || store.admin);
  qs('#side-nav').replaceChildren(...items.map((n) => h('a', { class: 'side-link', href: '#/' + n.id, dataset: { nav: n.id }, title: n.label }, icon(n.icon), h('span', { class: 'side-label' }, n.label), n.key ? h('kbd', { class: 'side-kbd' }, n.key) : null)));
  const tabs = items.filter((n) => !n.more).map((n) => h('a', { class: 'tab', href: '#/' + n.id, dataset: { nav: n.id } }, icon(n.icon), h('span', {}, n.short || n.label)));
  tabs.push(h('button', { class: 'tab', type: 'button', dataset: { nav: 'mais' }, 'aria-haspopup': 'dialog', onclick: () => openMenu({ title: 'Mais', items: items.filter((n) => n.more).map((n) => ({ icon: n.icon, label: n.label, onClick: () => go('/' + n.id) })) }) }, icon('more'), h('span', {}, 'Mais')));
  qs('#tabs').replaceChildren(...tabs);
  qs('#side-space').replaceChildren(spaceButton(false));
  qs('#top-space').replaceChildren(spaceButton(true));
  const u = store.boot.usuario;
  qs('#side-foot').replaceChildren(h('a', { class: 'side-user', href: '#/ajustes' }, avatar(u.nome || u.email), h('span', { class: 'side-user-txt' }, h('span', { class: 'side-user-name' }, u.nome || 'Perfil'), h('span', { class: 'side-user-mail' }, u.email))), DEMO ? h('button', { class: 'chip chip--demo', type: 'button', onclick: openDemo }, icon('settings'), h('span', {}, 'Demonstração')) : null);
}
function markNav(name) {
  const more = NAV.find((n) => n.id === name && n.more);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === name || (more && a.dataset.nav === 'mais' && a.closest('#tabs'));
    a.classList.toggle('is-active', !!on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
async function switchSpace() {
  const s = openSheet({ title: 'Espaços', content: skelCards(2) });
  try {
    const list = await load('ws.listar');
    s.setContent(h('div', { class: 'menu' }, list.map((w) => h('button', { class: 'menu-item' + (w.id === session.ws ? ' is-sel' : ''), type: 'button', onclick: async () => { await s.close(); if (w.id !== session.ws) changeSpace(w.id); } },
      avatar(w.nome, 'avatar--space'), h('span', { class: 'menu-label' }, w.nome, h('span', { class: 'menu-hint' }, { leitura: 'Somente leitura', editor: 'Editor', admin: 'Admin' }[w.papel])), w.id === session.ws ? icon('check') : null))));
    s.setFooter(btn('Novo espaço', { kind: 'ghost', icon: 'plus', full: true, onClick: async () => { await s.close(); createSpace(); } }));
  } catch (e) { s.setContent(errorState(e.message, () => { s.close(); switchSpace(); })); }
}
export async function changeSpace(id) {
  setSession({ ws: id }); invalidate();
  view.replaceChildren(skelCards(3));
  try { await loadBoot(); renderNav(); toast('Espaço: ' + store.boot.espaco.nome, { ico: 'spaces' }); go('/inicio'); route(); } catch (e) { view.replaceChildren(errorState(e.message, () => changeSpace(id))); }
}
export function createSpace(first) {
  const err = formError();
  let nome = '';
  const f = textField('Nome do espaço', { placeholder: 'Ex.: Casa', autofocus: true, onInput: (v) => { nome = v; } });
  const b = btn('Criar espaço', { full: true, onClick: () => submit() });
  const submit = async () => {
    if (!nome.trim()) { f.setError('Dê um nome'); return; }
    b.disabled = true;
    try { const w = await call('ws.criar', { nome: nome.trim() }, { semEspaco: true }); await s.close(); changeSpace(w.id); } catch (e) { err.show(e.message); } finally { b.disabled = false; }
  };
  f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const s = openSheet({ title: first ? 'Crie seu primeiro espaço' : 'Novo espaço', content: [err, f], footer: b });
}

// ---------- roteamento ----------
async function route() {
  if (!store.boot) return;
  const my = ++seq;
  const { name, params, query } = parse();
  if (!SCREENS[name] || (name === 'admin' && !store.admin)) { location.replace('#/inicio'); return; }
  cleanups.forEach((f) => { try { f(); } catch { /* noop */ } }); cleanups = [];
  current = name;
  markNav(name);
  document.documentElement.classList.toggle('focus-mode', name === 'compras' && params[0] === 'sessao');
  const nav = NAV.find((n) => n.id === name);
  setTitle(nav ? nav.label : 'Nexora');
  setFab(FAB_ON.has(name) ? { label: 'Novo lançamento', onClick: () => novoLancamento() } : null);
  view.classList.remove('is-in');
  view.replaceChildren(skelCards(3));
  const ctx = {
    view, params, query, go, setTitle, setFab, alive: () => my === seq,
    onCleanup: (f) => cleanups.push(f), refresh: () => { invalidate(); return route(); },
  };
  try {
    const mod = await SCREENS[name]();
    if (my !== seq) return;
    view.replaceChildren();
    await mod.default(ctx);
  } catch (e) {
    if (my === seq) view.replaceChildren(errorState(e.message || 'Não foi possível abrir esta tela.', () => route()));
  }
  if (my !== seq) return;
  requestAnimationFrame(() => view.classList.add('is-in'));
  window.scrollTo(0, 0);
}
on('recarregar', () => route());
on('dados', () => { invalidate(); if (current) route(); });

// ---------- erros globais ----------
on('api-erro', (e) => {
  if (e.codigo === 'LOGIN') {
    if (!qs('#auth').hidden) return;
    ls.set('nx.retorno', location.hash || '#/inicio');
    clearSession();
    toast(e.error || 'Entre de novo para continuar.', { ico: 'lock' });
    showLogin();
  } else if (e.codigo === 'CONFLITO') {
    toast('Alguém alterou isto antes de você. Os dados foram recarregados.', { tone: 'warn', ico: 'refresh', duration: 5000 });
    invalidate();
  } else if (e.codigo === 'SEM_ESPACO') createSpace(true);
});

// ---------- login / inicialização ----------
async function showLogin() {
  qs('#app').hidden = true; qs('#boot').hidden = true;
  const a = qs('#auth'); a.hidden = false;
  await closeAll();
  (await import('./telas/login.js')).default(a, async () => { a.hidden = true; a.replaceChildren(); await boot(); const r = ls.get('nx.retorno', ''); ls.del('nx.retorno'); if (r) location.hash = r.slice(1); });
}
async function boot() {
  qs('#boot').hidden = false;
  try {
    await loadBoot();
  } catch (e) {
    qs('#boot').hidden = true;
    if (e.codigo === 'LOGIN') return;
    if (e.codigo === 'SEM_BANCO') return showSemBanco();
    if (e.codigo === 'SEM_ESPACO') { qs('#app').hidden = false; return; }
    const a = qs('#auth'); a.hidden = false;
    a.replaceChildren(h('div', { class: 'auth-card' }, errorState(e.message, () => { a.hidden = true; boot(); })));
    return;
  }
  qs('#boot').hidden = true;
  qs('#app').hidden = false;
  document.documentElement.classList.toggle('is-readonly', !can('editor'));
  renderNav();
  route();
}
function showSemBanco() {
  const a = qs('#auth'); a.hidden = false;
  const b = btn('Preparar banco de dados', { full: true, icon: 'refresh' });
  const err = formError();
  b.onclick = async () => { b.disabled = true; try { await call('sistema.iniciar'); a.hidden = true; boot(); } catch (e) { err.show(e.message); b.disabled = false; } };
  a.replaceChildren(h('div', { class: 'auth-card' }, h('span', { class: 'logo logo--lg' }, h('span', { class: 'logo-dot' })), h('h1', { class: 'auth-title' }, 'Quase lá'), err, b));
}
on('boot', () => { if (!qs('#app').hidden) { renderNav(); document.documentElement.classList.toggle('is-readonly', !can('editor')); } });
on('escrita', (a) => { if (/^(recursos|categorias|ws|config|perfil)\./.test(a)) loadBoot().catch(() => {}); });

// ---------- offline ----------
function net(msg) { const n = qs('#net'); n.hidden = !msg; n.replaceChildren(msg ? icon('wifiOff') : '', msg ? h('span', {}, msg) : ''); }
addEventListener('offline', () => net('Sem internet. Mostrando o que já foi carregado.'));
addEventListener('online', () => { net(''); toast('Conexão de volta.', { tone: 'success' }); });
on('offline-cache', () => net('Sem conexão. Mostrando dados salvos no aparelho.'));
if (!navigator.onLine) net('Sem internet. Mostrando o que já foi carregado.');

// ---------- atalhos ----------
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || sheetsOpen() || !store.boot || qs('#app').hidden) return;
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const n = NAV.find((x) => x.key === e.key);
  if (n) { e.preventDefault(); go('/' + n.id); return; }
  if (e.key === 'n' && can('editor')) { e.preventDefault(); novoLancamento(); }
  else if (e.key === '/') { const s = view.querySelector('input[type=search]'); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.key === 'r') { e.preventDefault(); emit('dados'); }
  else if (e.key === '?') { e.preventDefault(); atalhos(); }
});
function atalhos() {
  const rows = [['n', 'Novo lançamento'], ['/', 'Buscar'], ['1–7', 'Ir para as telas'], ['r', 'Atualizar'], ['Esc', 'Fechar painel'], ['?', 'Atalhos']];
  openSheet({ title: 'Atalhos de teclado', content: h('dl', { class: 'keys' }, rows.map(([k, l]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, l)])) });
}
async function openDemo() { (await import('./telas/ajustes.js')).openDemoPanel(); }

// ---------- início ----------
applyTema();
pullToRefresh(document.body, qs('#ptr'), async () => { invalidate(); await route(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
addEventListener('hashchange', route);
if (!session.token) showLogin(); else boot();
