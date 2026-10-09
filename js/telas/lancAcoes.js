// Ações e detalhe de lançamento: menu ao toque, deslizar, efetivar, cancelar, estornar, histórico.
import { h, money, dmy, relDate, HOJE, uuid, emit, instant, monthLong } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu, pickDate, confirmSheet, pick } from '../ui/sheet.js';
import { toast, undoable } from '../ui/toast.js';
import { swipeable, longPress } from '../ui/gestures.js';
import { row, amount, tipoIcon, statusBadge, badge, kv, skelRows, errorState, btn, textField, dateField, formError, TIPO, sectionHead, tip } from '../ui/components.js';
import { openLancForm, categoriaItems } from './lancForm.js';

const futuro = (l) => ['PLANEJADO', 'PENDENTE'].includes(l.status);
const estornavel = (l) => l.status === 'EFETIVADO' && !['ESTORNO', 'SALDO_INICIAL', 'PAGAMENTO_FATURA'].includes(l.origem);
const recNome = (id) => (store.recs.get(id) || {}).nome || '';

export function lancSub(l) {
  if (l.tipo === 'TRANSFERENCIA') return l.origem === 'PAGAMENTO_FATURA' ? 'Pagamento de fatura · ' + recNome(l.origem_id) : `${recNome(l.origem_id)} → ${recNome(l.destino_id)}`;
  return [catNome(l.categoria_id) || (l.itens && l.itens.length ? l.itens.length + ' itens' : ''), recNome(l.recurso_id)].filter(Boolean).join(' · ');
}

export function lancRow(l, { showDate, selection } = {}) {
  const b = [];
  if (l.status !== 'EFETIVADO') b.push(statusBadge(l.status));
  if (l.parcelas_total > 1) b.push(badge(l.parcelas_total + '×', 'neutral', 'card'));
  if (l.origem === 'RECORRENCIA') b.push(h('span', { class: 'mini-ico', title: 'Recorrente', 'aria-label': 'Recorrente' }, icon('repeat')));
  if (l.origem === 'ESTORNO') b.push(badge('Estorno', 'muted', 'undo'));
  const dead = l.status === 'CANCELADO' || l.status === 'ESTORNADO';
  const r = row({
    cls: 'lanc' + (dead ? ' is-dead' : '') + (l.status === 'PENDENTE' && l.data_evento < HOJE ? ' is-late' : ''),
    lead: tipoIcon(l.tipo), title: l.descricao, badges: b.length ? b : null, sub: lancSub(l),
    trail: amount(l.valor_total, { tipo: l.tipo, strike: dead }), trailSub: showDate ? relDate(l.data_evento) : null,
    aria: `${TIPO[l.tipo].label}: ${l.descricao}, ${money(l.valor_total)}, ${dmy(l.data_evento)}`,
    onClick: () => (selection && selection.active() ? selection.toggle(l, r) : openLancMenu(l)),
  });
  if (selection) longPress(r, () => selection.toggle(l, r));
  if (!can('editor') || dead) return r;
  return swipeable(r, {
    right: futuro(l) ? { label: 'Efetivar', icon: 'check', tone: 'in', run: () => efetivar(l) } : { label: 'Duplicar', icon: 'copy', tone: 'xfer', run: () => duplicar(l) },
    left: futuro(l) ? { label: 'Cancelar', icon: 'ban', tone: 'out', run: () => cancelar(l) } : estornavel(l) ? { label: 'Estornar', icon: 'undo', tone: 'out', run: () => estornar(l) } : null,
  });
}

export function openLancMenu(l) {
  const ed = can('editor');
  openMenu({
    title: l.descricao,
    header: h('div', { class: 'menu-head' }, tipoIcon(l.tipo, 'is-lg'), h('div', {}, amount(l.valor_total, { tipo: l.tipo, cls: 'is-xl' }), h('div', { class: 'menu-head-sub' }, dmy(l.data_evento) + ' · ' + relDate(l.data_evento), l.status !== 'EFETIVADO' ? statusBadge(l.status) : null))),
    items: [
      { icon: 'list', label: 'Ver detalhes', onClick: () => openLancDetail(l.id) },
      ed && futuro(l) && { icon: 'check', label: 'Efetivar hoje', onClick: () => efetivar(l) },
      ed && futuro(l) && { icon: 'calendar', label: 'Efetivar em outra data', onClick: async () => { const d = await pickDate({ title: 'Data da efetivação', value: HOJE, max: HOJE }); if (d) efetivar(l, d); } },
      ed && !['CANCELADO', 'ESTORNADO'].includes(l.status) && l.origem !== 'PAGAMENTO_FATURA' && { icon: 'edit', label: 'Editar', onClick: () => editar(l.id) },
      ed && l.origem !== 'PAGAMENTO_FATURA' && l.origem !== 'SALDO_INICIAL' && { icon: 'copy', label: 'Duplicar', onClick: () => duplicar(l) },
      { icon: 'history', label: 'Histórico', onClick: () => historico(l) },
      ed && futuro(l) && { icon: 'ban', label: 'Cancelar', tone: 'out', onClick: () => cancelar(l) },
      ed && estornavel(l) && { icon: 'undo', label: 'Estornar', tone: 'out', onClick: () => estornar(l) },
    ],
  });
}

export async function efetivar(l, data) {
  const t = toast('Efetivando…', { ico: 'clock', duration: 8000 });
  try { await call('lancamentos.efetivar', data ? { id: l.id, data } : { id: l.id }, { rid: uuid() }); t(); toast('Efetivado. Já conta no saldo.', { tone: 'success' }); emit('dados'); }
  catch (e) { t(); toast(e.message, { tone: 'danger' }); }
}
export async function cancelar(l) {
  const r = await undoable(`“${l.descricao}” será cancelado`, () => call('lancamentos.cancelar', { id: l.id }, { rid: uuid() }));
  if (r) { toast('Cancelado.', { tone: 'success' }); emit('dados'); }
}
export function estornar(l) {
  const err = formError();
  let motivo = '', data = HOJE;
  const f = textField('Motivo', { placeholder: 'Ex.: produto devolvido', autofocus: true, onInput: (v) => { motivo = v; f.setError(''); } });
  const d = dateField('Data do estorno', { value: HOJE, max: HOJE, onChange: (v) => { data = v; } });
  const b = btn('Estornar ' + money(l.valor_total), { kind: 'danger', full: true, size: 'lg' });
  b.onclick = async () => {
    if (!motivo.trim()) { f.setError('Conte o motivo'); f.input.focus(); return; }
    await s.close();
    const r = await undoable('Estorno de ' + money(l.valor_total) + ' em instantes', () => call('lancamentos.estornar', { id: l.id, motivo: motivo.trim(), data }, { rid: uuid() }));
    if (r) { toast('Estornado. O original foi preservado.', { tone: 'success' }); emit('dados'); }
  };
  const s = openSheet({ title: 'Estornar lançamento', content: [h('div', { class: 'menu-head' }, tipoIcon(l.tipo, 'is-lg'), h('div', {}, h('div', { class: 'row-title' }, l.descricao), amount(l.valor_total, { tipo: l.tipo }))), err, f, d], footer: b });
}
export async function duplicar(l) {
  const d = l.itens ? l : await call('lancamentos.detalhe', { id: l.id });
  openLancForm({ initial: { tipo: d.tipo, valor: d.valor_bruto, descricao: d.descricao, recurso_id: d.recurso_id, origem_id: d.origem_id, destino_id: d.destino_id, categoria_id: d.categoria_id, data: HOJE, status: 'EFETIVADO', descontos: d.descontos, acrescimos: d.acrescimos, encargos: d.encargos, parcelas: d.parcelas_total || 1, itens: (d.itens || []).map((i) => ({ descricao: i.descricao, quantidade: 1, valor_total: i.valor_total, categoria_id: i.categoria_id })) } });
}
async function editar(id) {
  const t = toast('Abrindo…', { ico: 'clock' });
  try { const d = await call('lancamentos.detalhe', { id }); t(); openLancForm({ edit: d }); } catch (e) { t(); toast(e.message, { tone: 'danger' }); }
}

export async function historico(l) {
  const s = openSheet({ title: 'Histórico', content: skelRows(3) });
  try {
    const hs = await load('lancamentos.historico', { id: l.id });
    const NOMES = { descricao: 'Descrição', categoria_id: 'Categoria', data_evento: 'Data', valor_bruto: 'Valor', status: 'Situação', motivo: 'Motivo' };
    const fmt = (k, v) => (v == null || v === '' ? '—' : k.endsWith('categoria_id') || k.startsWith('item:') ? catNome(v) || '—' : k === 'data_evento' ? dmy(v) : k === 'valor_bruto' ? money(v) : String(v));
    s.setContent(hs.length ? h('ol', { class: 'timeline' }, hs.map((a) => h('li', { class: 'tl-item' }, h('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
      h('div', { class: 'tl-body' }, h('div', { class: 'tl-title' }, { criado: 'Criado', atualizado: 'Alterado', efetivado: 'Efetivado', cancelado: 'Cancelado', estornado: 'Estornado' }[a.acao] || a.acao, ' por ', h('strong', {}, a.quem || '—')),
        h('div', { class: 'tl-when' }, instant(a.quando)),
        Object.entries(a.mudancas || {}).map(([k, [de, para]]) => h('div', { class: 'tl-change' }, h('span', { class: 'tl-k' }, NOMES[k] || k.replace('item:', 'Item ')), h('span', { class: 'tl-old' }, fmt(k, de)), icon('chevR'), h('span', {}, fmt(k, para)))))))) : h('p', { class: 'muted' }, 'Sem registros.'));
  } catch (e) { s.setContent(errorState(e.message, () => { s.close(); historico(l); })); }
}

export async function openLancDetail(id) {
  const s = openSheet({ title: 'Lançamento', snap: true, size: 'full', content: skelRows(5) });
  const draw = async () => {
    let d;
    try { d = await call('lancamentos.detalhe', { id }); } catch (e) { s.setContent(errorState(e.message, draw)); return; }
    const ed = can('editor');
    const head = h('div', { class: 'det-head' }, tipoIcon(d.tipo, 'is-xl'), h('div', { class: 'det-head-txt' }, h('h3', { class: 'det-title' }, d.descricao),
      amount(d.valor_total, { tipo: d.tipo, cls: 'is-2xl', strike: ['CANCELADO', 'ESTORNADO'].includes(d.status) }),
      h('div', { class: 'det-badges' }, statusBadge(d.status), d.tipo === 'TRANSFERENCIA' ? badge(d.origem === 'PAGAMENTO_FATURA' ? 'Pagamento de fatura' : 'Não é receita nem despesa', 'xfer', 'swap') : null, d.origem === 'ESTORNO' ? badge('Estorno', 'muted', 'undo') : null, d.origem === 'RECORRENCIA' ? badge('Recorrente', 'neutral', 'repeat') : null)));
    const info = h('div', { class: 'kv-list' },
      kv('Data', dmy(d.data_evento) + ' · ' + relDate(d.data_evento)),
      d.recurso_id ? kv(d.tipo === 'ENTRADA' ? 'Recebido em' : 'Pago com', recNome(d.recurso_id)) : null,
      d.origem_id ? kv('De', recNome(d.origem_id)) : null, d.destino_id ? kv('Para', recNome(d.destino_id)) : null,
      d.categoria_id ? kv('Categoria', catNome(d.categoria_id)) : null,
      d.motivo_estorno ? kv('Motivo do estorno', d.motivo_estorno) : null);
    const brk = d.descontos || d.acrescimos || d.encargos ? h('div', { class: 'kv-list is-sum' }, kv('Valor', money(d.valor_bruto)), d.descontos ? kv('Descontos', money(-d.descontos)) : null, d.acrescimos ? kv('Acréscimos', money(d.acrescimos)) : null,
      d.encargos ? kv(h('span', { class: 'kv-tip' }, 'Encargos', tip('Custo financeiro (juros, multas); não entra no gasto por categoria.')), money(d.encargos)) : null, kv('Total', money(d.valor_total), 'is-total')) : null;
    const itens = d.itens.length ? [sectionHead('Itens'), h('div', { class: 'list' }, d.itens.map((it) => row({
      title: it.descricao, sub: (it.quantidade !== 1 ? `${String(it.quantidade).replace('.', ',')} × ${money(it.valor_unitario)} · ` : '') + (catNome(it.categoria_id) || 'Sem categoria'),
      trail: h('span', { class: 'num' }, money(it.valor_total)),
      onClick: ed && !['CANCELADO', 'ESTORNADO'].includes(d.status) ? async () => {
        const v = await pick({ title: 'Categoria de ' + it.descricao, items: categoriaItems(d.tipo === 'ENTRADA' ? 'RECEITA' : 'DESPESA'), value: it.categoria_id });
        if (!v || v === it.categoria_id) return;
        try { await call('lancamentos.atualizar', { id: d.id, versao: d.versao, itens: [{ id: it.id, categoria_id: v }] }, { rid: uuid() }); toast('Categoria do item alterada.', { tone: 'success' }); emit('dados'); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); if (e.codigo === 'CONFLITO') draw(); }
      } : null,
    })))] : null;
    const parcelas = d.parcelas.length ? [sectionHead('Parcelas'), h('div', { class: 'list' }, d.parcelas.map((p) => row({ lead: h('span', { class: 'parc-n num' }, `${p.numero}/${p.total}`), title: (ym => ym ? 'Fatura de ' + monthLong(ym) : 'Fatura')(p.fatura_mes || String(p.fatura_id || '').split('~')[1] || ''), badges: ['CANCELADA', 'CANCELADO'].includes(p.status) ? [badge('Cancelada', 'muted')] : null, trail: h('span', { class: 'num' + (p.valor < 0 ? ' tone-in' : '') }, money(p.valor)) })))] : null;
    const mov = [sectionHead('Movimentações'), h('div', { class: 'list' }, d.movimentacoes.map((m) => row({
      lead: h('span', { class: 'tipo-ico tone-' + (m.natureza === 'CREDITO' ? 'in' : 'out') }, icon(m.natureza === 'CREDITO' ? 'in' : 'out')),
      title: recNome(m.recurso_id), sub: m.data_efetivacao ? 'Efetivada em ' + dmy(m.data_efetivacao) : 'Ainda não conta no saldo',
      trail: h('span', { class: 'num tone-' + (m.natureza === 'CREDITO' ? 'in' : 'out') }, (m.natureza === 'CREDITO' ? '+' : '\u2212') + money(m.valor)),
    })))];
    const exec = d.execucoes && d.execucoes.length ? [sectionHead('Planejamentos'), h('div', { class: 'list' }, d.execucoes.map((x) => row({ lead: h('span', { class: 'tipo-ico' }, icon('target')), title: x.nome, sub: catNome(x.categoria_id), trail: h('span', { class: 'num' }, money(x.valor)) })))] : null;
    s.setTitle(TIPO[d.tipo].label);
    s.setContent([head, info, brk, itens, parcelas, mov, exec]);
    const acts = [];
    if (ed && futuro(d)) acts.push(btn('Efetivar', { icon: 'check', onClick: async () => { await s.close(); efetivar(d); } }));
    if (ed && !['CANCELADO', 'ESTORNADO'].includes(d.status) && d.origem !== 'PAGAMENTO_FATURA') acts.push(btn('Editar', { kind: 'secondary', icon: 'edit', onClick: async () => { await s.close(); openLancForm({ edit: d }); } }));
    acts.push(btn('', { kind: 'secondary', icon: 'dots', aria: 'Mais ações', onClick: () => openLancMenu(d) }));
    s.setFooter(h('div', { class: 'btn-row' }, acts));
  };
  draw();
}
