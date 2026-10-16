// Lançamentos: busca, filtros, lista agrupada por dia com rolagem infinita, deslizar, segurar para selecionar
import { h, money, dayLabel, HOJE, monthStart, monthEnd, addMonths, addDays, dmy, ls, emit, uuid, monthLong } from '../util.js';
import { icon } from '../icons.js';
import { call } from '../api.js';
import { store, can, catNome } from '../store.js';
import { pick, pickDate } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { infinite } from '../ui/gestures.js';
import { chip, searchBox, skelRows, empty, errorState, btn, iconBtn, row, TIPO, STATUS } from '../ui/components.js';
import { lancRow } from './lancAcoes.js';
import { categoriaItems, recursoItems } from './lancForm.js';

const PERIODOS = () => [
  { value: 'mes', label: 'Este mês', de: monthStart(HOJE), ate: monthEnd(HOJE) },
  { value: 'ant', label: 'Mês anterior', de: monthStart(addMonths(HOJE, -1)), ate: monthEnd(addMonths(HOJE, -1)) },
  { value: '30', label: 'Últimos 30 dias', de: addDays(HOJE, -30), ate: HOJE },
  { value: 'prox', label: 'Próximos 30 dias', de: HOJE, ate: addDays(HOJE, 30) },
  { value: 'ano', label: 'Este ano', de: HOJE.slice(0, 4) + '-01-01', ate: HOJE.slice(0, 4) + '-12-31' },
  { value: 'tudo', label: 'Tudo', de: null, ate: null },
  { value: 'pers', label: 'Escolher datas…' },
];

export default async function lancamentos(ctx) {
  const { view, setTitle, query } = ctx;
  const f = Object.assign({ periodo: 'mes', de: monthStart(HOJE), ate: monthEnd(HOJE), tipo: null, status: null, categoria_id: null, recurso_id: null, texto: '' }, ls.get('nx.filtros', {}));
  if (query.get('recurso')) Object.assign(f, { recurso_id: query.get('recurso'), periodo: 'tudo', de: null, ate: null });
  const sel = new Map();
  const selection = { active: () => sel.size > 0, toggle: (l, el) => { if (sel.has(l.id)) { sel.delete(l.id); el.classList.remove('is-sel'); } else { sel.set(l.id, l); el.classList.add('is-sel'); } drawSel(); } };
  setTitle('Lançamentos');
  const search = searchBox({ placeholder: 'Buscar lançamentos', value: f.texto, onSearch: (v) => { f.texto = v; reload(); } });
  const chips = h('div', { class: 'chip-row chip-row--scroll', role: 'toolbar', 'aria-label': 'Filtros' });
  const count = h('p', { class: 'list-count', 'aria-live': 'polite' });
  // Futuros (data depois de hoje) ficam num grupo recolhido no topo: o lançamento efetivado mais recente e os atrasados aparecem logo ao abrir
  const futBox = h('div', { class: 'list list--grouped', hidden: true });
  const list = h('div', { class: 'list list--grouped' });
  const selBar = h('div', { class: 'selbar', hidden: true, role: 'toolbar', 'aria-label': 'Seleção' });
  view.append(h('div', { class: 'sticky-tools' }, search, chips), count, futBox, list, selBar);

  const per = () => (f.periodo === 'pers' ? { label: `${dmy(f.de)} – ${dmy(f.ate)}` } : PERIODOS().find((p) => p.value === f.periodo)) || PERIODOS()[5];
  function drawChips() {
    const P = per();
    const mk = (label, active, onClick, clear) => {
      const c = chip(label, { selected: active, onClick, ic: active ? null : 'chevD', cls: 'chip--filter' });
      if (active && clear) c.append(h('span', { class: 'chip-x', role: 'button', tabindex: '0', 'aria-label': 'Limpar ' + label, onclick: (e) => { e.stopPropagation(); clear(); } }, icon('x')));
      return c;
    };
    chips.replaceChildren(
      mk(f.periodo === 'tudo' ? 'Período' : P.label, f.periodo !== 'tudo', choosePeriodo, () => { f.periodo = 'tudo'; f.de = f.ate = null; reload(); }),
      mk(f.tipo ? TIPO[f.tipo].label : 'Tipo', !!f.tipo, async () => { const v = await pick({ title: 'Tipo', value: f.tipo, items: Object.entries(TIPO).map(([k, t]) => ({ value: k, label: t.label, icon: t.icon, tone: t.tone })) }); if (v !== undefined) { f.tipo = v; reload(); } }, () => { f.tipo = null; reload(); }),
      mk(f.status ? STATUS[f.status].label : 'Situação', !!f.status, async () => { const v = await pick({ title: 'Situação', value: f.status, items: Object.entries(STATUS).map(([k, t]) => ({ value: k, label: t.label, icon: t.icon, tone: t.tone })) }); if (v !== undefined) { f.status = v; reload(); } }, () => { f.status = null; reload(); }),
      mk(f.categoria_id ? catNome(f.categoria_id) : 'Categoria', !!f.categoria_id, async () => { const v = await pick({ title: 'Categoria', value: f.categoria_id, items: [...categoriaItems('DESPESA'), ...categoriaItems('RECEITA')] }); if (v !== undefined) { f.categoria_id = v; reload(); } }, () => { f.categoria_id = null; reload(); }),
      mk(f.recurso_id ? (store.recs.get(f.recurso_id) || {}).nome || 'Conta' : 'Conta', !!f.recurso_id, async () => { const v = await pick({ title: 'Conta ou cartão', value: f.recurso_id, items: recursoItems() }); if (v !== undefined) { f.recurso_id = v; reload(); } }, () => { f.recurso_id = null; reload(); }));
  }
  async function choosePeriodo() {
    const v = await pick({ title: 'Período', value: f.periodo, items: PERIODOS().map((p) => ({ value: p.value, label: p.label, sub: p.de ? `${dmy(p.de)} – ${dmy(p.ate)}` : null })) });
    if (v === undefined) return;
    if (v === 'pers') {
      const de = await pickDate({ title: 'De', value: f.de || monthStart(HOJE) }); if (!de) return;
      const ate = await pickDate({ title: 'Até', value: f.ate && f.ate >= de ? f.ate : de, min: de }); if (!ate) return;
      Object.assign(f, { periodo: 'pers', de, ate });
    } else { const p = PERIODOS().find((x) => x.value === v); Object.assign(f, { periodo: v, de: p.de, ate: p.ate }); }
    reload();
  }
  function drawSel() {
    selBar.hidden = !sel.size;
    if (!sel.size) return;
    const fut = [...sel.values()].filter((l) => ['PLANEJADO', 'PENDENTE'].includes(l.status));
    const tot = [...sel.values()].reduce((s, l) => s + (TIPO[l.tipo].sign || 0) * l.valor_total, 0);
    selBar.replaceChildren(iconBtn('x', 'Limpar seleção', () => { sel.clear(); view.querySelectorAll('.is-sel').forEach((e) => e.classList.remove('is-sel')); drawSel(); }),
      h('span', { class: 'selbar-txt' }, h('strong', {}, `${sel.size} selecionado${sel.size > 1 ? 's' : ''}`), h('span', { class: 'num' }, money(tot, { sign: true }))),
      can('editor') && fut.length ? btn(`Efetivar ${fut.length}`, { icon: 'check', onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        let ok = 0;
        for (const l of fut) { try { await call('lancamentos.efetivar', { id: l.id }, { rid: uuid() }); ok++; } catch (x) { toast(l.descricao + ': ' + x.message, { tone: 'danger' }); } }
        toast(`${ok} efetivado${ok > 1 ? 's' : ''}.`, { tone: 'success' }); sel.clear(); emit('dados');
      } }) : null);
  }

  // Recolhe só quando a pessoa não está pedindo os futuros (Situação Planejado/Pendente, "Próximos 30 dias" ou datas só no futuro)
  const AMANHA = addDays(HOJE, 1);
  const recolhe = () => !['PLANEJADO', 'PENDENTE'].includes(f.status) && f.periodo !== 'prox' && !(f.periodo === 'pers' && f.de > HOJE) && (!f.ate || f.ate > HOJE);
  let fut = { total: 0, itens: [] }, futAberto = false, futSeq = 0, nMain = null;
  const filtrosApi = () => ({ texto: f.texto || undefined, tipo: f.tipo || undefined, status: f.status || undefined, categoria_id: f.categoria_id || undefined, recurso_id: f.recurso_id || undefined });
  const drawCount = () => {
    const nF = recolhe() ? fut.total : 0;
    if (nMain == null) { count.textContent = ''; return; }
    count.textContent = [nMain ? `${nMain} lançamento${nMain > 1 ? 's' : ''} até hoje` : null, nF ? `${nF} planejado${nF > 1 ? 's' : ''} à frente` : null].filter(Boolean).join(' · ') || '';
  };
  function drawFut() {
    const its = fut.itens;
    futBox.hidden = !its.length;
    if (!its.length) { futBox.replaceChildren(); return; }
    let pagar = 0, receber = 0;
    its.forEach((l) => { if (!['PLANEJADO', 'PENDENTE'].includes(l.status)) return; if (l.tipo === 'SAIDA') pagar += l.valor_total; else if (l.tipo === 'ENTRADA') receber += l.valor_total; });
    const prim = its[0].data_evento, ult = its[its.length - 1].data_evento;
    const quando = prim === ult ? dmy(prim) : `de ${dmy(prim).slice(0, 5)} a ${dmy(ult)}`;
    const valores = [pagar ? '\u2212' + money(pagar) : null, receber ? '+' + money(receber) : null].filter(Boolean);
    const head = row({
      cls: 'fut-head',
      lead: h('span', { class: 'tipo-ico' }, icon(futAberto ? 'chevU' : 'chevD')),
      title: `Planejados (${fut.total})`, sub: quando,
      trail: pagar ? h('span', { class: 'num tone-out' }, valores[0]) : receber ? h('span', { class: 'num tone-in' }, valores[0]) : null,
      trailSub: pagar && receber ? h('span', { class: 'num tone-in' }, valores[1]) : null,
      aria: `Planejados à frente: ${fut.total}, ${quando}${pagar ? ', a pagar ' + money(pagar) : ''}${receber ? ', a receber ' + money(receber) : ''}. ${futAberto ? 'Recolher' : 'Mostrar'}`,
      onClick: () => { futAberto = !futAberto; drawFut(); futBox.querySelector('.fut-head').focus(); },
    });
    head.setAttribute('aria-expanded', String(futAberto));
    head.setAttribute('aria-controls', 'fut-itens');
    const body = h('div', { id: 'fut-itens', hidden: !futAberto });
    if (futAberto) {
      // Do mais próximo para o mais distante: é a ordem de "o que vem a seguir", como na Agenda
      let dia = null, g = null;
      its.forEach((l) => {
        if (l.data_evento !== dia) { dia = l.data_evento; g = h('div', { class: 'day', role: 'group', 'aria-label': dayLabel(dia) }, h('h3', { class: 'day-h is-future' }, dayLabel(dia))); body.append(g); }
        const el = lancRow(l, { selection }); if (sel.has(l.id)) el.classList.add('is-sel'); g.append(el);
      });
      if (fut.total > its.length) body.append(h('div', { class: 'btn-inline' }, btn(`Ver todos os ${fut.total}`, { kind: 'ghost', size: 'sm', icon: 'calendar', onClick: () => { f.status = 'PLANEJADO'; reload(); } })));
    }
    futBox.replaceChildren(head, body);
  }
  async function loadFut() {
    const n = ++futSeq;
    fut = { total: 0, itens: [] };
    if (!recolhe()) { futBox.hidden = true; futBox.replaceChildren(); return; }
    futBox.hidden = false; futBox.replaceChildren(skelRows(1));
    try {
      const r = await call('lancamentos.listar', { ...filtrosApi(), de: f.de && f.de > AMANHA ? f.de : AMANHA, ate: f.ate || undefined, offset: 0, limite: 200 });
      if (n !== futSeq) return;
      fut = { total: r.total, itens: r.itens.slice().reverse() };
      if (f.texto && fut.total) futAberto = true;            // busca: o que casou nos futuros já aparece
      drawFut(); drawCount();
    } catch (e) { if (n === futSeq) futBox.replaceChildren(errorState(e.message, loadFut)); }
  }

  let inf = null;
  function reload() {
    ls.set('nx.filtros', { ...f, recurso_id: query.get('recurso') ? null : f.recurso_id });
    drawChips();
    sel.clear(); drawSel();
    inf && inf.stop();
    list.replaceChildren();
    count.textContent = ''; nMain = null; futAberto = false;
    const corta = recolhe();
    loadFut();
    let lastDay = null, group = null;
    inf = infinite({
      container: list, skeleton: () => skelRows(4),
      load: async (offset, limite) => {
        const p = { offset, limite, ...filtrosApi(), de: f.de || undefined, ate: corta ? HOJE : f.ate || undefined };
        const r = await call('lancamentos.listar', p);
        if (offset === 0) { nMain = corta ? r.total : null; if (corta) drawCount(); else count.textContent = r.total ? `${r.total} lançamento${r.total > 1 ? 's' : ''}` : ''; }
        return r;
      },
      render: (itens) => {
        for (const l of itens) {
          if (l.data_evento !== lastDay) {
            lastDay = l.data_evento;
            group = h('div', { class: 'day', role: 'group', 'aria-label': dayLabel(l.data_evento) }, h('h3', { class: 'day-h' + (l.data_evento > HOJE ? ' is-future' : '') }, dayLabel(l.data_evento)));
            list.append(group);
          }
          const el = lancRow(l, { selection });
          el.classList.add('enter');
          group.append(el);
        }
      },
      onEmpty: () => list.replaceChildren(empty({ ic: f.texto ? 'search' : 'list', title: corta && fut.total ? 'Nenhum lançamento até hoje neste período' : f.texto || f.tipo || f.status || f.categoria_id || f.recurso_id || f.periodo !== 'tudo' ? 'Nada com esses filtros' : 'Nenhum lançamento ainda',
        action: f.texto || f.tipo || f.status || f.categoria_id || f.recurso_id || f.periodo !== 'tudo' ? btn('Limpar filtros', { kind: 'secondary', onClick: () => { Object.assign(f, { periodo: 'tudo', de: null, ate: null, tipo: null, status: null, categoria_id: null, recurso_id: null, texto: '' }); search.input.value = ''; reload(); } })
          : can('editor') ? btn('Novo lançamento', { icon: 'plus', onClick: async () => (await import('./lancForm.js')).openLancForm() }) : null })),
      onError: (e, retry) => list.append(errorState(e.message, (ev) => { ev.currentTarget.closest('.empty').remove(); retry(); })),
    });
  }
  ctx.onCleanup(() => inf && inf.stop());
  reload();
}
