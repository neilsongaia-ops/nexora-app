// Agenda: a pagar / a receber por data, atrasados em destaque, efetivar com um gesto; recorrências
import { h, money, dmy, relDate, dayLabel, HOJE, addDays, uuid, emit } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { swipeable } from '../ui/gestures.js';
import { segmented, chip, row, amount, badge, tipoIcon, empty, errorState, skelRows, sectionHead, btn, iconBtn, textField, moneyField, pickField, dateField, formError, stepper, TIPO } from '../ui/components.js';
import { efetivar, openLancMenu } from './lancAcoes.js';
import { openFatura, pagarFatura } from './contas.js';
import { recursoItems, categoriaItems } from './lancForm.js';

const PER = { DIARIA: 'Todo dia', SEMANAL: 'Toda semana', MENSAL: 'Todo mês', ANUAL: 'Todo ano', A_CADA_N_DIAS: 'A cada N dias' };

export default async function agenda(ctx) {
  const { view, setTitle } = ctx;
  let aba = ctx.query.get('aba') || 'fluxo', tipo = 'TUDO', dias = 30;
  setTitle('Agenda');
  const tabs = segmented([{ value: 'fluxo', label: 'A pagar e receber' }, { value: 'rec', label: 'Recorrências' }], { value: aba, aria: 'Seção', onChange: (v) => { aba = v; draw(); } });
  const body = h('div', {});
  view.append(h('div', { class: 'sticky-tools' }, tabs), body);
  const draw = () => (aba === 'fluxo' ? fluxo() : recorrencias());

  async function fluxo() {
    const tot = h('div', { class: 'tiles tiles--2' });
    const filt = h('div', { class: 'chip-row chip-row--scroll' });
    const list = h('div', {}, skelRows(6));
    body.replaceChildren(tot, filt, list);
    const drawFilt = () => filt.replaceChildren(
      ...[['TUDO', 'Tudo'], ['PAGAR', 'A pagar'], ['RECEBER', 'A receber']].map(([v, l]) => chip(l, { selected: tipo === v, onClick: () => { tipo = v; drawFilt(); render(); } })),
      h('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
      ...[[7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([v, l]) => chip(l, { selected: dias === v, onClick: () => { dias = v; drawFilt(); fluxo(); } })));
    drawFilt();
    let d;
    const render = () => {
      const its = d.itens.filter((i) => tipo === 'TUDO' || i.tipo === tipo);
      if (!its.length) { list.replaceChildren(empty({ ic: 'calendar', title: 'Nada por aqui nos próximos ' + dias + ' dias' })); return; }
      const late = its.filter((i) => i.atrasado), next = its.filter((i) => !i.atrasado);
      const out = [];
      if (late.length) out.push(h('section', { class: 'late-box', 'aria-label': 'Atrasados' }, h('h3', { class: 'late-h' }, icon('alert'), `Atrasados · ${late.length}`, h('span', { class: 'num' }, money(late.reduce((s, i) => s + (i.tipo === 'PAGAR' ? -i.valor : i.valor), 0), { sign: true }))), h('div', { class: 'list' }, late.map(item))));
      let last = null, g = null;
      next.forEach((i) => { if (i.data !== last) { last = i.data; g = h('div', { class: 'day' }, h('h3', { class: 'day-h' }, dayLabel(i.data))); out.push(g); } g.append(item(i)); });
      list.replaceChildren(...out);
    };
    try {
      d = await load('relatorios.fluxo', { ate: addDays(HOJE, dias) });
      tot.replaceChildren(h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, icon('out', 'tone-out'), 'A pagar'), h('span', { class: 'tile-v num tone-out' }, money(d.a_pagar))), h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, icon('in', 'tone-in'), 'A receber'), h('span', { class: 'tile-v num tone-in' }, money(d.a_receber))));
      render();
    } catch (e) { list.replaceChildren(errorState(e.message, fluxo)); }
  }
  function item(i) {
    const fat = i.origem === 'FATURA', k = fat && store.recs.get(i.recurso_id);
    const lanc = { id: i.id, descricao: i.descricao, valor_total: i.valor, tipo: i.tipo === 'PAGAR' ? 'SAIDA' : 'ENTRADA', status: i.status || 'PENDENTE', data_evento: i.data, origem: 'MANUAL' };
    const r = row({
      cls: i.atrasado ? 'is-late' : '', lead: fat ? h('span', { class: 'tipo-ico tone-out' }, icon('card')) : tipoIcon(lanc.tipo),
      title: i.descricao, sub: (i.atrasado ? 'Venceu ' + relDate(i.data) : dmy(i.data)) + (fat ? '' : i.recurso_id ? ' · ' + ((store.recs.get(i.recurso_id) || {}).nome || '') : ''),
      badges: [i.atrasado ? badge('Atrasado', 'out', 'alert') : null, fat ? badge('Fatura', 'neutral') : null].filter(Boolean),
      trail: amount(i.valor, { tipo: lanc.tipo }),
      onClick: () => (fat ? openFatura(i.id, k) : i.id ? openLancMenu(lanc) : null),
      aria: `${i.descricao}, ${money(i.valor)}, ${dmy(i.data)}`,
    });
    if (!can('editor') || !i.id) return r;
    if (fat) return ['FECHADA', 'VENCIDA', 'PARCIALMENTE_PAGA'].includes(i.status) ? swipeable(r, { right: { label: 'Pagar', icon: 'check', tone: 'in', run: async () => pagarFatura(await call('faturas.detalhe', { id: i.id }), k) } }) : r;
    return swipeable(r, { right: { label: i.tipo === 'PAGAR' ? 'Paguei' : 'Recebi', icon: 'check', tone: 'in', run: () => efetivar(lanc) } });
  }

  async function recorrencias() {
    const list = h('div', { class: 'list' }, skelRows(5));
    body.replaceChildren(h('div', { class: 'toolbar' }, can('editor') ? btn('Nova recorrência', { icon: 'plus', kind: 'secondary', onClick: () => recForm() }) : null, can('editor') ? btn('Gerar próximas', { icon: 'refresh', kind: 'ghost', onClick: (e) => gerar(e.currentTarget) }) : null), list);
    try {
      const rs = await load('recorrencias.listar', {});
      if (!rs.length) { list.replaceChildren(empty({ ic: 'repeat', title: 'Nenhuma recorrência' })); return; }
      const order = { ATIVA: 0, PAUSADA: 1, ENCERRADA: 2 };
      list.replaceChildren(...rs.sort((a, b) => order[a.status] - order[b.status] || a.descricao.localeCompare(b.descricao)).map((r) => row({
        cls: r.status !== 'ATIVA' ? 'is-dead' : '', lead: tipoIcon(r.tipo_lancamento),
        title: r.descricao, badges: r.status !== 'ATIVA' ? [badge(r.status === 'PAUSADA' ? 'Pausada' : 'Encerrada', 'muted', r.status === 'PAUSADA' ? 'clock' : 'ban')] : null,
        sub: (r.periodicidade === 'A_CADA_N_DIAS' ? `A cada ${r.intervalo} dias` : PER[r.periodicidade]) + (r.status === 'ATIVA' && r.proxima ? ' · próxima ' + relDate(r.proxima) : '') + ' · ' + ((store.recs.get(r.recurso_id) || {}).nome || ''),
        trail: amount(r.valor, { tipo: r.tipo_lancamento }),
        onClick: () => openMenu({ title: r.descricao, items: [
          can('editor') && r.status !== 'ENCERRADA' && { icon: 'edit', label: 'Editar', onClick: () => recForm(r) },
          can('editor') && r.status === 'ATIVA' && { icon: 'clock', label: 'Pausar', onClick: () => setStatus(r, 'PAUSADA') },
          can('editor') && r.status === 'PAUSADA' && { icon: 'refresh', label: 'Retomar', onClick: () => setStatus(r, 'ATIVA') },
          can('editor') && r.status !== 'ENCERRADA' && { icon: 'ban', label: 'Encerrar', tone: 'out', onClick: () => setStatus(r, 'ENCERRADA') },
          { icon: 'list', label: 'Ver lançamentos', onClick: () => ctx.go('/lancamentos') },
        ] }),
      })));
    } catch (e) { list.replaceChildren(errorState(e.message, recorrencias)); }
  }
  async function setStatus(r, status) {
    try { await call('recorrencias.salvar', { id: r.id, status }, { rid: uuid() }); toast({ PAUSADA: 'Pausada.', ATIVA: 'Retomada.', ENCERRADA: 'Encerrada.' }[status], { tone: 'success' }); emit('dados'); } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  async function gerar(b) {
    b.disabled = true;
    try { const r = await call('recorrencias.gerar', { ate: addDays(HOJE, 60) }, { rid: uuid() }); toast(r.criadas ? `${r.criadas} lançamento${r.criadas > 1 ? 's' : ''} criado${r.criadas > 1 ? 's' : ''}.` : 'Tudo em dia.', { tone: 'success' }); emit('dados'); } catch (e) { toast(e.message, { tone: 'danger' }); } finally { b.disabled = false; }
  }
  draw();
}

function recForm(edit) {
  const rid = uuid(), err = formError();
  const st = edit ? { ...edit } : { tipo_lancamento: 'SAIDA', descricao: '', valor: 0, periodicidade: 'MENSAL', intervalo: 15, data_inicial: HOJE, data_final: null, recurso_id: null, recurso_destino_id: null, categoria_id: null };
  let fd, fv;
  const build = () => {
    const out = [err];
    if (!edit) out.push(segmented([{ value: 'SAIDA', label: 'Saída', icon: 'out', tone: 'out' }, { value: 'ENTRADA', label: 'Entrada', icon: 'in', tone: 'in' }, { value: 'TRANSFERENCIA', label: 'Transferência', icon: 'swap', tone: 'xfer' }], { value: st.tipo_lancamento, cls: 'seg--tipo', aria: 'Tipo', onChange: (v) => { st.tipo_lancamento = v; st.categoria_id = null; s.setContent(build()); } }));
    fv = moneyField('Valor', { value: st.valor, big: true, onChange: (v) => { st.valor = v; fv.setError(''); } });
    fd = textField('Descrição', { value: st.descricao, placeholder: 'Ex.: Aluguel', onInput: (v) => { st.descricao = v; fd.setError(''); } });
    out.push(fv, fd);
    if (!edit) {
      out.push(pickField(st.tipo_lancamento === 'TRANSFERENCIA' ? 'De' : st.tipo_lancamento === 'SAIDA' ? 'Pagar com' : 'Receber em', { value: st.recurso_id, items: () => recursoItems({ semCartao: st.tipo_lancamento !== 'SAIDA' }), onChange: (v) => { st.recurso_id = v; } }));
      if (st.tipo_lancamento === 'TRANSFERENCIA') out.push(pickField('Para', { value: st.recurso_destino_id, items: () => recursoItems({ semCartao: true }), onChange: (v) => { st.recurso_destino_id = v; } }));
      else out.push(pickField('Categoria', { value: st.categoria_id, items: () => categoriaItems(st.tipo_lancamento === 'ENTRADA' ? 'RECEITA' : 'DESPESA'), placeholder: 'Sem categoria', onChange: (v) => { st.categoria_id = v; } }));
      out.push(pickField('Repete', { value: st.periodicidade, items: Object.entries(PER).map(([value, label]) => ({ value, label })), onChange: (v) => { st.periodicidade = v; s.setContent(build()); } }));
      if (st.periodicidade === 'A_CADA_N_DIAS') out.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Intervalo'), stepper({ value: st.intervalo, min: 2, max: 365, label: 'Dias', format: (v) => v + ' dias', onChange: (v) => { st.intervalo = v; } })));
      out.push(h('div', { class: 'grid-2' }, dateField('Começa em', { value: st.data_inicial, onChange: (v) => { st.data_inicial = v; } }), dateField('Termina em', { value: st.data_final || addDays(HOJE, 365), onChange: (v) => { st.data_final = v; } })));
    } else out.push(dateField('Termina em', { value: st.data_final || addDays(HOJE, 365), onChange: (v) => { st.data_final = v; } }));
    return out;
  };
  const b = btn(edit ? 'Salvar' : 'Criar recorrência', { size: 'lg', full: true });
  b.onclick = async () => {
    let bad = false;
    if (!(st.valor > 0)) { fv.setError('Informe o valor'); bad = true; }
    if (!st.descricao.trim()) { fd.setError('Informe a descrição'); bad = true; }
    if (bad) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      const p = edit ? { id: edit.id, descricao: st.descricao.trim(), valor: st.valor, data_final: st.data_final } : { tipo_lancamento: st.tipo_lancamento, descricao: st.descricao.trim(), valor: st.valor, periodicidade: st.periodicidade, intervalo: st.periodicidade === 'A_CADA_N_DIAS' ? st.intervalo : undefined, data_inicial: st.data_inicial, data_final: st.data_final || undefined, recurso_id: st.recurso_id, recurso_destino_id: st.recurso_destino_id || undefined, categoria_id: st.categoria_id || undefined };
      await call('recorrencias.salvar', p, { rid });
      await s.close(); toast('Recorrência salva.', { tone: 'success' }); emit('dados');
    } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar recorrência' : 'Nova recorrência', size: 'full', content: build(), footer: b });
}
