// Início: painel (quanto tenho, onde está, cartões, a pagar/receber, gastos por categoria, série, planejamentos, alertas)
import { h, money, monthStart, monthEnd, addMonths, HOJE, ls, monthShort, monthLong, relDate, dayLabel, pct } from '../util.js';
import { icon } from '../icons.js';
import { load } from '../api.js';
import { store, can } from '../store.js';
import { card, sectionHead, skel, skelCards, skelRows, errorState, segmented, countUp, progress, row, amount, badge, empty, btn, iconBtn, tipoIcon, tip } from '../ui/components.js';
import { donut, monthBars, gauge, PALETA } from '../ui/charts.js';
import { planMini } from './planejamentos.js';
import { ondeExtra } from '../ui/conta.js';

async function slot(el, loader, render) {
  try { const d = await loader(); el.replaceChildren(...[].concat(render(d)).filter(Boolean)); }
  catch (e) { el.replaceChildren(errorState(e.message, () => slot(el, loader, render))); }
}

export default async function inicio(ctx) {
  const { view, setTitle, go } = ctx;
  const u = store.boot.usuario;
  let priv = ls.get('nx.ocultar', false);
  const eye = iconBtn(priv ? 'eyeOff' : 'eye', priv ? 'Mostrar valores' : 'Ocultar valores', () => { priv = !priv; ls.set('nx.ocultar', priv); view.classList.toggle('is-private', priv); eye.replaceChildren(icon(priv ? 'eyeOff' : 'eye')); eye.setAttribute('aria-label', priv ? 'Mostrar valores' : 'Ocultar valores'); });
  setTitle('Olá, ' + ((u.nome || '').split(' ')[0] || 'tudo bem?'), { actions: [eye] });
  view.classList.toggle('is-private', priv);
  ctx.onCleanup(() => view.classList.remove('is-private'));

  if (!store.boot.recursos.length) {
    view.append(h('div', { class: 'welcome' }, h('span', { class: 'welcome-ico' }, icon('wallet')), h('h2', { class: 'welcome-title' }, 'Vamos começar pela sua conta'),
      can('editor') ? h('div', { class: 'btn-col' }, btn('Adicionar conta ou cartão', { size: 'lg', icon: 'plus', onClick: async () => (await import('./contas.js')).openRecursoForm() }), btn('Criar lista de compras', { kind: 'secondary', icon: 'cart', onClick: () => go('/compras') })) : null));
    return;
  }

  const hero = h('section', { class: 'hero', 'aria-label': 'Quanto tenho' }, skel('skel-line w-30 sm'), skel('skel-line w-60 xl'), skel('skel-line w-40 sm'));
  const tiles = h('div', { class: 'tiles' }, Array.from({ length: 4 }, () => h('div', { class: 'tile' }, skel('skel-line w-50 sm'), skel('skel-line w-70 lg'))));
  const onde = h('div', { class: 'hscroll' }, Array.from({ length: 3 }, () => h('div', { class: 'acct' }, skel('skel-line w-60 sm'), skel('skel-line w-80 lg'))));
  const gastoBody = h('div', {}, h('div', { class: 'donut-wrap' }, skel('skel-circle xl'), skelRows(4)));
  const serieBody = h('div', {}, skel('skel-block'));
  const planBody = h('div', {}, skelRows(3));
  const fluxBody = h('div', {}, skelRows(4));
  const alertBody = h('div', {});
  const resBody = h('div', {}, skelRows(3));
  let resOff = 0;
  const resLabel = h('span', { class: 'res-month' });
  const resNav = h('div', { class: 'res-nav' }, iconBtn('chevL', 'Mês anterior', () => { resOff++; loadRes(); }), resLabel, iconBtn('chevR', 'Próximo mês', () => { if (resOff > 0) { resOff--; loadRes(); } }));
  let periodo = 0, meses = 6;
  const per = () => { const ref = addMonths(monthStart(HOJE), -periodo); return { de: monthStart(ref), ate: monthEnd(ref) }; };

  view.append(
    h('div', { class: 'dash' },
      h('div', { class: 'dash-main' }, hero, tiles,
        h('section', { class: 'sec' }, sectionHead('Onde está', h('a', { class: 'link', href: '#/contas' }, 'Contas', icon('chevR'))), onde),
        card('sec-card', sectionHead('Gastos por categoria', segmented([{ value: 0, label: 'Este mês' }, { value: 1, label: 'Anterior' }], { value: 0, aria: 'Período', cls: 'seg--sm', onChange: (v) => { periodo = v; loadGasto(); } })), gastoBody),
        card('sec-card', sectionHead('Receitas e despesas', segmented([{ value: 6, label: '6 meses' }, { value: 12, label: '12 meses' }], { value: 6, aria: 'Meses', cls: 'seg--sm', onChange: (v) => { meses = v; loadSerie(); } })), serieBody)),
      h('div', { class: 'dash-side' },
        card('sec-card', sectionHead('Próximos', h('a', { class: 'link', href: '#/agenda' }, 'Agenda', icon('chevR'))), fluxBody),
        card('sec-card', sectionHead('Planejamentos', h('a', { class: 'link', href: '#/planejamentos' }, 'Ver todos', icon('chevR'))), planBody),
        card('sec-card', sectionHead('Resultado', resNav), resBody),
        alertBody)));

  const painel = (p) => load('relatorios.painel', p);
  slot(hero, () => painel(per()), (d) => {
    const v = h('span', { class: 'hero-v num money' });
    countUp(v, d.quanto_tenho);
    const [tP, tR, tC, tL] = [
      ['A pagar', d.a_pagar, 'out', 'out', '/agenda'], ['A receber', d.a_receber, 'in', 'in', '/agenda'],
      ['Comprometido nos cartões', d.comprometido_nos_cartoes, '', 'card', '/contas'], ['Limite disponível', d.limite_disponivel_total, '', 'card', '/contas']];
    tiles.replaceChildren(...[tP, tR, tC, tL].map(([l, val, tone, ic, to]) => h('a', { class: 'tile', href: '#' + to }, h('span', { class: 'tile-k' }, icon(ic, tone ? 'tone-' + tone : ''), l), h('span', { class: 'tile-v num money' + (tone ? ' tone-' + tone : '') }, money(val)))));
    onde.replaceChildren(...d.onde_esta.map((r) => h('a', { class: 'acct', href: '#/contas/' + r.recurso_id, dataset: { id: r.recurso_id } }, h('span', { class: 'acct-k' }, icon(r.tipo === 'CARTEIRA' ? 'coin' : 'wallet'), h('span', { class: 'truncate' }, r.nome)), h('span', { class: 'acct-v num money' + (r.saldo < 0 ? ' tone-out' : '') }, money(r.saldo)))),
      ...d.cartoes.map((k) => h('a', { class: 'acct acct--card', href: '#/contas/' + k.recurso_id }, h('span', { class: 'acct-k' }, icon('card'), h('span', { class: 'truncate' }, k.nome)),
        h('span', { class: 'acct-v num money' }, money(k.comprometido)), k.limite ? h('span', { class: 'acct-bar', style: { '--p': String(Math.min(1, k.comprometido / k.limite)) } }) : h('span', { class: 'acct-sub' }, 'Sem limite definido'))));
    load('relatorios.saldos', {}).then((s) => (s.contas || []).forEach((c) => { const el = onde.querySelector('[data-id="' + CSS.escape(c.id) + '"]'); if (el) el.append(...ondeExtra(c)); })).catch(() => {});
    return [h('span', { class: 'hero-k' }, 'Quanto tenho'), v, h('span', { class: 'hero-sub' }, 'Patrimônio líquido ', h('strong', { class: 'num money' }, money(d.patrimonio_liquido)), tip('Tudo o que você tem menos o que deve nos cartões.'))];
  });

  const loadGasto = () => slot(gastoBody, () => painel(per()), (d) => {
    const cats = d.gasto_por_categoria;
    if (!cats.length) return empty({ ic: 'tag', title: 'Nenhum gasto ' + (periodo ? 'no mês anterior' : 'neste mês') });
    const top = cats.slice(0, 6), rest = cats.slice(6).reduce((s, c) => s + c.valor, 0);
    const data = top.map((c, i) => ({ label: c.nome, value: c.valor, color: PALETA[i] })).concat(rest ? [{ label: 'Outras', value: rest, color: 'var(--c8)' }] : []);
    const legend = h('ol', { class: 'legend' }, data.map((c, i) => h('li', {}, h('button', { class: 'legend-item', type: 'button', onclick: () => ch.select(i) }, h('i', { class: 'chart-dot', style: { '--c': c.color } }), h('span', { class: 'legend-l truncate' }, c.label), h('span', { class: 'legend-v num money' }, money(c.value)), h('span', { class: 'legend-p num' }, pct((c.value / d.gasto_no_periodo) * 100))))));
    const ch = donut(data, { center: money(d.gasto_no_periodo).replace(/,\d\d$/, ''), centerSub: monthLong(per().de.slice(0, 7)), onSelect: (i) => [...legend.children].forEach((li, k) => li.classList.toggle('is-dim', i >= 0 && k !== i)) });
    return [h('div', { class: 'donut-wrap' }, ch, legend), h('div', { class: 'res-line' }, h('span', {}, 'Resultado do mês'), amount(d.resultado_no_periodo, { sign: true }))];
  });
  const loadSerie = () => slot(serieBody, () => load('relatorios.serie', { meses }), (d) => [monthBars(d.pontos, { media: d.media_despesas, labels: d.pontos.map((p) => monthShort(p.mes)) }),
    h('div', { class: 'chart-legend' }, h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--in)' } }), 'Receitas'), h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--out)' } }), 'Despesas'), h('span', {}, h('i', { class: 'chart-dash' }), 'Média de despesas ', h('strong', { class: 'num money' }, money(d.media_despesas))))]);
  const loadRes = () => {
    const ref = addMonths(monthStart(HOJE), -resOff);
    resLabel.textContent = monthShort(ref.slice(0, 7));
    return slot(resBody, () => load('relatorios.resultado', { de: monthStart(ref), ate: monthEnd(ref) }), (r) => [
      h('div', { class: 'kv-list' },
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, icon('in', 'tone-in'), 'Receitas'), h('span', { class: 'kv-v num tone-in money' }, money(r.receitas, { sign: true }))),
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, icon('out', 'tone-out'), 'Despesas'), h('span', { class: 'kv-v num tone-out money' }, money(-r.despesas))),
        r.encargos_financeiros ? h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Encargos', tip('Juros, multas e tarifas; ficam fora do gasto por categoria.')), h('span', { class: 'kv-v num tone-out money' }, money(-r.encargos_financeiros))) : null,
        h('div', { class: 'kv is-total' }, h('span', { class: 'kv-k' }, 'Resultado'), h('span', { class: 'kv-v num money tone-' + (r.resultado < 0 ? 'out' : 'in') }, money(r.resultado, { sign: true })))),
      r.receitas_por_categoria.length ? h('div', { class: 'list list--flush' }, r.receitas_por_categoria.slice(0, 3).map((c) => row({ lead: h('span', { class: 'tipo-ico tone-in' }, icon('in')), title: c.nome, trail: h('span', { class: 'num money' }, money(c.valor)) }))) : null]);
  };
  loadGasto(); loadSerie(); loadRes();
  slot(planBody, () => painel(per()), (d) => (d.planejamentos.length ? h('div', { class: 'plan-mini' }, d.planejamentos.slice(0, 4).map(planMini)) : empty({ ic: 'target', title: 'Sem planejamentos ativos', action: can('editor') ? btn('Criar planejamento', { kind: 'secondary', onClick: () => go('/planejamentos') }) : null })));
  slot(fluxBody, () => load('relatorios.fluxo', { ate: monthEnd(addMonths(HOJE, 1)) }), (d) => {
    const its = d.itens.slice(0, 6);
    if (!its.length) return empty({ ic: 'calendar', title: 'Nada a pagar ou receber' });
    return h('div', { class: 'list list--flush' }, its.map((i) => row({
      cls: i.atrasado ? 'is-late' : '', lead: i.origem === 'FATURA' ? h('span', { class: 'tipo-ico tone-out' }, icon('card')) : tipoIcon(i.tipo === 'PAGAR' ? 'SAIDA' : 'ENTRADA'),
      title: i.descricao, badges: i.atrasado ? [badge('Atrasado', 'out', 'alert')] : null, sub: dayLabel(i.data),
      trail: amount(i.valor, { tipo: i.tipo === 'PAGAR' ? 'SAIDA' : 'ENTRADA' }),
      onClick: () => go(i.origem === 'FATURA' ? '/contas/' + i.recurso_id : '/agenda'),
      aria: `${i.descricao}, ${money(i.valor)}, ${relDate(i.data)}`,
    })));
  });
  slot(alertBody, () => load('alertas.precos', {}), (a) => (a.length ? card('sec-card', sectionHead('Preços em queda'), h('div', { class: 'list list--flush' }, a.slice(0, 4).map((x) => row({
    lead: h('span', { class: 'tipo-ico tone-in' }, icon('down')), title: x.produto.nome, sub: `${x.loja} · antes ${money(x.ultimo_pago)}`, badges: x.verificado ? [badge('Verificado', 'in', 'verified')] : null,
    trail: h('span', { class: 'num tone-in' }, money(x.preco_encontrado)), trailSub: '\u2212' + x.queda_pct + '%', onClick: () => go('/compras/produto/' + x.produto.id),
  })))) : null));
}
