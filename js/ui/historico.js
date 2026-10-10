// Histórico de configuração: quem mudou o quê (antes → depois), evolução do limite e visão geral do espaço com filtros.
import { h, money, num, dmy, relDate, instant, dayLabel } from '../util.js';
import { icon } from '../icons.js';
import { load } from '../api.js';
import { store, catNome } from '../store.js';
import { openSheet, pick } from './sheet.js';
import { btn, badge, card, empty, errorState, skel, skelRows, sectionHead } from './components.js';
import { line } from './charts.js';

const DINHEIRO = new Set(['limite', 'limite_cheque', 'anuidade', 'valor', 'valor_limite', 'saldo_inicial']);
const PCT = new Set(['taxa_rendimento', 'juros_cheque', 'taxa_juros']);
const DATA = new Set(['data_inicio', 'data_fim', 'data_final', 'recorrente_ate', 'data_inativacao', 'data_saldo_inicial']);
const UNID = { MES: 'ao mês', ANO: 'ao ano' };
const MAPA = {
  rendimento_unidade: UNID, juros_cheque_unidade: UNID,
  status: { ATIVO: 'Ativo', INATIVO: 'Inativo', ATIVA: 'Ativa', INATIVA: 'Inativa', PAUSADA: 'Pausada', ENCERRADA: 'Encerrada' },
  recorrencia: { ATIVA: 'Ativa', PAUSADA: 'Pausada', ENCERRADA: 'Encerrada' },
  tipo_conta: { CORRENTE: 'Corrente', POUPANCA: 'Poupança', PAGAMENTO: 'Conta de pagamento', INVESTIMENTO: 'Investimento' },
  regra_fechamento: { INCLUSIVO: 'Fatura que fecha', EXCLUSIVO: 'Próxima fatura' },
  periodicidade: { DIARIA: 'Todo dia', SEMANAL: 'Toda semana', MENSAL: 'Todo mês', ANUAL: 'Todo ano', A_CADA_N_DIAS: 'A cada N dias' },
  tipo: { SAIDA: 'Saída', ENTRADA: 'Entrada', TRANSFERENCIA: 'Transferência', DESPESA: 'Despesa', RECEITA: 'Receita' },
};
const ROTULO = { limite_cheque: 'Limite do cheque especial', limite: 'Limite', juros_cheque: 'Juros do cheque especial', taxa_rendimento: 'Taxa de rendimento',
  cheque_especial: 'Controle do cheque especial', nome: 'Nome', status: 'Situação', valor_limite: 'Limite/meta', dia_fechamento: 'Dia de fechamento',
  dia_vencimento: 'Dia de vencimento', anuidade: 'Anuidade', taxa_juros: 'Juros do cartão', recurso_pagamento_id: 'Conta de pagamento', valor: 'Valor' };
const GRUPO = { conta: 'Contas', recurso: 'Contas', carteira: 'Carteiras', cartao: 'Cartões', planejamento: 'Planejamentos', categoria: 'Categorias', recorrencia: 'Recorrências' };
const ORDEM = ['Contas', 'Carteiras', 'Cartões', 'Planejamentos', 'Recorrências', 'Categorias', 'Outros'];
const nr = (v) => Number(String(v).replace(',', '.'));
const sim = (v) => v === true || v === 'SIM' || v === 'true';

export function fmtHist(campo, v) {
  if (campo === 'cheque_especial') return sim(v) ? 'Ligado' : 'Desligado';
  if (campo === 'cobranca_banco') return sim(v) ? 'Sim' : 'Não';
  if (v == null || v === '') return '—';
  if (DINHEIRO.has(campo) && !isNaN(nr(v))) return money(nr(v));
  if (PCT.has(campo) && !isNaN(nr(v))) return num(nr(v), 2) + '%';
  if (DATA.has(campo)) return dmy(String(v));
  if (MAPA[campo]) return MAPA[campo][v] || String(v);
  if (campo === 'dia_fechamento' || campo === 'dia_vencimento') return 'dia ' + v;
  if (campo === 'intervalo') return v + ' dias';
  if (campo === 'recurso_pagamento_id' || campo === 'recurso_id') return (store.recs.get(v) || {}).nome || '—';
  if (campo === 'categoria_id') return catNome(v) || '—';
  return String(v);
}

// "ontem · 09/10/2026 14:30" (relativa + completa)
export function histWhen(d) {
  const s = String(d || ''), day = s.slice(0, 10);
  if (!day) return '';
  const full = s.length > 10 ? instant(s) : dmy(day), rel = relDate(day);
  return rel === dmy(day) ? full : rel + ' · ' + full;
}

function histItem(it, { comItem } = {}) {
  const ini = it.valor_anterior == null || it.valor_anterior === '';
  const rot = it.campo_rotulo || ROTULO[it.campo] || it.campo;
  return h('li', { class: 'tl-item' }, h('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
    h('div', { class: 'tl-body' },
      h('div', { class: 'tl-title hist-t' }, comItem && it.entidade_nome ? h('span', { class: 'hist-item' }, it.entidade_nome) : null, h('span', {}, rot)),
      ini ? h('div', { class: 'tl-change' }, h('span', { class: 'tl-k' }, 'Valor inicial'), h('strong', { class: 'num' }, fmtHist(it.campo, it.valor_novo)))
        : h('div', { class: 'tl-change' }, h('span', { class: 'vh' }, 'de '), h('span', { class: 'tl-old num' }, fmtHist(it.campo, it.valor_anterior)), icon('chevR'),
          h('span', { class: 'vh' }, ' para '), h('strong', { class: 'num' }, fmtHist(it.campo, it.valor_novo))),
      h('div', { class: 'tl-when' }, (it.usuario_nome || 'Sistema') + ' · ' + histWhen(it.data))));
}
export const histLista = (itens, o) => h('ol', { class: 'timeline hist' }, itens.map((it) => histItem(it, o)));

// Seções do detalhe de conta/cartão: evolução do limite + últimas alterações (carregam sozinhas, sem travar a tela)
export function histSecao(r) {
  const campo = r.tipo === 'CARTAO' ? 'limite' : r.tipo === 'CONTA' ? 'limite_cheque' : null;
  const chartBox = h('div', { class: 'hist-chart' }, skel('skel-block'));
  const chartCard = campo ? card('sec-card', sectionHead(campo === 'limite' ? 'Evolução do limite' : 'Evolução do limite do cheque especial'), chartBox) : null;
  const listBox = h('div', {}, skelRows(3));
  const verTudo = h('span', {});
  const el = h('div', { class: 'hist-sec' }, chartCard, card('sec-card', sectionHead('Alterações', verTudo), listBox));
  const serie = () => load('historico.serie', { entidade_id: r.id, campo }).then((s) => {
    const pts = (s.pontos || []).filter((p) => p.valor !== '' && p.valor != null && !isNaN(Number(p.valor)));
    if (!pts.length) { chartCard.remove(); return; }
    const P = pts.map((p) => ({ y: Number(p.valor), label: dmy(String(p.data).slice(0, 10)), sub: p.usuario_nome ? 'por ' + p.usuario_nome : null }));
    const atual = P[P.length - 1].y, dif = Math.round((atual - P[0].y) * 100) / 100;
    chartBox.replaceChildren(h('div', { class: 'hist-atual' }, h('span', { class: 'muted' }, 'Atual'), h('strong', { class: 'num money' }, money(atual)),
      P.length > 1 && dif ? badge(money(dif, { sign: true }) + ' desde ' + P[0].label, 'neutral', dif > 0 ? 'up' : 'down') : null),
    line(P, { aria: s.campo_rotulo || 'Evolução do limite' }));
  }).catch((e) => chartBox.replaceChildren(errorState(e.message, () => { chartBox.replaceChildren(skel('skel-block')); serie(); })));
  const lista = () => load('historico.listar', { entidade_id: r.id, limite: 5 }).then((d) => {
    const its = d.itens || [];
    listBox.replaceChildren(its.length ? histLista(its) : empty({ ic: 'history', title: 'Nenhuma alteração registrada' }));
    verTudo.replaceChildren((d.total || 0) > its.length ? btn('Ver tudo', { kind: 'ghost', size: 'sm', icon: 'history', onClick: () => openHistorico({ entidade_id: r.id, nome: r.nome }) }) : '');
  }).catch((e) => listBox.replaceChildren(errorState(e.message, () => { listBox.replaceChildren(skelRows(3)); lista(); })));
  if (campo) serie();
  lista();
  return el;
}

// Visão geral do espaço (Ajustes → Histórico) ou de um item: paginada, filtros por item, campo e pessoa
export function openHistorico({ entidade_id = '', nome } = {}) {
  const f = { entidade_id, campo: '', usuario_id: '' };
  const itensNome = new Map(), pessoas = new Map(), campos = new Map(Object.entries(ROTULO));
  const G = { CONTA: 'Contas', CARTEIRA: 'Carteiras', CARTAO: 'Cartões' };
  store.recs.forEach((x) => itensNome.set(x.id, { label: x.nome, group: G[x.tipo] || 'Contas' }));
  if (entidade_id && !itensNome.has(entidade_id)) itensNome.set(entidade_id, { label: nome || '—', group: 'Outros' });
  let itens = [], total = 0, seq = 0;
  const filtros = h('div', { class: 'chip-row hist-filtros', role: 'group', 'aria-label': 'Filtros' });
  const resumo = h('p', { class: 'hist-total', 'aria-live': 'polite' });
  const lista = h('div', { class: 'hist-lista' });
  const mais = h('div', { class: 'hist-mais' });
  const ativo = () => !!(f.entidade_id || f.campo || f.usuario_id);
  const limpar = () => { f.entidade_id = ''; f.campo = ''; f.usuario_id = ''; drawFiltros(); carregar(true); };
  const ops = {
    entidade_id: () => [...itensNome].map(([value, o]) => ({ value, label: o.label, group: o.group })).sort((a, b) => ORDEM.indexOf(a.group) - ORDEM.indexOf(b.group) || a.label.localeCompare(b.label)),
    campo: () => [...campos].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    usuario_id: () => [...pessoas].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
  const filtroBtn = (key, rotulo, todos) => {
    const sel = f[key] ? (ops[key]().find((o) => o.value === f[key]) || {}).label || rotulo : '';
    return h('button', { class: 'chip hist-chip' + (sel ? ' is-sel' : ''), type: 'button', 'aria-haspopup': 'listbox', 'aria-label': rotulo + ': ' + (sel || todos),
      onclick: async () => {
        const v = await pick({ title: rotulo, items: [{ value: '', label: todos }, ...ops[key]()], value: f[key] });
        if (v !== undefined && v !== f[key]) { f[key] = v; drawFiltros(); carregar(true); }
      } }, h('span', { class: 'truncate' }, sel || rotulo), icon('chevD'));
  };
  const drawFiltros = () => filtros.replaceChildren(filtroBtn('entidade_id', 'Item', 'Todos os itens'), filtroBtn('campo', 'Campo', 'Todos os campos'), filtroBtn('usuario_id', 'Pessoa', 'Todas as pessoas'),
    ativo() ? h('button', { class: 'chip', type: 'button', onclick: limpar }, icon('x'), h('span', {}, 'Limpar')) : '');
  const draw = () => {
    resumo.textContent = total ? (total === 1 ? '1 alteração' : total + ' alterações') : '';
    if (!itens.length) {
      lista.replaceChildren(ativo() && !(entidade_id && f.entidade_id === entidade_id && !f.campo && !f.usuario_id)
        ? empty({ ic: 'filter', title: 'Nada com esses filtros', action: btn('Limpar filtros', { kind: 'secondary', onClick: limpar }) })
        : empty({ ic: 'history', title: 'Nenhuma alteração registrada' }));
      mais.replaceChildren(); return;
    }
    const grupos = []; let last = null, g = null;
    itens.forEach((it) => { const d = String(it.data || '').slice(0, 10); if (d !== last) { last = d; g = { d, its: [] }; grupos.push(g); } g.its.push(it); });
    lista.replaceChildren(...grupos.map((x) => h('div', { class: 'day' }, h('h3', { class: 'day-h' }, x.d ? dayLabel(x.d) : '—'), histLista(x.its, { comItem: !f.entidade_id }))));
    mais.replaceChildren(itens.length < total ? btn('Mostrar mais', { kind: 'secondary', full: true, icon: 'chevD', onClick: (e) => { const b = e.currentTarget; b.disabled = true; b.setAttribute('aria-busy', 'true'); carregar(false); } }) : '');
  };
  const carregar = async (reset) => {
    const my = ++seq;
    if (reset) { itens = []; total = 0; lista.replaceChildren(skelRows(4)); mais.replaceChildren(); resumo.textContent = ''; }
    const p = { limite: 30, offset: itens.length };
    ['entidade_id', 'campo', 'usuario_id'].forEach((k) => { if (f[k]) p[k] = f[k]; });
    try {
      const d = await load('historico.listar', p);
      if (my !== seq) return;
      total = d.total || 0; itens = itens.concat(d.itens || []);
      (d.itens || []).forEach((it) => {
        if (it.entidade_id && !itensNome.has(it.entidade_id)) itensNome.set(it.entidade_id, { label: it.entidade_nome || '—', group: GRUPO[it.entidade] || 'Outros' });
        if (it.usuario_id && !pessoas.has(it.usuario_id)) pessoas.set(it.usuario_id, it.usuario_nome || '—');
        if (it.campo && !campos.has(it.campo)) campos.set(it.campo, it.campo_rotulo || it.campo);
      });
      drawFiltros(); draw();
    } catch (e) {
      if (my !== seq) return;
      if (reset || !itens.length) lista.replaceChildren(errorState(e.message, () => carregar(true)));
      else mais.replaceChildren(errorState(e.message, () => carregar(false)));
    }
  };
  const s = openSheet({ title: entidade_id && nome ? 'Histórico · ' + nome : 'Histórico de configuração', size: 'full', content: [filtros, resumo, lista, mais] });
  drawFiltros();
  carregar(true);
  load('membros.listar').then((ms) => { (ms || []).forEach((m) => { if (m.usuario_id && !pessoas.has(m.usuario_id)) pessoas.set(m.usuario_id, m.nome || m.email); }); drawFiltros(); }).catch(() => {});
  return s;
}
