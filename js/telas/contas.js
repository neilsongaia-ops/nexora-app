// Contas e cartões: saldos atual/projetado, cheque especial e rendimento, cartões com medidor de limite, faturas, pagamento, histórico de configuração
import { h, money, dmy, relDate, HOJE, uuid, emit, monthLong, r2 } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { openSheet, openMenu, confirmSheet } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { card, sectionHead, skelCards, skelRows, errorState, empty, btn, iconBtn, badge, kv, row, segmented, textField, moneyField, pickField, dateField, stepper, formError, tip, FATURA, amount } from '../ui/components.js';
import { gauge } from '../ui/charts.js';
import { infinite } from '../ui/gestures.js';
import { lancRow } from './lancAcoes.js';
import { contaResumo, contaDetalhe, avisoLimite } from '../ui/conta.js';
import { histSecao } from '../ui/historico.js';

const TIPO_CONTA = [{ value: 'CORRENTE', label: 'Corrente' }, { value: 'POUPANCA', label: 'Poupança' }, { value: 'PAGAMENTO', label: 'Conta de pagamento' }, { value: 'INVESTIMENTO', label: 'Investimento' }];
const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'American Express', 'Outra'].map((b) => ({ value: b, label: b }));

export default async function contas(ctx) {
  if (ctx.params[0]) return detalhe(ctx, ctx.params[0]);
  const { view, setTitle } = ctx;
  setTitle('Contas e cartões', { actions: [can('editor') ? iconBtn('plus', 'Nova conta ou cartão', () => openRecursoForm()) : null] });
  const top = h('div', { class: 'tiles tiles--2' }, skelCards(2));
  const contasEl = h('div', { class: 'acct-grid' }, skelCards(3));
  const cartoesEl = h('div', { class: 'card-grid' }, skelCards(2));
  view.append(top, h('section', { class: 'sec' }, sectionHead('Contas e carteiras'), contasEl), h('section', { class: 'sec' }, sectionHead('Cartões'), cartoesEl));
  try {
    const s = await load('relatorios.saldos', {});
    top.replaceChildren(
      h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, icon('wallet'), 'Dinheiro hoje'), h('span', { class: 'tile-v num' }, money(s.dinheiro_atual))),
      h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, icon('piggy'), 'Patrimônio líquido', tip('Contas e carteiras menos o que está comprometido nos cartões.')), h('span', { class: 'tile-v num' + (s.patrimonio_liquido < 0 ? ' tone-out' : '') }, money(s.patrimonio_liquido))));
    contasEl.replaceChildren(...(s.contas.length ? s.contas.map(contaCard) : [empty({ ic: 'wallet', title: 'Nenhuma conta', action: can('editor') ? btn('Adicionar conta', { icon: 'plus', onClick: () => openRecursoForm({ tipo: 'CONTA' }) }) : null })]));
    cartoesEl.replaceChildren(...(s.cartoes.length ? s.cartoes.map(cartaoCard) : [empty({ ic: 'card', title: 'Nenhum cartão', action: can('editor') ? btn('Adicionar cartão', { icon: 'plus', kind: 'secondary', onClick: () => openRecursoForm({ tipo: 'CARTAO' }) }) : null })]));
  } catch (e) { view.replaceChildren(errorState(e.message, ctx.refresh)); }
}

function contaCard(c) {
  const diff = r2(c.saldo_projetado - c.saldo_atual);
  return h('a', { class: 'acct-card', href: '#/contas/' + c.id },
    h('span', { class: 'acct-card-top' }, h('span', { class: 'tipo-ico' }, icon(c.tipo === 'CARTEIRA' ? 'coin' : 'wallet')), h('span', { class: 'acct-card-name truncate' }, c.nome), icon('chevR', 'muted')),
    h('span', { class: 'acct-card-v num' + (c.saldo_atual < 0 ? ' tone-out' : '') }, money(c.saldo_atual)),
    diff ? h('span', { class: 'acct-card-sub' }, 'Projetado ', h('strong', { class: 'num' }, money(c.saldo_projetado)), h('span', { class: 'num tone-' + (diff > 0 ? 'in' : 'out') }, ' ' + money(diff, { sign: true }))) : h('span', { class: 'acct-card-sub' }, c.instituicao || ''),
    contaResumo(c));
}
function cartaoCard(k) {
  const r = store.recs.get(k.id) || {};
  const venc = k.faturas_a_pagar.find((f) => f.status === 'VENCIDA');
  const prox = k.faturas_a_pagar[0];
  return h('a', { class: 'ccard', href: '#/contas/' + k.id },
    h('div', { class: 'ccard-face' }, h('span', { class: 'ccard-name truncate' }, k.nome), h('span', { class: 'ccard-meta' }, [r.bandeira, r.final ? '•••• ' + r.final : null].filter(Boolean).join(' · '))),
    h('div', { class: 'ccard-body' },
      k.limite ? h('div', { class: 'ccard-limit' }, h('div', { class: 'meter-line' + (k.limite_comprometido > k.limite ? ' is-over' : k.limite_comprometido / k.limite > 0.85 ? ' is-near' : ''), style: { '--p': String(Math.min(1, k.limite_comprometido / k.limite)) } }),
        h('div', { class: 'ccard-nums' }, h('span', {}, h('span', { class: 'muted' }, 'Disponível '), h('strong', { class: 'num' }, money(k.limite_disponivel))), h('span', { class: 'muted num' }, 'de ' + money(k.limite))))
        : h('div', { class: 'ccard-nums' }, badge('Sem limite definido', 'neutral'), h('span', { class: 'num' }, money(k.limite_comprometido) + ' usados')),
      h('div', { class: 'ccard-fat' }, venc ? badge('Fatura vencida · ' + money(venc.valor_em_aberto), 'out', 'alert') : prox ? badge(FATURA[prox.status].label + ' · vence ' + relDate(prox.data_vencimento), FATURA[prox.status].tone, 'calendar') : k.fatura_aberta && k.fatura_aberta.id ? h('span', { class: 'muted' }, 'Fatura aberta ', h('strong', { class: 'num' }, money(k.fatura_aberta.valor_total))) : null)));
}

async function detalhe(ctx, id) {
  const { view, setTitle } = ctx;
  const r = store.recs.get(id);
  if (!r) { view.append(empty({ ic: 'wallet', title: 'Conta não encontrada' })); setTitle('Conta', { back: '/contas' }); return; }
  const menu = can('editor') ? iconBtn('dots', 'Opções', () => openMenu({ title: r.nome, items: [
    { icon: 'edit', label: 'Editar', onClick: () => openRecursoForm({ edit: r }) },
    { icon: 'list', label: 'Ver todos os lançamentos', onClick: () => ctx.go('/lancamentos?recurso=' + id) },
    { icon: 'ban', label: 'Inativar', tone: 'out', onClick: () => inativar(r, ctx) },
  ] })) : null;
  setTitle(r.nome, { back: '/contas', actions: [menu] });
  if (r.tipo === 'CARTAO') return detalheCartao(ctx, r);
  const head = h('div', { class: 'hero hero--sm' }, skelCards(1));
  const list = h('div', { class: 'list list--grouped' });
  const chq = h('div', { class: 'chq-slot' }, r.cheque_especial || Number(r.taxa_rendimento) > 0 ? skelCards(1) : null);
  view.append(head, chq, histSecao(r), sectionHead('Movimentações'), list);
  load('relatorios.saldos', {}).then((s) => {
    const c = s.contas.find((x) => x.id === id) || { saldo_atual: 0, saldo_projetado: 0 };
    head.replaceChildren(h('span', { class: 'hero-k' }, r.instituicao ? r.instituicao + (r.agencia ? ` · ag. ${r.agencia}` : '') + (r.numero ? ` · ${r.numero}` : '') : r.tipo === 'CARTEIRA' ? 'Carteira' : 'Conta'),
      h('span', { class: 'hero-v num' + (c.saldo_atual < 0 ? ' tone-out' : '') }, money(c.saldo_atual)),
      h('span', { class: 'hero-sub' }, 'Projetado ', h('strong', { class: 'num' }, money(c.saldo_projetado)), tip('Inclui lançamentos futuros que ainda não aconteceram.')),
      c.cheque_especial && c.cheque_especial.acima_do_limite ? h('span', { class: 'hero-sub' }, h('span', { class: 'badge tone-out is-strong' }, icon('alert'), 'Acima do limite')) : '');
    chq.replaceChildren(contaDetalhe(c, r) || '');
  }).catch((e) => { head.replaceChildren(errorState(e.message, ctx.refresh)); chq.replaceChildren(); });
  let last = null, g = null;
  const inf = infinite({ container: list, skeleton: () => skelRows(4), load: (offset, limite) => call('lancamentos.listar', { recurso_id: id, offset, limite }),
    render: (its) => its.forEach((l) => { if (l.data_evento !== last) { last = l.data_evento; g = h('div', { class: 'day' }, h('h3', { class: 'day-h' }, relDate(l.data_evento)[0].toUpperCase() + relDate(l.data_evento).slice(1))); list.append(g); } g.append(lancRow(l)); }),
    onEmpty: () => list.append(empty({ ic: 'list', title: 'Sem movimentações' })), onError: (e, retry) => list.append(errorState(e.message, retry)) });
  ctx.onCleanup(() => inf.stop());
}

async function detalheCartao(ctx, r) {
  const { view } = ctx;
  const top = h('div', { class: 'cc-top' }, skelCards(1));
  const fatEl = h('div', { class: 'list' }, skelRows(4));
  let filtro = 'abertas';
  const seg = segmented([{ value: 'abertas', label: 'A pagar' }, { value: 'todas', label: 'Todas' }], { value: filtro, aria: 'Faturas', cls: 'seg--sm', onChange: (v) => { filtro = v; drawFat(); } });
  view.append(top, h('section', { class: 'sec' }, sectionHead('Faturas', seg), fatEl), histSecao(r));
  let fats = [];
  const drawFat = () => {
    const f = filtro === 'todas' ? fats : fats.filter((x) => x.status !== 'PAGA' && x.status !== 'CANCELADA');
    fatEl.replaceChildren(...(f.length ? f.map((x) => faturaRow(x, r)) : [empty({ ic: 'check', title: 'Tudo pago' })]));
  };
  try {
    const [s, fs] = await Promise.all([load('cartoes.situacao', { recurso_id: r.id }), load('faturas.listar', { recurso_id: r.id })]);
    fats = fs;
    const pctU = s.limite ? s.limite_comprometido / s.limite : 0;
    top.replaceChildren(h('div', { class: 'cc-gauge' }, gauge({ limite: s.limite, usado: s.limite_comprometido, label: 'Limite usado' }),
      h('div', { class: 'cc-gauge-c' }, s.limite ? [h('span', { class: 'cc-g-k' }, 'Disponível'), h('span', { class: 'cc-g-v num' }, money(s.limite_disponivel)), h('span', { class: 'cc-g-s num' }, Math.round(pctU * 100) + '% do limite usado')] : [h('span', { class: 'cc-g-k' }, 'Sem limite definido'), h('span', { class: 'cc-g-v num' }, money(s.limite_comprometido)), h('span', { class: 'cc-g-s' }, 'comprometidos')])),
      h('div', { class: 'kv-list' }, kv('Limite contratado', money(s.limite)), kv(h('span', { class: 'kv-tip' }, 'Comprometido', tip('Compras parceladas comprometem o limite pelo total; ele volta conforme as faturas são pagas.')), money(s.limite_comprometido)),
        s.credito_a_favor ? kv('Crédito a favor', money(s.credito_a_favor), 'tone-in') : null, kv('Fecha dia', String(r.dia_fechamento)), kv('Vence dia', String(r.dia_vencimento)),
        r.recurso_pagamento_id ? kv('Paga com', (store.recs.get(r.recurso_pagamento_id) || {}).nome || '') : null));
    drawFat();
  } catch (e) { view.replaceChildren(errorState(e.message, ctx.refresh)); }
}

function faturaRow(f, k) {
  const m = FATURA[f.status] || { label: f.status, tone: 'neutral' };
  return row({
    cls: f.status === 'VENCIDA' ? 'is-late' : '',
    lead: h('span', { class: 'fat-month' }, h('span', { class: 'fat-m' }, monthLong(f.data_fechamento.slice(0, 7)).slice(0, 3)), h('span', { class: 'fat-y num' }, f.data_fechamento.slice(2, 4))),
    title: 'Fatura de ' + monthLong(f.data_fechamento.slice(0, 7)),
    badges: [h('span', { class: 'badge tone-' + m.tone }, m.label)], sub: (f.status === 'ABERTA' ? 'Fecha ' : 'Vence ') + relDate(f.status === 'ABERTA' ? f.data_fechamento : f.data_vencimento),
    trail: h('span', { class: 'num' }, money(f.status === 'PAGA' ? f.valor_total : f.status === 'ABERTA' ? f.valor_total : f.valor_em_aberto)),
    trailSub: f.valor_pago && f.status !== 'PAGA' ? 'pago ' + money(f.valor_pago) : null,
    onClick: () => openFatura(f.id, k),
  });
}

export async function openFatura(id, k) {
  const s = openSheet({ title: 'Fatura', snap: true, size: 'full', content: skelRows(5) });
  try {
    const f = await call('faturas.detalhe', { id });
    const m = FATURA[f.status];
    s.setTitle('Fatura de ' + monthLong(f.data_fechamento.slice(0, 7)));
    s.setContent([
      h('div', { class: 'det-head' }, h('span', { class: 'tipo-ico is-xl' }, icon('card')), h('div', { class: 'det-head-txt' }, h('h3', { class: 'det-title' }, k.nome), h('span', { class: 'amount num is-2xl' }, money(f.valor_total)), h('div', { class: 'det-badges' }, badge(m.label, m.tone)))),
      h('div', { class: 'kv-list' }, kv('Período', `${dmy(f.periodo_inicio)} a ${dmy(f.periodo_fim)}`), kv('Fechamento', dmy(f.data_fechamento)), kv('Vencimento', dmy(f.data_vencimento) + ' · ' + relDate(f.data_vencimento)), kv('Pago', money(f.valor_pago), 'tone-in'), kv('Em aberto', money(f.valor_em_aberto), 'is-total')),
      sectionHead(`Compras (${f.parcelas.length})`),
      h('div', { class: 'list' }, f.parcelas.length ? f.parcelas.map((p) => row({ title: p.descricao, sub: dmy(p.data_compra) + (p.total > 1 ? ` · parcela ${p.numero}/${p.total}` : ''), badges: p.credito ? [badge('Crédito', 'in', 'undo')] : null, trail: h('span', { class: 'num' + (p.valor < 0 ? ' tone-in' : '') }, money(p.valor)) })) : [h('p', { class: 'muted' }, 'Sem compras.')]),
      f.pagamentos.length ? [sectionHead('Pagamentos'), h('div', { class: 'list' }, f.pagamentos.map((p) => row({ lead: h('span', { class: 'tipo-ico tone-xfer' }, icon('swap')), title: (store.recs.get(p.recurso_id) || {}).nome || 'Pagamento', sub: dmy(p.data), trail: h('span', { class: 'num tone-xfer' }, money(p.valor)) })))] : null,
    ]);
    if (can('editor') && ['FECHADA', 'VENCIDA', 'PARCIALMENTE_PAGA'].includes(f.status) && f.valor_em_aberto > 0) s.setFooter(btn('Pagar fatura', { size: 'lg', full: true, icon: 'check', onClick: async () => { await s.close(); pagarFatura(f, k); } }));
  } catch (e) { s.setContent(errorState(e.message, () => { s.close(); openFatura(id, k); })); }
}

export function pagarFatura(f, k) {
  const rid = uuid(), err = formError();
  let modo = 'total', valor = f.valor_em_aberto, conta = k.recurso_pagamento_id || (recursosAtivos(['CONTA'])[0] || {}).id, data = HOJE;
  const vf = moneyField('Valor', { value: valor, big: true, onChange: (v) => { valor = v; vf.setError(''); upd(); } });
  const wrap = h('div', { hidden: true }, vf);
  const segm = segmented([{ value: 'total', label: 'Total ' + money(f.valor_em_aberto) }, { value: 'parcial', label: 'Parcial' }], { value: modo, aria: 'Valor do pagamento', onChange: (v) => { modo = v; wrap.hidden = v === 'total'; if (v === 'total') { valor = f.valor_em_aberto; vf.set(valor); } else setTimeout(() => vf.input.focus(), 50); upd(); } });
  const cf = pickField('Pagar com', { value: conta, items: recursosAtivos(['CONTA', 'CARTEIRA']).map((r) => ({ value: r.id, label: r.nome, icon: 'wallet' })), onChange: (v) => { conta = v; } });
  const df = dateField('Data do pagamento', { value: HOJE, max: HOJE, onChange: (v) => { data = v; } });
  const b = btn('', { size: 'lg', full: true });
  const upd = () => { b.replaceChildren(h('span', { class: 'btn-label' }, 'Pagar ' + money(valor))); };
  upd();
  b.onclick = async () => {
    if (!(valor > 0)) { vf.setError('Informe o valor'); return; }
    if (valor > f.valor_em_aberto) { vf.setError('Maior que o valor em aberto'); return; }
    if (!(await confirmSheet({ title: 'Confirmar pagamento', content: h('div', { class: 'kv-list' }, kv('Fatura', k.nome), kv('Valor', money(valor), 'is-total'), kv('Sai de', (store.recs.get(conta) || {}).nome || ''), kv('Data', dmy(data))), confirm: 'Pagar' }))) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      await call('faturas.pagar', { fatura_id: f.id, recurso_id: conta, valor, data }, { rid });
      await successBurst(s.el, 'Pago');
      await s.close();
      toast(valor < f.valor_em_aberto ? 'Pagamento parcial registrado.' : 'Fatura paga.', { tone: 'success' });
      emit('dados');
    } catch (e) { err.show(e.message); if (e.codigo === 'LIMITE_CONTA') avisoLimite(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: 'Pagar fatura', content: [h('div', { class: 'pay-head' }, h('span', { class: 'muted' }, k.nome), h('span', { class: 'amount num is-2xl' }, money(f.valor_em_aberto)), h('span', { class: 'pay-note' }, badge('Movimentação entre contas', 'xfer', 'swap'), tip('Pagar a fatura não é uma nova despesa: as compras já contaram quando foram feitas.'))), err, segm, wrap, cf, df], footer: b });
}

async function inativar(r, ctx) {
  if (!(await confirmSheet({ title: 'Inativar ' + r.nome + '?', content: h('p', { class: 'muted' }, 'Só é possível com saldo zero.'), confirm: 'Inativar', tone: 'danger' }))) return;
  try { await call('recursos.inativar', { id: r.id }, { rid: uuid() }); toast('Inativado.', { tone: 'success' }); ctx.go('/contas'); } catch (e) { toast(e.message, { tone: 'danger' }); }
}

export function openRecursoForm({ tipo = 'CONTA', edit } = {}) {
  const st = edit ? { ...edit, cheque_on: !!edit.cheque_especial, limite_cheque: Number(edit.limite_cheque) || 0, taxa_rendimento: Number(edit.taxa_rendimento) || 0, juros_cheque: Number(edit.juros_cheque) || 0, rendimento_unidade: edit.rendimento_unidade || 'MES', juros_cheque_unidade: edit.juros_cheque_unidade || 'MES' }
    : { taxa_rendimento: 0, rendimento_unidade: 'MES', cheque_on: false, limite_cheque: 0, juros_cheque: 0, juros_cheque_unidade: 'MES', tipo, nome: '', tipo_conta: 'CORRENTE', instituicao: '', agencia: '', numero: '', saldo_inicial: 0, data_saldo_inicial: HOJE, limite: 0, dia_fechamento: 1, dia_vencimento: 10, bandeira: null, final: '', regra_fechamento: 'INCLUSIVO', recurso_pagamento_id: (recursosAtivos(['CONTA'])[0] || {}).id || null, anuidade: 0, taxa_juros: 0 };
  const rid = uuid(), err = formError();
  let nomeF;
  const taxaF = (label, key) => textField(label, { value: st[key] ? String(st[key]).replace('.', ',') : '', inputmode: 'decimal', placeholder: '0', maxlength: 7, onInput: (v) => { const x = Number(String(v).replace(',', '.')); st[key] = x >= 0 ? x : 0; } });
  const unidF = (key, aria) => h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Período')), segmented([{ value: 'MES', label: 'Ao mês' }, { value: 'ANO', label: 'Ao ano' }], { value: st[key] || 'MES', aria, onChange: (v) => { st[key] = v; } }));
  const secao = (ic, titulo, dica, ...kids) => { const id = 'fs' + uuid().slice(0, 8); return h('div', { class: 'form-sec', role: 'group', 'aria-labelledby': id }, h('div', { class: 'form-sec-h' }, icon(ic), h('span', { id }, titulo), tip(dica)), ...kids); };
  const rendSec = () => secao('piggy', 'Rendimento', 'Opcional. Serve para estimar quanto a conta rende no mês; o app não lança o rendimento.', h('div', { class: 'grid-2' }, taxaF('Taxa (%)', 'taxa_rendimento'), unidF('rendimento_unidade', 'Período da taxa de rendimento')));
  const chqSec = () => {
    const hint = h('p', { class: 'chq-hint', 'aria-live': 'polite' });
    const upd = () => hint.replaceChildren(icon(!st.cheque_on ? 'ban' : st.limite_cheque > 0 ? 'shield' : 'lock'), h('span', {}, !st.cheque_on ? 'O app não confere o saldo desta conta.' : st.limite_cheque > 0 ? 'Pode ficar até ' + money(st.limite_cheque) + ' negativa.' : 'R$ 0,00: sem cheque especial, não fica negativa.'));
    const limF = moneyField('Limite total', { value: st.limite_cheque, onChange: (v) => { st.limite_cheque = v; upd(); } });
    const body = h('div', { class: 'form-sec-body', hidden: !st.cheque_on }, limF, h('div', { class: 'grid-2' }, taxaF('Juros (%)', 'juros_cheque'), unidF('juros_cheque_unidade', 'Período dos juros do cheque especial')));
    const seg = segmented([{ value: 'off', label: 'Não informar' }, { value: 'on', label: 'Informar limite' }], { value: st.cheque_on ? 'on' : 'off', aria: 'Cheque especial', onChange: (v) => { st.cheque_on = v === 'on'; body.hidden = !st.cheque_on; upd(); if (st.cheque_on) setTimeout(() => limF.input.focus(), 50); } });
    upd();
    return secao('shield', 'Cheque especial', 'Não informar: sem controle, como hoje. Informar: o app recusa saídas acima de saldo + limite, como o banco. R$ 0,00 = conta sem cheque especial.', seg, hint, body);
  };
  const build = () => {
    const out = [err];
    if (!edit) out.push(segmented([{ value: 'CONTA', label: 'Conta', icon: 'wallet' }, { value: 'CARTEIRA', label: 'Carteira', icon: 'coin' }, { value: 'CARTAO', label: 'Cartão', icon: 'card' }], { value: st.tipo, aria: 'Tipo', onChange: (v) => { st.tipo = v; s.setContent(build()); } }));
    nomeF = textField('Nome', { value: st.nome, placeholder: st.tipo === 'CARTAO' ? 'Ex.: Cartão do banco' : st.tipo === 'CARTEIRA' ? 'Ex.: Dinheiro' : 'Ex.: Conta corrente', autofocus: true, maxlength: 60, onInput: (v) => { st.nome = v; nomeF.setError(''); } });
    out.push(nomeF);
    if (st.tipo === 'CONTA') out.push(pickField('Tipo de conta', { value: st.tipo_conta, items: TIPO_CONTA, onChange: (v) => { st.tipo_conta = v; } }), textField('Instituição', { value: st.instituicao || '', onInput: (v) => { st.instituicao = v; } }),
      h('div', { class: 'grid-2' }, textField('Agência', { value: st.agencia || '', inputmode: 'numeric', onInput: (v) => { st.agencia = v; } }), textField('Número', { value: st.numero || '', onInput: (v) => { st.numero = v; } })));
    if (st.tipo !== 'CARTAO' && !edit) out.push(h('div', { class: 'grid-2' }, moneyField('Saldo inicial', { value: st.saldo_inicial, tipText: 'Depois disso o saldo é sempre calculado pelos lançamentos.', onChange: (v) => { st.saldo_inicial = v; } }), dateField('Em', { value: st.data_saldo_inicial, max: HOJE, onChange: (v) => { st.data_saldo_inicial = v; } })));
    if (st.tipo === 'CONTA') out.push(rendSec(), chqSec());
    if (st.tipo === 'CARTAO') out.push(
      moneyField('Limite', { value: st.limite, onChange: (v) => { st.limite = v; } }),
      h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Fecha dia'), stepper({ value: st.dia_fechamento, min: 1, max: 31, label: 'Dia de fechamento', onChange: (v) => { st.dia_fechamento = v; } })),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Vence dia'), stepper({ value: st.dia_vencimento, min: 1, max: 31, label: 'Dia de vencimento', onChange: (v) => { st.dia_vencimento = v; } }))),
      h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Compra no dia do fechamento'), tip('Em qual fatura entra a compra feita no próprio dia do fechamento.')), segmented([{ value: 'INCLUSIVO', label: 'Fatura que fecha' }, { value: 'EXCLUSIVO', label: 'Próxima fatura' }], { value: st.regra_fechamento, aria: 'Regra de fechamento', onChange: (v) => { st.regra_fechamento = v; } })),
      pickField('Paga com', { value: st.recurso_pagamento_id, items: recursosAtivos(['CONTA']).map((r) => ({ value: r.id, label: r.nome, icon: 'wallet' })), placeholder: 'Escolher conta', onChange: (v) => { st.recurso_pagamento_id = v; } }),
      h('div', { class: 'grid-2' }, pickField('Bandeira', { value: st.bandeira, items: BANDEIRAS, placeholder: 'Opcional', onChange: (v) => { st.bandeira = v; } }), textField('Final', { value: st.final || '', inputmode: 'numeric', maxlength: 4, placeholder: '0000', onInput: (v) => { st.final = v.replace(/\D/g, ''); } })),
      textField('Instituição', { value: st.instituicao || '', onInput: (v) => { st.instituicao = v; } }),
      h('div', { class: 'grid-2' }, moneyField('Anuidade', { value: st.anuidade, onChange: (v) => { st.anuidade = v; } }), textField('Juros ao mês (%)', { value: st.taxa_juros ? String(st.taxa_juros).replace('.', ',') : '', inputmode: 'decimal', onInput: (v) => { st.taxa_juros = Number(v.replace(',', '.')) || 0; } })));
    return out;
  };
  const b = btn(edit ? 'Salvar' : 'Adicionar', { size: 'lg', full: true });
  b.onclick = async () => {
    if (!st.nome.trim()) { nomeF.setError('Dê um nome'); nomeF.input.focus(); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      const keys = st.tipo === 'CARTAO' ? ['limite', 'dia_fechamento', 'dia_vencimento', 'instituicao', 'bandeira', 'final', 'regra_fechamento', 'recurso_pagamento_id', 'anuidade', 'taxa_juros'] : st.tipo === 'CONTA' ? ['tipo_conta', 'instituicao', 'agencia', 'numero'] : [];
      const p = { nome: st.nome.trim() }; keys.forEach((k) => { if (st[k] !== '' && st[k] != null) p[k] = st[k]; });
      if (st.tipo === 'CONTA') {
        if (edit) Object.assign(p, { taxa_rendimento: st.taxa_rendimento || 0, rendimento_unidade: st.rendimento_unidade || 'MES', limite_cheque: st.cheque_on ? r2(st.limite_cheque) : null, juros_cheque: st.juros_cheque || 0, juros_cheque_unidade: st.juros_cheque_unidade || 'MES' });
        else {
          if (st.taxa_rendimento > 0) Object.assign(p, { taxa_rendimento: st.taxa_rendimento, rendimento_unidade: st.rendimento_unidade || 'MES' });
          if (st.cheque_on) Object.assign(p, { limite_cheque: r2(st.limite_cheque), juros_cheque: st.juros_cheque || 0, juros_cheque_unidade: st.juros_cheque_unidade || 'MES' });
        }
      }
      if (edit) await call('recursos.atualizar', { id: edit.id, versao: edit.versao, ...p }, { rid });
      else await call('recursos.criar', { tipo: st.tipo, ...p, ...(st.tipo !== 'CARTAO' ? { saldo_inicial: st.saldo_inicial, data_saldo_inicial: st.data_saldo_inicial } : {}) }, { rid });
      await s.close(); toast(edit ? 'Alterações salvas.' : 'Adicionado.', { tone: 'success' }); emit('dados');
    } catch (e) { err.show(e.message); s.body.scrollTop = 0; } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar ' + edit.nome : 'Nova conta ou cartão', size: 'full', content: build(), footer: b });
}
