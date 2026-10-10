// Sino de notificações: contador de não lidas (nunca bloqueia a tela), lista em sheet e preferências de avisos.
import { h, relDate, uuid } from '../util.js';
import { icon } from '../icons.js';
import { call, session } from '../api.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { btn, badge, empty, errorState, skelRows } from './components.js';

// Ícone por tipo. Tipo desconhecido usa o sino.
const ICO = {
  CONVITE_RECEBIDO: 'mail', CONVITE_ACEITO: 'check', CONVITE_RECUSADO: 'x', PAPEL_ALTERADO: 'users',
  LANCAMENTO_MEMBRO: 'list', FATURA_VENCENDO: 'card', PLANEJAMENTO_80: 'target', PLANEJAMENTO_100: 'alert', QUEDA_PRECO: 'down',
};

// Destino do toque por tipo (rota do app). null = só informativa.
function destino(n) {
  const ref = String(n.ref_id || '').split(':');
  switch (n.tipo) {
    case 'LANCAMENTO_MEMBRO': return '/lancamentos';
    case 'FATURA_VENCENDO': return '/contas';
    case 'PLANEJAMENTO_80':
    case 'PLANEJAMENTO_100': return '/planejamentos';
    case 'QUEDA_PRECO': return ref[0] === 'prec' && ref[1] ? '/compras/produto/' + encodeURIComponent(ref[1]) : '/compras/produtos';
    default: return null;
  }
}

let naoLidas = 0;
let ultimoFetch = 0;
const bells = new Set();

function pinta() {
  for (const el of [...bells]) {
    if (!el.isConnected) { bells.delete(el); continue; }
    el._update(naoLidas);
  }
}

// Define o contador localmente (atualização otimista) e repinta todos os sinos.
export function setNaoLidas(n) { naoLidas = Math.max(0, n | 0); pinta(); }

// Busca o contador no servidor sem travar a tela. motivo 'foco' limita a 1×/min.
export async function refreshNotif(motivo) {
  if (!session.token) return;
  const agora = Date.now();
  if (motivo === 'foco' && agora - ultimoFetch < 60000) return;
  ultimoFetch = agora;
  try {
    const r = await call('notificacoes.contar', {}, { semEspaco: true });
    naoLidas = r.nao_lidas || 0;
    pinta();
  } catch {
    /* silencioso: o sino nunca pode atrasar nem derrubar a tela */
  }
}

// Monta um sino. variant 'top' (barra superior, mobile) ou 'side' (navegação lateral).
export function bellMount(variant) {
  const count = h('span', { class: 'bell-count num', 'aria-hidden': 'true' });
  const el = variant === 'side'
    ? h('button', { class: 'side-link bell bell--side', type: 'button', onclick: openNotifList }, icon('bell'), h('span', { class: 'side-label' }, 'Notificações'), count)
    : h('button', { class: 'icon-btn bell bell--top', type: 'button', onclick: openNotifList }, icon('bell'), count);
  el._update = (n) => {
    el.setAttribute('aria-label', n > 0 ? `Notificações, ${n} não ${n === 1 ? 'lida' : 'lidas'}` : 'Notificações');
    count.textContent = n > 99 ? '99+' : String(n);
    count.hidden = !n;
    el.classList.toggle('has-unread', n > 0);
  };
  el._update(naoLidas);
  bells.add(el);
  refreshNotif();
  return el;
}

export function openNotifList() {
  const s = openSheet({ title: 'Notificações', size: 'tall', content: skelRows(4) });
  let itens = [];
  const marcarTodas = btn('Marcar todas como lidas', { kind: 'ghost', size: 'sm', icon: 'check' });
  const prefs = btn('Preferências', { kind: 'ghost', size: 'sm', icon: 'settings', onClick: () => abrirPreferencias() });

  const draw = () => {
    const temNaoLida = itens.some((n) => !n.lida);
    marcarTodas.disabled = !temNaoLida;
    s.setFooter(h('div', { class: 'notif-foot' }, prefs, temNaoLida ? marcarTodas : null));
    if (!itens.length) { s.setContent(empty({ ic: 'bell', title: 'Nenhuma notificação' })); return; }
    s.setContent(h('div', { class: 'list list--flush notif-list' }, itens.map(notifRow)));
  };

  const notifRow = (n) => h('button', { class: 'notif' + (n.lida ? '' : ' is-unread'), type: 'button', onclick: () => abrir(n), 'aria-label': (n.lida ? '' : 'Não lida. ') + (n.titulo || 'Notificação') + (n.texto ? '. ' + n.texto : '') },
    h('span', { class: 'notif-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'notif-ico' }, icon(ICO[n.tipo] || 'bell')),
    h('span', { class: 'notif-main' },
      h('span', { class: 'notif-title' }, n.titulo || 'Notificação'),
      n.texto ? h('span', { class: 'notif-text' }, n.texto) : null,
      n.criada_em ? h('span', { class: 'notif-time num' }, relDate(n.criada_em)) : null),
    n.lida ? null : badge('Nova', 'in'));

  const marcarUma = async (n) => {
    if (n.lida) return;
    n.lida = true; setNaoLidas(naoLidas - 1); draw();
    try {
      const r = await call('notificacoes.marcar_lida', { id: n.id }, { semEspaco: true });
      setNaoLidas(r.nao_lidas);
    } catch {
      n.lida = false; draw(); refreshNotif();
    }
  };

  marcarTodas.onclick = async () => {
    const antes = itens.map((n) => n.lida);
    itens.forEach((n) => { n.lida = true; }); setNaoLidas(0); draw();
    try {
      const r = await call('notificacoes.marcar_lida', { todas: true }, { semEspaco: true });
      setNaoLidas(r.nao_lidas);
    } catch (e) {
      itens.forEach((n, i) => { n.lida = antes[i]; }); draw(); refreshNotif(); toast(e.message, { tone: 'danger' });
    }
  };

  const abrir = async (n) => {
    marcarUma(n);
    if (n.tipo === 'CONVITE_RECEBIDO') {
      await s.close();
      let lista = [];
      try {
        lista = await call('convites.recebidos', {}, { semEspaco: true });
      } catch {
        lista = [];
      }
      const cv = (lista || []).find((c) => c.id === n.ref_id);
      if (!cv) { toast('Este convite não está mais disponível.', { tone: 'warn', ico: 'clock' }); refreshNotif(); return; }
      (await import('../telas/convites.js')).openConviteRecebido(cv, {});
      return;
    }
    if ((n.tipo === 'CONVITE_ACEITO' || n.tipo === 'CONVITE_RECUSADO') && n.espaco_id) {
      await s.close();
      (await import('../app.js')).irParaPessoas(n.espaco_id);
      return;
    }
    const path = destino(n);
    if (!path) return;
    await s.close();
    (await import('../app.js')).irPara(path, n.espaco_id);
  };

  (async () => {
    try {
      const r = await call('notificacoes.listar', { limite: 50 }, { semEspaco: true });
      itens = r.itens || []; setNaoLidas(r.nao_lidas); draw();
    } catch (e) {
      s.setContent(errorState(e.message, () => { s.close(); openNotifList(); }));
    }
  })();
  return s;
}

// ---------- preferências (da pessoa, valem para todos os espaços) ----------

// Linha com interruptor acessível: estado por posição do botão e por texto (Ligado/Desligado), não só por cor.
function prefRow(t, onToggle) {
  const estado = h('span', { class: 'pref-state', 'aria-hidden': 'true' });
  const el = h('button', { class: 'toggle pref', type: 'button', role: 'switch', onclick: () => onToggle(t, el) },
    h('span', { class: 'toggle-text' }, h('span', { class: 'toggle-label' }, t.titulo || t.tipo), t.descricao ? h('span', { class: 'toggle-sub' }, t.descricao) : null),
    estado,
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' })));
  el.set = (on) => { el.setAttribute('aria-checked', String(!!on)); estado.textContent = on ? 'Ligado' : 'Desligado'; };
  el.set(t.ativo);
  return el;
}

// Bloco de preferências que se carrega sozinho (não bloqueia a tela). Usado em Ajustes e no sheet.
export function prefsLista() {
  const box = h('div', { class: 'set-group prefs' }, skelRows(3));

  const alternar = async (t, el) => {
    const novo = !t.ativo;
    const meu = (t._seq = (t._seq || 0) + 1);
    t.ativo = novo; el.set(novo);
    try {
      const r = await call('notificacoes.preferencias_salvar', { tipos: { [t.tipo]: novo } }, { semEspaco: true, rid: uuid() });
      const s = ((r && r.tipos) || []).find((x) => x.tipo === t.tipo);
      t._ok = s ? !!s.ativo : novo;
      if (meu === t._seq) { t.ativo = t._ok; el.set(t.ativo); }
    } catch (e) {
      if (meu !== t._seq) return;
      t.ativo = t._ok; el.set(t.ativo);
      toast(e.message, { tone: 'danger' });
    }
  };

  const carregar = async () => {
    box.replaceChildren(skelRows(3));
    try {
      const r = await call('notificacoes.preferencias', {}, { semEspaco: true });
      const tipos = ((r && r.tipos) || []).map((t) => ({ ...t, ativo: t.ativo !== false, _ok: t.ativo !== false }));
      if (!tipos.length) { box.replaceChildren(empty({ ic: 'bell', title: 'Nenhum aviso para configurar' })); return; }
      box.replaceChildren(...tipos.map((t) => prefRow(t, alternar)));
    } catch (e) {
      box.replaceChildren(errorState(e.message, carregar));
    }
  };
  carregar();
  return box;
}

export function abrirPreferencias() {
  return openSheet({ title: 'Preferências de avisos', content: prefsLista() });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNotif('foco'); });
