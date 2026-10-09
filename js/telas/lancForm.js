// Formulário de lançamento (novo / editar) em sheet. Rascunho automático, _rid por formulário, versão nos updates.
import { h, money, r2, HOJE, uuid, draft, debounce, emit } from '../util.js';
import { icon } from '../icons.js';
import { call, ApiError } from '../api.js';
import { store, recursosAtivos, categoriasDe, saldoDe, can } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { segmented, moneyField, textField, pickField, dateField, stepper, btn, formError, badge, tip, TIPO, kv } from '../ui/components.js';

export function recursoItems({ semCartao, soCartao } = {}) {
  const G = { CONTA: 'Contas', CARTEIRA: 'Carteiras', CARTAO: 'Cartões' };
  return recursosAtivos().filter((r) => (!semCartao || r.tipo !== 'CARTAO') && (!soCartao || r.tipo === 'CARTAO'))
    .sort((a, b) => 'CONTA CARTEIRA CARTAO'.indexOf(a.tipo) - 'CONTA CARTEIRA CARTAO'.indexOf(b.tipo))
    .map((r) => { const s = saldoDe(r.id); return { value: r.id, label: r.nome, group: G[r.tipo], icon: r.tipo === 'CARTAO' ? 'card' : r.tipo === 'CARTEIRA' ? 'coin' : 'wallet', right: r.tipo === 'CARTAO' ? (r.final ? '•••• ' + r.final : '') : s ? money(s.saldo_atual) : '' }; });
}
export function categoriaItems(tipo) {
  const cs = categoriasDe(tipo), out = [];
  cs.filter((c) => !c.pai_id).sort((a, b) => a.nome.localeCompare(b.nome)).forEach((p) => {
    out.push({ value: p.id, label: p.nome, group: tipo === 'RECEITA' ? 'Receitas' : 'Despesas' });
    cs.filter((c) => c.pai_id === p.id).sort((a, b) => a.nome.localeCompare(b.nome)).forEach((c) => out.push({ value: c.id, label: c.nome, sub: p.nome, indent: true, group: tipo === 'RECEITA' ? 'Receitas' : 'Despesas' }));
  });
  return out;
}

export function openLancForm({ tipo = 'SAIDA', initial, edit, onSaved } = {}) {
  if (!can('editor')) { toast('Seu papel neste espaço é só de leitura.', { ico: 'lock' }); return; }
  const dr = draft('lanc');
  const saved = !edit && !initial ? dr.get() : null;
  const st = edit ? {
    tipo: edit.tipo, valor: edit.valor_bruto, descricao: edit.descricao, recurso_id: edit.recurso_id, origem_id: edit.origem_id, destino_id: edit.destino_id, categoria_id: edit.categoria_id,
    data: edit.data_evento, status: edit.status, parcelas: edit.parcelas_total || 1, descontos: edit.descontos, acrescimos: edit.acrescimos, encargos: edit.encargos,
    itens: edit.itens.map((i) => ({ ...i })), rid: uuid(),
  } : Object.assign({ tipo, valor: 0, descricao: '', recurso_id: null, origem_id: null, destino_id: null, categoria_id: null, data: HOJE, status: 'EFETIVADO', parcelas: 1, descontos: 0, acrescimos: 0, encargos: 0, itens: [], rid: uuid() }, initial || {}, saved || {});
  if (!edit && !st.recurso_id) { const def = recursosAtivos(['CONTA'])[0]; if (def && !initial) st.recurso_id = def.id; }
  const futuro = edit && ['PLANEJADO', 'PENDENTE'].includes(edit.status);
  const valorEditavel = !edit || (futuro && !edit.itens.length && !(edit.parcelas || []).length);
  let showAj = !!(st.descontos || st.acrescimos || st.encargos), showIt = st.itens.length > 0;
  const persist = debounce(() => { if (!edit) dr.save(st); }, 300);
  const err = formError();
  const fields = {};
  const isCard = () => { const r = store.recs.get(st.recurso_id); return st.tipo === 'SAIDA' && r && r.tipo === 'CARTAO'; };
  const total = () => r2(st.valor - st.descontos + st.acrescimos + st.encargos);
  const totalEl = h('span', { class: 'num' });
  const parcEl = h('span', { class: 'form-hint num' });
  const somaEl = h('div', { class: 'items-sum' });
  const updTotals = () => {
    totalEl.textContent = money(total());
    parcEl.textContent = isCard() && st.parcelas > 1 ? `${st.parcelas}× de ${money(total() / st.parcelas)}` : '';
    const soma = r2(st.itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0)), d = r2(st.valor - soma);
    somaEl.replaceChildren(h('span', {}, 'Itens ', h('strong', { class: 'num' }, money(soma))), d !== 0 && st.itens.length ? badge(d > 0 ? 'Faltam ' + money(d) : 'Sobram ' + money(-d), 'warn', 'alert') : st.itens.length ? badge('Confere', 'in', 'check') : null);
  };

  function build() {
    const out = [err];
    if (!edit) out.push(segmented([{ value: 'SAIDA', label: 'Saída', icon: 'out', tone: 'out' }, { value: 'ENTRADA', label: 'Entrada', icon: 'in', tone: 'in' }, { value: 'TRANSFERENCIA', label: 'Transferência', icon: 'swap', tone: 'xfer' }],
      { value: st.tipo, aria: 'Tipo de lançamento', cls: 'seg--tipo', onChange: (v) => { st.tipo = v; st.categoria_id = null; if (v === 'ENTRADA' && store.recs.get(st.recurso_id)?.tipo === 'CARTAO') st.recurso_id = null; persist(); rebuild(); } }));
    else out.push(h('div', { class: 'form-tipo' }, h('span', { class: 'tipo-ico tone-' + TIPO[st.tipo].tone }, icon(TIPO[st.tipo].icon)), h('span', {}, TIPO[st.tipo].label), badge({ PLANEJADO: 'Planejado', PENDENTE: 'Pendente', EFETIVADO: 'Efetivado' }[edit.status] || edit.status, edit.status === 'EFETIVADO' ? 'in' : 'warn')));
    if (valorEditavel) {
      fields.valor = moneyField('Valor', { value: st.valor, big: true, autofocus: !edit, onChange: (v) => { st.valor = v; fields.valor.setError(''); updTotals(); persist(); } });
      fields.valor.input.dataset.forceFocus = edit ? '' : '1';
      out.push(fields.valor);
    } else out.push(h('div', { class: 'form-readonly' }, kv('Valor', money(edit.valor_total)), edit.parcelas_total > 1 ? kv('Parcelas', edit.parcelas_total + '×') : null));
    fields.desc = textField('Descrição', { value: st.descricao, placeholder: st.tipo === 'ENTRADA' ? 'Ex.: Salário' : st.tipo === 'TRANSFERENCIA' ? 'Ex.: Guardar na poupança' : 'Ex.: Mercado', enterkeyhint: 'next', maxlength: 140, onInput: (v) => { st.descricao = v; fields.desc.setError(''); persist(); } });
    out.push(fields.desc);
    if (!edit) {
      if (st.tipo === 'TRANSFERENCIA') {
        fields.orig = pickField('De', { value: st.origem_id, items: () => recursoItems({ semCartao: true }), placeholder: 'Escolher origem', onChange: (v) => { st.origem_id = v; fields.orig.setError(''); persist(); } });
        fields.dest = pickField('Para', { value: st.destino_id, items: () => recursoItems({ semCartao: true }).filter((i) => i.value !== st.origem_id), placeholder: 'Escolher destino', onChange: (v) => { st.destino_id = v; fields.dest.setError(''); persist(); } });
        out.push(h('div', { class: 'grid-2' }, fields.orig, fields.dest));
      } else {
        fields.rec = pickField(st.tipo === 'SAIDA' ? 'Pagar com' : 'Receber em', { value: st.recurso_id, items: () => recursoItems({ semCartao: st.tipo === 'ENTRADA' }), placeholder: 'Escolher', onChange: (v) => { st.recurso_id = v; fields.rec.setError(''); persist(); rebuild(); } });
        out.push(fields.rec);
        if (isCard()) out.push(h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Parcelas'), tip('A compra entra agora como despesa e compromete o limite pelo total.')),
          h('div', { class: 'parc-row' }, stepper({ value: st.parcelas, min: 1, max: 24, label: 'Parcelas', format: (v) => v + '×', onChange: (v) => { st.parcelas = v; updTotals(); persist(); } }), parcEl)));
      }
    } else {
      const r = store.recs.get(st.recurso_id), o = store.recs.get(st.origem_id), d = store.recs.get(st.destino_id);
      out.push(h('div', { class: 'form-readonly' }, r ? kv(st.tipo === 'SAIDA' ? 'Pago com' : 'Recebido em', r.nome) : null, o ? kv('De', o.nome) : null, d ? kv('Para', d.nome) : null));
    }
    if (st.tipo !== 'TRANSFERENCIA') {
      fields.cat = pickField('Categoria', { value: st.categoria_id, items: () => categoriaItems(st.tipo === 'ENTRADA' ? 'RECEITA' : 'DESPESA'), placeholder: 'Sem categoria', ic: 'tag', display: (v, it) => (it ? (it.sub ? it.sub + ' › ' + it.label : it.label) : 'Sem categoria'), onChange: (v) => { st.categoria_id = v; persist(); } });
      out.push(fields.cat);
    }
    if (valorEditavel) {
      fields.data = dateField('Data', { value: st.data, onChange: (v) => { st.data = v; persist(); rebuild(); } });
      const row = [fields.data];
      if (st.data <= HOJE) row.push(h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Situação')), segmented([{ value: 'EFETIVADO', label: 'Feito' }, { value: 'PENDENTE', label: 'Pendente' }], { value: st.status === 'PENDENTE' ? 'PENDENTE' : 'EFETIVADO', aria: 'Situação', onChange: (v) => { st.status = v; persist(); } })));
      else row.push(h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Situação'), tip('Lançamento futuro aparece na agenda e no saldo projetado; só muda o saldo quando for efetivado.')), h('div', { class: 'form-static' }, badge('Planejado', 'neutral', 'calendar'))));
      out.push(h('div', { class: 'grid-2' }, row));
      out.push(disclosure('Descontos, acréscimos e encargos', showAj, (v) => { showAj = v; rebuild(); }, showAj ? h('div', { class: 'grid-3' },
        moneyField('Descontos', { value: st.descontos, onChange: (v) => { st.descontos = v; updTotals(); persist(); } }),
        moneyField('Acréscimos', { value: st.acrescimos, onChange: (v) => { st.acrescimos = v; updTotals(); persist(); } }),
        moneyField('Encargos', { value: st.encargos, tipText: 'Juros, multas e tarifas: custo financeiro, relatado à parte.', onChange: (v) => { st.encargos = v; updTotals(); persist(); } })) : null));
    }
    if (st.tipo !== 'TRANSFERENCIA' && (!edit || st.itens.length)) {
      out.push(disclosure(edit ? 'Itens' : 'Detalhar por itens', showIt || !!edit, (v) => { showIt = v; if (v && !st.itens.length) st.itens.push({ descricao: '', quantidade: 1, valor_total: st.valor, categoria_id: st.categoria_id }); if (!v) st.itens = []; persist(); rebuild(); },
        showIt || edit ? h('div', { class: 'items' }, st.itens.map((it, i) => itemRow(it, i)), !edit ? btn('Adicionar item', { kind: 'ghost', icon: 'plus', onClick: () => { st.itens.push({ descricao: '', quantidade: 1, valor_total: 0, categoria_id: st.categoria_id }); persist(); rebuild(); } }) : null, somaEl) : null));
    }
    return out;
  }
  function itemRow(it, i) {
    const tipoCat = st.tipo === 'ENTRADA' ? 'RECEITA' : 'DESPESA';
    const cat = pickField('Categoria do item', { value: it.categoria_id, items: () => categoriaItems(tipoCat), placeholder: 'Categoria', display: (v, x) => (x ? x.label : 'Categoria'), onChange: (v) => { it.categoria_id = v; persist(); } });
    if (edit) return h('div', { class: 'item-row is-ro' }, h('div', { class: 'item-ro' }, h('span', { class: 'item-name' }, it.descricao), h('span', { class: 'num' }, money(it.valor_total))), cat);
    const d = textField('Item', { value: it.descricao, placeholder: 'Descrição do item', onInput: (v) => { it.descricao = v; persist(); } });
    const v = moneyField('Valor do item', { value: it.valor_total, onChange: (x) => { it.valor_total = x; updTotals(); persist(); } });
    const rm = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remover item', onclick: () => { st.itens.splice(i, 1); if (!st.itens.length) showIt = false; persist(); rebuild(); } }, icon('x'));
    return h('div', { class: 'item-row' }, h('div', { class: 'item-grid' }, d, v, rm), cat);
  }
  function disclosure(label, open, onToggle, content) {
    return h('div', { class: 'disc' + (open ? ' is-open' : '') }, h('button', { class: 'disc-btn', type: 'button', 'aria-expanded': String(open), onclick: () => onToggle(!open) }, h('span', {}, label), icon('chevD')), content);
  }
  const rebuild = () => { const y = s.body.scrollTop; s.setContent(build()); updTotals(); s.body.scrollTop = y; };

  const saveBtn = btn(edit ? 'Salvar alterações' : 'Salvar', { size: 'lg', cls: 'btn--grow' });
  saveBtn.onclick = () => submit();
  const foot = h('div', { class: 'form-foot' }, h('div', { class: 'form-total' }, h('span', { class: 'form-total-k' }, 'Total'), totalEl, parcEl.cloneNode()), saveBtn);
  const s = openSheet({ title: edit ? 'Editar lançamento' : 'Novo lançamento', size: 'full', content: [], footer: foot });
  rebuild();
  if (saved && (saved.valor || saved.descricao)) toast('Rascunho recuperado.', { ico: 'history', action: { label: 'Descartar', onClick: () => { dr.clear(); s.close().then(() => openLancForm({ tipo })); } } });

  s.body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const ins = [...s.el.querySelectorAll('input.input, button.input--pick')];
    const i = ins.indexOf(e.target);
    if (ins[i + 1]) ins[i + 1].focus(); else submit();
  });

  async function submit() {
    if (saveBtn.getAttribute('aria-busy') === 'true') return;
    err.show('');
    let bad = null;
    const need = (f, cond, msg) => { if (f && cond) { f.setError(msg); bad ||= f; } };
    need(fields.valor, valorEditavel && !(st.valor > 0), 'Informe o valor');
    need(fields.desc, !st.descricao.trim(), 'Informe a descrição');
    if (!edit) {
      need(fields.rec, st.tipo !== 'TRANSFERENCIA' && !st.recurso_id, 'Escolha');
      need(fields.orig, st.tipo === 'TRANSFERENCIA' && !st.origem_id, 'Escolha');
      need(fields.dest, st.tipo === 'TRANSFERENCIA' && (!st.destino_id || st.destino_id === st.origem_id), 'Escolha um destino diferente');
    }
    if (st.itens.length && !edit) {
      const soma = r2(st.itens.reduce((x, i) => x + (Number(i.valor_total) || 0), 0));
      if (soma !== r2(st.valor)) { err.show('A soma dos itens precisa ser igual ao valor.'); bad ||= somaEl; }
    }
    if (valorEditavel && total() <= 0 && st.valor > 0) { err.show('O total precisa ser maior que zero.'); bad ||= err; }
    if (bad) { (bad.querySelector ? bad.querySelector('input,button') || bad : bad).focus?.(); bad.scrollIntoView ? null : null; return; }
    saveBtn.setAttribute('aria-busy', 'true'); saveBtn.disabled = true;
    try {
      let res;
      if (edit) {
        const p = { id: edit.id, versao: edit.versao, descricao: st.descricao.trim(), categoria_id: st.categoria_id || null };
        if (valorEditavel) Object.assign(p, { data_evento: st.data, valor_bruto: st.valor, descontos: st.descontos, acrescimos: st.acrescimos, encargos: st.encargos });
        if (st.itens.length) p.itens = st.itens.map((i) => ({ id: i.id, categoria_id: i.categoria_id }));
        res = await call('lancamentos.atualizar', p, { rid: st.rid });
      } else {
        const p = { tipo: st.tipo, data_evento: st.data, descricao: st.descricao.trim(), valor_bruto: st.valor, descontos: st.descontos || 0, acrescimos: st.acrescimos || 0, encargos: st.encargos || 0,
          status: st.data > HOJE ? 'PLANEJADO' : st.status === 'PENDENTE' ? 'PENDENTE' : 'EFETIVADO' };
        if (st.tipo === 'TRANSFERENCIA') Object.assign(p, { origem_id: st.origem_id, destino_id: st.destino_id });
        else { p.recurso_id = st.recurso_id; if (st.categoria_id) p.categoria_id = st.categoria_id; }
        if (isCard() && st.parcelas > 1) p.parcelas = st.parcelas;
        if (st.itens.length) p.itens = st.itens.map((i) => ({ descricao: i.descricao || 'Item', quantidade: 1, valor_total: i.valor_total, categoria_id: i.categoria_id || st.categoria_id || undefined }));
        res = await call('lancamentos.criar', p, { rid: st.rid });
      }
      dr.clear();
      await successBurst(s.el, edit ? 'Atualizado' : 'Salvo');
      await s.close();
      toast(edit ? 'Lançamento atualizado.' : 'Lançamento salvo.', { tone: 'success' });
      emit('dados');
      onSaved && onSaved(res);
    } catch (e) {
      if (e instanceof ApiError && e.codigo === 'CONFLITO') {
        err.show('Outra pessoa alterou este lançamento.');
        s.setFooter(h('div', { class: 'btn-row' }, btn('Recarregar', { kind: 'secondary', icon: 'refresh', onClick: async () => { const d = await call('lancamentos.detalhe', { id: edit.id }); await s.close(); openLancForm({ edit: d, onSaved }); } }), saveBtn));
      } else err.show(e.message);
      s.body.scrollTop = 0;
    } finally { saveBtn.removeAttribute('aria-busy'); saveBtn.disabled = false; }
  }
  return s;
}
