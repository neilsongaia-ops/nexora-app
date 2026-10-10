// Planejamentos: limite de gasto ou meta de entrada; avulsos ou recorrentes (série de períodos)
import { h, money, dmy, dm, HOJE, monthStart, monthEnd, addDays, addMonths, uuid, emit, pct } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { can, catNome } from '../store.js';
import { openSheet, openMenu, confirmSheet, pick, pickDate } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { progress, badge, empty, errorState, skelCards, skelRows, btn, iconBtn, kv, sectionHead, textField, moneyField, dateField, stepper, formError, tip, row, segmented, toggle, field, chip } from '../ui/components.js';
import { categoriaItems } from './lancForm.js';

let filtro = 'vigentes';

const isMeta = (p) => p.tipo === 'ENTRADA';
const metaOk = (p) => (p.meta_atingida != null ? !!p.meta_atingida : p.planejado > 0 && p.realizado >= p.planejado);
const pctDe = (p) => (p.percentual != null ? p.percentual : p.planejado ? (p.realizado / p.planejado) * 100 : 0);
const periodo = (p) => dmy(p.data_inicio) + (p.data_fim ? ' a ' + dmy(p.data_fim) : ' em diante');
const curto = (a, b) => (a === b ? dm(a) : a.slice(0, 7) === b.slice(0, 7) ? Number(a.slice(8, 10)) + ' a ' + dm(b) : dm(a) + ' a ' + dm(b));

const UN = { MENSAL: ['todo mês', 'meses'], ANUAL: ['todo ano', 'anos'], SEMANAL: ['toda semana', 'semanas'], DIARIA: ['todo dia', 'dias'], A_CADA_N_DIAS: ['todo dia', 'dias'] };
export function recLabel(r) {
  const u = UN[r.periodicidade] || UN.MENSAL, n = Number(r.intervalo) || 1;
  return 'Repete ' + (n > 1 ? 'a cada ' + n + ' ' + u[1] : u[0]);
}
const recTexto = (r) => recLabel(r) + (r.ate ? ' até ' + dmy(r.ate) : '') + (r.status === 'PAUSADA' ? ' · pausado' : r.status === 'ENCERRADA' ? ' · encerrado' : '');
function fimCalc(ini, per, n) {
  n = Math.max(1, Number(n) || 1);
  if (per === 'MENSAL') return addDays(addMonths(ini, n), -1);
  if (per === 'ANUAL') return addDays(addMonths(ini, 12 * n), -1);
  if (per === 'SEMANAL') return addDays(ini, 7 * n - 1);
  return addDays(ini, n - 1);
}

export function metaBar(planejado, realizado, label) {
  const p = Math.max(0, Number(planejado) || 0), r = Math.max(0, Number(realizado) || 0), ok = p > 0 && r >= p;
  const el = h('div', { class: 'meter meter--meta' + (ok ? ' is-met' : ''), role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(p), 'aria-valuenow': String(Math.min(r, p)), 'aria-valuetext': (p ? Math.round((r / p) * 100) : 0) + '% da meta', 'aria-label': label || 'Meta' },
    h('span', { class: 'meter-fill' }));
  el.style.setProperty('--fill', String(p ? Math.min(1, r / p) : 0));
  return el;
}

function repTags(p) {
  const r = p.recorrencia;
  if (!r) return null;
  if (r.status === 'ENCERRADA') return badge('Encerrado', 'muted', 'ban');
  return [h('span', { class: 'plan-rep' }, icon('repeat'), recLabel(r)), r.status === 'PAUSADA' ? badge('Pausado', 'warn', 'clock') : null];
}

function planCard(p) {
  const meta = isMeta(p), ok = meta && metaOk(p), over = !meta && p.excedido > 0;
  const ratio = p.planejado ? p.realizado / p.planejado : 0;
  const top = meta ? null : over ? badge('Excedido', 'out', 'alert') : ratio > 0.85 ? badge('Quase no limite', 'warn', 'clock') : null;
  const foot = meta
    ? ok ? h('span', { class: 'plan-ok num' }, icon('check'), 'Meta batida' + (p.excedido > 0 ? ' · +' + money(p.excedido) : '')) : h('span', { class: 'num' }, 'Falta ' + money(p.disponivel))
    : over ? h('span', { class: 'tone-out num' }, money(p.excedido) + ' acima') : h('span', { class: 'num' }, money(p.disponivel) + ' disponíveis');
  return h('button', { class: 'card plan' + (over ? ' is-over' : '') + (ok ? ' is-met' : ''), type: 'button', onclick: () => detalhe(p.id) },
    h('div', { class: 'plan-top' }, h('span', { class: 'plan-name truncate' }, p.nome), top),
    h('div', { class: 'plan-line' }, h('span', { class: 'plan-period' }, periodo(p)), repTags(p)),
    h('div', { class: 'plan-nums' }, h('span', { class: 'plan-real num' }, money(p.realizado)), h('span', { class: 'muted num' }, (meta ? 'recebidos de ' : 'de ') + money(p.planejado))),
    meta ? metaBar(p.planejado, p.realizado, p.nome) : progress(p.planejado, p.realizado, { label: p.nome }),
    h('div', { class: 'plan-foot' }, foot, h('span', { class: 'muted num' }, pct(pctDe(p)))));
}

export function planMini(p) {
  const meta = isMeta(p);
  const right = meta
    ? metaOk(p) ? badge('Meta batida', 'in', 'check') : h('span', { class: 'num muted money' }, 'Falta ' + money(p.disponivel))
    : p.excedido > 0 ? badge('Excedido ' + money(p.excedido), 'out', 'alert') : h('span', { class: 'num muted money' }, money(p.disponivel) + ' livres');
  return h('a', { class: 'plan-mini-item', href: '#/planejamentos' },
    h('div', { class: 'plan-mini-top' }, h('span', { class: 'truncate' }, p.nome), right),
    meta ? metaBar(p.planejado, p.realizado, p.nome) : progress(p.planejado, p.realizado, { label: p.nome }));
}

export default async function planejamentos(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Planejamentos', { actions: [can('editor') ? iconBtn('plus', 'Novo planejamento', () => planForm()) : null] });
  const grid = h('div', { class: 'plan-grid' }, skelCards(3));
  const seg = segmented([{ value: 'vigentes', label: 'Vigentes' }, { value: 'todos', label: 'Todos' }], { value: filtro, aria: 'Mostrar planejamentos', cls: 'seg--sm plan-filter', onChange: (v) => { filtro = v; carregar(); } });
  view.append(seg, grid);
  async function carregar() {
    grid.replaceChildren(skelCards(3));
    try {
      const ps = await load('planejamentos.listar', filtro === 'vigentes' ? { vigentes: true } : {});
      if (!ps.length) {
        grid.replaceChildren(empty({ ic: 'target', title: filtro === 'vigentes' ? 'Nenhum planejamento vigente' : 'Nenhum planejamento', action: can('editor') ? btn('Criar planejamento', { icon: 'plus', onClick: () => planForm() }) : null }));
        return;
      }
      const alerta = (p) => (!isMeta(p) && p.excedido > 0 ? 1 : 0);
      const ord = filtro === 'vigentes'
        ? (a, b) => alerta(b) - alerta(a) || a.prioridade - b.prioridade
        : (a, b) => (a.data_inicio < b.data_inicio ? 1 : a.data_inicio > b.data_inicio ? -1 : 0) || a.prioridade - b.prioridade;
      grid.replaceChildren(...ps.slice().sort(ord).map((p) => planCard(p)));
    } catch (e) { grid.replaceChildren(errorState(e.message, carregar)); }
  }
  await carregar();
}

const tile = (k, v, cls = '') => h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, k), h('span', { class: 'tile-v num ' + cls }, v));

function catRow(c, meta) {
  const nome = c.nome || catNome(c.categoria_id);
  if (!meta) {
    return h('div', { class: 'plan-cat' + (c.excedido ? ' is-over' : '') },
      h('div', { class: 'plan-cat-top' }, h('span', { class: 'truncate' }, nome), c.percentual_execucao < 100 ? badge(c.percentual_execucao + '%', 'neutral') : null, h('span', { class: 'num' }, money(c.realizado), h('span', { class: 'muted' }, ' / ' + money(c.limite)))),
      progress(c.limite, c.realizado, { label: nome }),
      c.excedido ? h('span', { class: 'plan-cat-sub tone-out num' }, icon('alert'), money(c.excedido) + ' acima') : h('span', { class: 'plan-cat-sub muted num' }, money(c.disponivel) + ' disponíveis'));
  }
  const ok = c.limite > 0 && c.realizado >= c.limite;
  return h('div', { class: 'plan-cat' },
    h('div', { class: 'plan-cat-top' }, h('span', { class: 'truncate' }, nome), c.percentual_execucao < 100 ? badge(c.percentual_execucao + '%', 'neutral') : null,
      h('span', { class: 'num' }, money(c.realizado), c.limite ? h('span', { class: 'muted' }, ' / ' + money(c.limite)) : null)),
    c.limite ? metaBar(c.limite, c.realizado, nome) : null,
    c.limite ? (ok ? h('span', { class: 'plan-cat-sub plan-ok num' }, icon('check'), 'Meta batida') : h('span', { class: 'plan-cat-sub muted num' }, 'Falta ' + money(c.disponivel))) : null);
}

function serieRow(x) {
  const meta = isMeta(x);
  const st = meta ? (metaOk(x) ? badge('Meta batida', 'in', 'check') : badge(pct(pctDe(x)) + ' da meta', 'neutral'))
    : x.excedido > 0 ? badge('Excedido', 'out', 'alert') : badge(pct(pctDe(x)) + ' do limite', 'neutral');
  return row({ title: periodo(x), badges: st, trail: h('span', { class: 'num' }, money(x.realizado)), trailSub: (meta ? 'meta ' : 'de ') + money(x.planejado), onClick: () => detalhe(x.id) });
}

const basePayload = (p) => ({ id: p.id, versao: p.versao, nome: p.nome, data_inicio: p.data_inicio, data_fim: p.data_fim, valor_limite: p.planejado, prioridade: p.prioridade, status: p.status || 'ATIVO',
  categorias: p.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: c.limite || undefined, percentual_execucao: c.percentual_execucao || 100 })) });

async function detalhe(id) {
  const s = openSheet({ title: 'Planejamento', snap: true, size: 'full', content: skelCards(2) });
  try {
    const p = await call('planejamentos.situacao', { id });
    const meta = isMeta(p), ok = meta && metaOk(p);
    s.setTitle(p.nome);
    const tiles = meta
      ? [tile('Meta', money(p.planejado)), tile('Recebido', money(p.realizado), 'tone-in'), ok ? tile('Acima da meta', money(p.excedido), 'tone-in') : tile('Falta', money(p.disponivel))]
      : [tile('Planejado', money(p.planejado)), tile('Realizado', money(p.realizado), p.excedido ? 'tone-out' : ''), tile(p.excedido ? 'Excedido' : 'Disponível', money(p.excedido || p.disponivel), p.excedido ? 'tone-out' : 'tone-in')];
    const serieBox = p.serie_id ? h('div', {}, skelRows(2)) : null;
    const r = p.recorrencia;
    s.setContent([
      h('div', { class: 'plan-det' },
        ok ? h('div', { class: 'plan-met', role: 'status' }, icon('check'), 'Meta batida') : null,
        h('div', { class: 'tiles tiles--3' }, tiles),
        meta ? metaBar(p.planejado, p.realizado, p.nome) : progress(p.planejado, p.realizado, { label: p.nome }),
        h('span', { class: 'plan-pct muted num' }, pct(pctDe(p), 1) + (meta ? ' da meta' : ' do limite'))),
      sectionHead('Por categoria'),
      h('div', { class: 'list' }, p.categorias.map((c) => catRow(c, meta))),
      h('div', { class: 'kv-list' },
        kv('Tipo', meta ? 'Meta de entrada' : 'Limite de gasto'),
        kv('Período', periodo(p)),
        r ? kv('Repetição', recTexto(r)) : null,
        r && r.proximo_inicio ? kv('Próximo período', dmy(r.proximo_inicio)) : null,
        kv(h('span', { class: 'kv-tip' }, 'Prioridade', tip('Se uma categoria está em mais de um planejamento, conta no de menor número.')), String(p.prioridade))),
      serieBox ? [sectionHead('Períodos anteriores'), serieBox] : null,
    ]);
    let latest = !p.serie_id || !!r;
    const setFoot = () => {
      if (!can('editor')) return;
      const comMenu = latest && !!r;
      const ed = btn('Editar', { kind: 'secondary', icon: 'edit', full: !comMenu, onClick: async () => { await s.close(); planForm(p, { latest }); } });
      s.setFooter(comMenu ? h('div', { class: 'btn-row' }, ed, btn('', { kind: 'secondary', icon: 'dots', aria: 'Repetição', onClick: () => menuRep(p, s) })) : ed);
    };
    setFoot();
    if (p.serie_id) {
      load('planejamentos.listar', { serie_id: p.serie_id }).then((lista) => {
        latest = !lista.some((x) => x.id !== p.id && x.data_inicio > p.data_inicio);
        const ant = lista.filter((x) => x.id !== p.id && x.data_inicio < p.data_inicio).sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1));
        serieBox.replaceChildren(ant.length ? h('div', { class: 'list' }, ant.map(serieRow)) : h('p', { class: 'plan-hint' }, 'Nenhum período anterior'));
        setFoot();
      }).catch((e) => { serieBox.replaceChildren(errorState(e.message)); });
    }
  } catch (e) { s.setContent(errorState(e.message, () => { s.close(); detalhe(id); })); }
}

function menuRep(p, s) {
  const r = p.recorrencia;
  const aplicar = async (rec, msg) => {
    try {
      await call('planejamentos.salvar', { ...basePayload(p), recorrencia: rec }, { rid: uuid() });
      await s.close(); toast(msg, { tone: 'success' }); emit('dados');
    } catch (e) { toast(e.message, { tone: 'danger' }); }
  };
  const regra = (status) => ({ periodicidade: r.periodicidade, intervalo: r.intervalo || 1, ate: r.ate || '', status });
  const perguntar = async (title, texto, confirm, tone, rec, msg) => {
    if (await confirmSheet({ title, content: h('p', { class: 'menu-sub' }, texto), confirm, tone })) aplicar(rec, msg);
  };
  openMenu({ title: 'Repetição', subtitle: recTexto(r), items: [
    r.status === 'ATIVA' ? { label: 'Pausar', icon: 'clock', onClick: () => perguntar('Pausar a repetição?', 'O próximo período não será criado enquanto estiver pausado.', 'Pausar', 'primary', regra('PAUSADA'), 'Repetição pausada.') } : null,
    r.status === 'PAUSADA' ? { label: 'Retomar', icon: 'repeat', onClick: () => perguntar('Retomar a repetição?', 'O próximo período volta a ser criado sozinho.', 'Retomar', 'primary', regra('ATIVA'), 'Repetição retomada.') } : null,
    r.status !== 'ENCERRADA' ? { label: 'Encerrar', icon: 'ban', tone: 'out', onClick: () => perguntar('Encerrar a série?', 'Este período segue até o fim. Não haverá próximos.', 'Encerrar', 'danger', regra('ENCERRADA'), 'Série encerrada.') } : null,
    { label: 'Parar de repetir', icon: 'x', onClick: () => perguntar('Parar de repetir?', 'Os períodos já criados ficam como estão.', 'Parar', 'danger', null, 'O planejamento não se repete mais.') },
  ] });
}

function perguntarAplicar() {
  return new Promise((res) => {
    let v = null;
    const s = openSheet({
      title: 'Aplicar a este período ou também aos próximos?',
      content: h('div', { class: 'plan-aplicar' },
        btn('Só este período', { kind: 'secondary', full: true, size: 'lg', onClick: () => { v = false; s.close(); } }),
        btn('Este e os próximos', { full: true, size: 'lg', onClick: () => { v = true; s.close(); } })),
      onClose: () => res(v),
    });
  });
}

const PER = [['MENSAL', 'Todo mês'], ['ANUAL', 'Todo ano'], ['SEMANAL', 'Toda semana'], ['DIARIA', 'Todo dia'], ['A_CADA_N_DIAS', 'A cada N dias']];
const INT = { MENSAL: { min: 1, max: 24, um: 'mês', v: 'meses' }, A_CADA_N_DIAS: { min: 2, max: 366, um: 'dia', v: 'dias' } };

function planForm(edit, { latest = true } = {}) {
  const rid = uuid(), err = formError();
  const had = edit ? edit.recorrencia : null;
  const canRec = !edit || latest;
  const st = edit
    ? { tipo: edit.tipo || 'SAIDA', nome: edit.nome, data_inicio: edit.data_inicio, data_fim: edit.data_fim, valor_limite: edit.planejado, prioridade: edit.prioridade,
      categorias: edit.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: c.limite, percentual_execucao: c.percentual_execucao || 100 })) }
    : { tipo: 'SAIDA', nome: '', data_inicio: monthStart(HOJE), data_fim: monthEnd(HOJE), valor_limite: 0, prioridade: 1, categorias: [] };
  Object.assign(st, { rep: !!had, periodicidade: had ? had.periodicidade : 'MENSAL', intervalo: had ? Number(had.intervalo) || 1 : 1, ate: (had && had.ate) || '' });
  const valores = () => JSON.stringify([st.valor_limite, st.prioridade, st.categorias]);
  const regraDe = () => JSON.stringify([st.periodicidade, st.intervalo, st.ate || '']);
  const vOrig = valores(), rOrig = regraDe();
  let fn, fv;

  const build = () => {
    const meta = st.tipo === 'ENTRADA', L = meta ? 'Meta' : 'Limite';
    fn = textField('Nome', { value: st.nome, placeholder: meta ? 'Ex.: Renda do mês' : 'Ex.: Mercado do mês', autofocus: true, onInput: (v) => { st.nome = v; fn.setError(''); } });
    fv = moneyField(L, { value: st.valor_limite, big: true, onChange: (v) => { st.valor_limite = v; fv.setError(''); } });
    const tipoSeg = segmented([
      { value: 'SAIDA', label: 'Limite de gasto', icon: 'out', tone: 'out', disabled: !!edit },
      { value: 'ENTRADA', label: 'Meta de entrada', icon: 'in', tone: 'in', disabled: !!edit },
    ], { value: st.tipo, aria: 'Tipo de planejamento', cls: 'seg--tipo', onChange: (v) => {
      if (edit || v === st.tipo) return;
      st.tipo = v; st.categorias = [];
      s.setContent(build());
      requestAnimationFrame(() => { const b = s.body.querySelector('.seg--tipo [aria-checked="true"]'); if (b) b.focus(); });
    } });
    const tipoF = h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Tipo'), tip('Limite de gasto acompanha despesas. Meta de entrada acompanha o que você recebe.')), tipoSeg);

    const hint = h('p', { class: 'plan-hint num', 'aria-live': 'polite' });
    const updHint = () => {
      if (!st.rep) { hint.replaceChildren(); return; }
      if (!edit) { hint.replaceChildren(icon('calendar'), 'Este período: ' + curto(st.data_inicio, fimCalc(st.data_inicio, st.periodicidade, st.intervalo))); return; }
      const prox = had && had.status === 'ATIVA' && had.proximo_inicio && regraDe() === rOrig ? had.proximo_inicio : st.data_fim ? addDays(st.data_fim, 1) : '';
      hint.replaceChildren(...(prox ? [icon('calendar'), 'Próximo período a partir de ' + dmy(prox)] : []));
    };

    const datesBox = h('div', {});
    const drawDatas = () => {
      const ini = dateField('Início', { value: st.data_inicio, onChange: (v) => { st.data_inicio = v; if (st.data_fim && st.data_fim < v) st.data_fim = monthEnd(v); drawDatas(); updHint(); } });
      datesBox.replaceChildren(st.rep && !edit ? ini : h('div', { class: 'grid-2' }, ini,
        dateField('Fim', { value: st.data_fim || monthEnd(st.data_inicio), min: st.data_inicio, onChange: (v) => { st.data_fim = v; updHint(); } })));
    };

    let repSec = null;
    if (canRec) {
      const intBox = h('div', {});
      const drawInt = () => {
        const u = INT[st.periodicidade];
        if (!u) { intBox.replaceChildren(); return; }
        const inp = h('input', { class: 'input num', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: String(st.intervalo), 'aria-label': 'A cada quantos ' + u.v });
        const un = h('span', { class: 'muted' }, st.intervalo === 1 ? u.um : u.v);
        inp.addEventListener('input', () => { const n = Number(inp.value.replace(/\D/g, '').slice(0, 3)) || 0; inp.value = n ? String(n) : ''; st.intervalo = n; un.textContent = n === 1 ? u.um : u.v; updHint(); });
        inp.addEventListener('blur', () => { st.intervalo = Math.min(u.max, Math.max(u.min, st.intervalo || u.min)); inp.value = String(st.intervalo); un.textContent = st.intervalo === 1 ? u.um : u.v; updHint(); });
        intBox.replaceChildren(field('A cada', h('div', { class: 'plan-int' }, inp, un)));
      };
      const chips = PER.map(([v, l]) => { const c = chip(l, { selected: st.periodicidade === v, onClick: () => setPer(v) }); c._v = v; return c; });
      const setPer = (v) => {
        st.periodicidade = v;
        const u = INT[v];
        st.intervalo = u ? Math.min(u.max, Math.max(u.min, st.intervalo)) : 1;
        chips.forEach((c) => { const on = c._v === v; c.classList.toggle('is-sel', on); c.setAttribute('aria-pressed', String(on)); });
        drawInt(); updHint();
      };
      const ateTxt = h('span', { class: 'pickf-text' });
      const ateClear = iconBtn('x', 'Sem data final', () => { st.ate = ''; drawAte(); ateBtn.focus(); });
      const ateBtn = h('button', { class: 'input input--pick', type: 'button', 'aria-label': 'Repetir até' }, h('span', { class: 'pickf-ico' }, icon('calendar')), ateTxt, icon('chevD', 'pickf-chev'));
      ateBtn.addEventListener('click', async () => { const v = await pickDate({ title: 'Repetir até', value: st.ate || monthEnd(addMonths(st.data_inicio, 11)), min: st.data_inicio }); if (v) { st.ate = v; drawAte(); } });
      const drawAte = () => { ateTxt.textContent = st.ate ? dmy(st.ate) : 'Sem fim'; ateTxt.classList.toggle('is-ph', !st.ate); ateClear.hidden = !st.ate; };
      drawAte();
      const opts = h('div', { class: 'plan-rep-opts', hidden: !st.rep },
        h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Periodicidade' }, chips),
        intBox,
        h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Até')), h('div', { class: 'plan-ate' }, ateBtn, ateClear)),
        hint);
      drawInt();
      repSec = h('div', { class: 'plan-rep-form' },
        toggle('Repetir', { checked: st.rep, onChange: (v) => { st.rep = v; opts.hidden = !v; drawDatas(); updHint(); } }),
        opts);
    }
    drawDatas(); updHint();

    const catsBox = h('div', { class: 'plan-cats-wrap' });
    const drawCats = () => {
      const soma = st.categorias.reduce((a, c) => a + (c.valor_limite || 0), 0);
      catsBox.replaceChildren(
        sectionHead('Categorias', soma ? h('span', { class: 'muted num' }, money(soma)) : null),
        h('div', { class: 'plan-cats-form' }, st.categorias.map((c, i) => h('div', { class: 'plan-cat-form' },
          h('div', { class: 'plan-cat-form-top' }, h('span', { class: 'truncate' }, catNome(c.categoria_id)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remover ' + catNome(c.categoria_id), onclick: () => { st.categorias.splice(i, 1); drawCats(); } }, icon('x'))),
          h('div', { class: 'grid-2' }, moneyField(L, { value: c.valor_limite, onChange: (v) => { c.valor_limite = v; } }),
            h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Conta'), tip(meta ? 'Quanto de cada receita desta categoria entra nesta meta.' : 'Quanto de cada gasto desta categoria entra neste planejamento.')),
              stepper({ value: c.percentual_execucao, min: 5, max: 100, step: 5, label: 'Percentual', format: (v) => v + '%', onChange: (v) => { c.percentual_execucao = v; } })))))),
        btn('Adicionar categoria', { kind: 'ghost', icon: 'plus', onClick: async () => {
          const v = await pick({ title: meta ? 'Categoria de receita' : 'Categoria de despesa', items: categoriaItems(meta ? 'RECEITA' : 'DESPESA').filter((x) => !st.categorias.some((c) => c.categoria_id === x.value)) });
          if (v) { st.categorias.push({ categoria_id: v, valor_limite: 0, percentual_execucao: 100 }); drawCats(); }
        } }));
    };
    drawCats();

    return [err, tipoF, fn, fv, datesBox, repSec,
      h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Prioridade'), tip('Menor número vence quando a mesma categoria está em dois planejamentos.')), stepper({ value: st.prioridade, min: 1, max: 20, label: 'Prioridade', onChange: (v) => { st.prioridade = v; } })),
      catsBox];
  };

  const b = btn(edit ? 'Salvar' : 'Criar planejamento', { size: 'lg', full: true });
  b.onclick = async () => {
    const meta = st.tipo === 'ENTRADA';
    let bad = false;
    if (!st.nome.trim()) { fn.setError('Dê um nome'); bad = true; }
    if (!(st.valor_limite > 0)) { fv.setError(meta ? 'Informe a meta' : 'Informe o limite'); bad = true; }
    if (!st.categorias.length) { err.show('Escolha ao menos uma categoria.'); bad = true; }
    const u = INT[st.periodicidade];
    if (st.rep && u && !(st.intervalo >= u.min && st.intervalo <= u.max)) { err.show('Informe a cada quantos ' + u.v + ' repete.'); bad = true; }
    if (st.rep && edit && !st.data_fim) { err.show('Defina o fim deste período para repetir.'); bad = true; }
    if (bad) { s.body.scrollTop = 0; return; }
    let rec;
    if (canRec) {
      if (st.rep && (!had || regraDe() !== rOrig)) rec = { periodicidade: st.periodicidade, intervalo: st.intervalo, ate: st.ate || '', status: had ? had.status : 'ATIVA' };
      else if (!st.rep && had) rec = null;
    }
    let aplicarProx;
    if (edit && had && rec !== null && valores() !== vOrig) {
      aplicarProx = await perguntarAplicar();
      if (aplicarProx == null) return;
    }
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      await call('planejamentos.salvar', {
        ...(edit ? { id: edit.id, versao: edit.versao } : { tipo: st.tipo }),
        nome: st.nome.trim(), data_inicio: st.data_inicio,
        ...(st.rep && !edit ? {} : { data_fim: st.data_fim }),
        valor_limite: st.valor_limite, prioridade: st.prioridade, status: 'ATIVO',
        categorias: st.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: c.valor_limite || undefined, percentual_execucao: c.percentual_execucao })),
        ...(rec !== undefined ? { recorrencia: rec } : {}),
        ...(aplicarProx != null ? { aplicar_aos_proximos: aplicarProx } : {}),
      }, { rid });
      await s.close(); toast('Planejamento salvo.', { tone: 'success' }); emit('dados');
    } catch (e) { err.show(e.message); s.body.scrollTop = 0; } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar planejamento' : 'Novo planejamento', size: 'full', content: build(), footer: b });
}
