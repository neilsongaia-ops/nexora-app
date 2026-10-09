// Sessão de compra ("no mercado"): marcar item pego, ajustar preço real, total correndo, concluir
import { h, money, uuid, emit, num, haptic, HOJE, r2 } from '../util.js';
import { icon } from '../icons.js';
import { call } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { openSheet, openMenu, confirmSheet } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { badge, empty, errorState, skelRows, btn, iconBtn, moneyField, stepper, pickField, dateField, textField, formError, countUp, thumb, kv } from '../ui/components.js';
import { lerProduto } from './compras.js';
import { recursoItems, categoriaItems } from './lancForm.js';

export default async function sessao(ctx, id) {
  const { view, setTitle, go } = ctx;
  const ed = can('editor');
  let s;
  const prog = h('div', { class: 'sess-prog' });
  const bar = h('div', { class: 'meter' });
  const listEl = h('div', { class: 'list' }, skelRows(7));
  const cartEl = h('div', {});
  const totalV = h('span', { class: 'sess-total-v num' }, money(0));
  const concluirBtn = btn('Concluir', { size: 'lg', icon: 'check' });
  const sbar = h('div', { class: 'sess-bar' }, h('div', { class: 'sess-total' }, h('span', { class: 'sess-total-k' }, 'No carrinho'), totalV), ed ? iconBtn('plus', 'Adicionar item', () => addItem()) : null, ed ? concluirBtn : null);
  view.append(h('div', { class: 'sess-top' }, prog, bar), listEl, cartEl, sbar);
  setTitle('Compra', { back: '/compras' });
  let lastTotal = 0;
  const total = () => r2(s.itens.filter((i) => i.marcado).reduce((t, i) => t + (i.preco_unitario || 0) * i.quantidade, 0));

  async function reload() {
    try { s = await call('sessoes.detalhe', { id }); draw(); } catch (e) { listEl.replaceChildren(errorState(e.message, reload)); }
  }
  function draw() {
    setTitle(s.loja ? s.loja.nome : 'Compra', { back: s.lista_id ? '/compras/lista/' + s.lista_id : '/compras', sub: s.lista_nome, actions: [ed && s.status === 'ABERTA' ? iconBtn('dots', 'Opções', () => openMenu({ title: 'Compra', items: [
      { icon: 'barcode', label: 'Ler código de barras', onClick: () => lerProduto(ctx, { onProduct: (p) => addItem(p) }) },
      { icon: 'ban', label: 'Cancelar compra', tone: 'out', onClick: cancelar },
    ] })) : null] });
    if (s.status !== 'ABERTA') { view.replaceChildren(h('div', { class: 'sess-done' }, h('span', { class: 'welcome-ico' }, icon(s.status === 'CONCLUIDA' ? 'check' : 'ban')), h('h2', {}, s.status === 'CONCLUIDA' ? 'Compra concluída' : 'Compra cancelada'), btn('Voltar à lista', { kind: 'secondary', onClick: () => go('/compras/lista/' + s.lista_id) }))); return; }
    const on = s.itens.filter((i) => i.marcado), off = s.itens.filter((i) => !i.marcado);
    prog.replaceChildren(h('span', {}, `${on.length} de ${s.itens.length} itens`), h('span', { class: 'num' }, off.length ? `faltam ${off.length}` : 'tudo no carrinho'));
    bar.style.setProperty('--fill', String(s.itens.length ? on.length / s.itens.length : 0));
    bar.replaceChildren(h('span', { class: 'meter-fill' }));
    listEl.replaceChildren(...(off.length ? off.map(item) : [empty({ ic: 'check', title: 'Tudo no carrinho' })]));
    cartEl.replaceChildren(...(on.length ? [h('h3', { class: 'day-h' }, 'No carrinho'), h('div', { class: 'list' }, on.map(item))] : []));
    const t = total();
    countUp(totalV, t, { from: lastTotal, dur: 400 });
    lastTotal = t;
    concluirBtn.disabled = !on.length;
  }
  function item(i) {
    const p = i.produto_id && (store.produtos.get(i.produto_id) || { id: i.produto_id, nome: i.descricao });
    const priceBtn = h('button', { class: 'price-btn' + (i.preco_unitario ? '' : ' is-empty'), type: 'button', 'aria-label': `Preço de ${i.descricao}: ${i.preco_unitario ? money(i.preco_unitario) : 'sem preço'}. Alterar`, onclick: (e) => { e.stopPropagation(); editar(i); } },
      h('span', { class: 'num' }, i.preco_unitario ? money(i.preco_unitario * i.quantidade) : 'Preço'), i.quantidade !== 1 ? h('small', { class: 'num' }, `${num(i.quantidade, 3)} × ${money(i.preco_unitario || 0)}`) : i.preco_sugerido && i.preco_unitario !== i.preco_sugerido ? h('small', { class: 'num' }, 'era ' + money(i.preco_sugerido)) : null);
    const el = h('div', { class: 'sess-item' + (i.marcado ? ' is-on' : '') + (i._p ? ' is-pending' : ''), role: 'checkbox', tabindex: '0', 'aria-checked': String(!!i.marcado), 'aria-label': i.descricao },
      h('span', { class: 'sess-check', 'aria-hidden': 'true' }, icon('check')), p ? thumb(p) : null,
      h('div', { class: 'sess-main' }, h('span', { class: 'row-title' }, i.descricao), h('span', { class: 'row-sub' }, i.quantidade !== 1 ? num(i.quantidade, 3) + ' ' + (i.unidade || 'UN').toLowerCase() : '', !i.preco_unitario && i.marcado ? badge('Sem preço', 'warn', 'alert') : null)), priceBtn);
    const toggle = () => { if (!ed) return; haptic(i.marcado ? 8 : [8, 30, 12]); i.marcado = !i.marcado; draw(); sync(i, { marcado: i.marcado }); if (i.marcado && !i.preco_unitario) editar(i); };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    return el;
  }
  // gravação otimista com fila por item (evita duplo envio e mantém o último estado)
  async function sync(i, patch) {
    i._want = { ...(i._want || {}), ...patch };
    if (i._p) return;
    while (i._want) {
      const w = i._want; i._want = null; i._p = true;
      try { await call('sessoes.item.salvar', { id: i.id, ...w }, { rid: uuid() }); }
      catch (e) { toast(e.message, { tone: 'danger', action: { label: 'Recarregar', onClick: reload } }); i._p = false; return reload(); }
      i._p = false;
    }
  }
  function editar(i) {
    let preco = i.preco_unitario || 0, q = i.quantidade, cat = i.categoria_id;
    const mf = moneyField(i.quantidade !== 1 ? 'Preço unitário' : 'Preço', { value: preco, big: true, autofocus: true, onChange: (v) => { preco = v; upd(); } });
    mf.input.dataset.forceFocus = '1';
    const sub = h('div', { class: 'items-sum' });
    const upd = () => sub.replaceChildren(h('span', {}, 'Total do item'), h('strong', { class: 'num' }, money(preco * q)));
    const kg = i.unidade === 'KG' || i.unidade === 'L';
    const b = btn('Pronto', { size: 'lg', full: true });
    b.onclick = async () => { Object.assign(i, { preco_unitario: preco || null, quantidade: q, categoria_id: cat, marcado: true }); await sh.close(); draw(); sync(i, { preco_unitario: preco || null, quantidade: q, categoria_id: cat, marcado: true }); };
    mf.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') b.click(); });
    upd();
    const sh = openSheet({ title: i.descricao, footer: b, content: [mf,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, kg ? 'Peso' : 'Quantidade'), stepper({ value: q, min: kg ? 0.05 : 1, max: 999, step: kg ? 0.05 : 1, label: 'Quantidade', format: (v) => (kg ? num(v, 3) + ' ' + i.unidade.toLowerCase() : String(v)), onChange: (v) => { q = v; upd(); } })),
      pickField('Categoria', { value: cat, items: () => categoriaItems('DESPESA'), onChange: (v) => { cat = v; } }), sub] });
  }
  function addItem(prod) {
    let desc = prod ? prod.nome : '', preco = 0, q = 1;
    const err = formError(), rid = uuid();
    const f = prod ? null : textField('Item', { placeholder: 'Ex.: Pão francês', autofocus: true, onInput: (v) => { desc = v; } });
    const mf = moneyField('Preço', { value: 0, onChange: (v) => { preco = v; } });
    const b = btn('Adicionar ao carrinho', { size: 'lg', full: true, icon: 'cart' });
    b.onclick = async () => {
      if (!desc.trim()) { f && f.setError('Informe o item'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { await call('sessoes.item.adicionar', { sessao_id: id, produto_id: prod ? prod.id : undefined, descricao: prod ? undefined : desc.trim(), quantidade: q, preco_unitario: preco || undefined }, { rid }); await sh.close(); haptic(12); reload(); }
      catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const sh = openSheet({ title: prod ? prod.nome : 'Adicionar item', footer: b, content: [err, f, h('div', { class: 'grid-2' }, mf, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quantidade'), stepper({ value: 1, min: 1, max: 99, onChange: (v) => { q = v; } }))),
      prod ? null : btn('Ler código de barras', { kind: 'ghost', icon: 'barcode', onClick: async () => { await sh.close(); lerProduto(ctx, { onProduct: (p) => addItem(p) }); } })] });
  }
  async function cancelar() {
    if (!(await confirmSheet({ title: 'Cancelar esta compra?', content: h('p', { class: 'muted' }, 'Os itens continuam na lista.'), confirm: 'Cancelar compra', tone: 'danger', cancel: 'Continuar comprando' }))) return;
    try { await call('sessoes.cancelar', { id }, { rid: uuid() }); toast('Compra cancelada.', {}); go('/compras/lista/' + s.lista_id); } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  concluirBtn.onclick = () => {
    const on = s.itens.filter((i) => i.marcado);
    const semPreco = on.filter((i) => !i.preco_unitario);
    if (semPreco.length) { toast(`Informe o preço de ${semPreco.length} ${semPreco.length > 1 ? 'itens' : 'item'}.`, { tone: 'danger' }); editar(semPreco[0]); return; }
    const err = formError(), rid = uuid();
    let rec = s.recurso_id || (recursosAtivos(['CARTAO'])[0] || recursosAtivos()[0] || {}).id, parc = 1, desc = 0, data = HOJE, chave = '';
    const bruto = total();
    const totEl = h('span', { class: 'num' });
    const b = btn('', { size: 'lg', full: true, icon: 'check' });
    const upd = () => { const t = r2(bruto - desc); b.querySelector('.btn-label').textContent = 'Concluir ' + money(t); totEl.textContent = money(t); };
    const isCard = () => (store.recs.get(rec) || {}).tipo === 'CARTAO';
    const parcWrap = h('div', { class: 'field', hidden: !isCard() }, h('span', { class: 'field-label' }, 'Parcelas'), stepper({ value: 1, min: 1, max: 12, format: (v) => v + '×', label: 'Parcelas', onChange: (v) => { parc = v; } }));
    b.onclick = async () => {
      if (!rec) { err.show('Escolha como pagou.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        const r = await call('sessoes.concluir', { id, recurso_id: rec, data, descontos: desc || undefined, parcelas: isCard() && parc > 1 ? parc : undefined, chave_nfce: chave || undefined }, { rid });
        await successBurst(sh.el, 'Compra registrada');
        await sh.close();
        toast('Compra registrada e preços salvos.', { tone: 'success', action: { label: 'Ver lançamento', onClick: async () => (await import('./lancAcoes.js')).openLancDetail(r.lancamento.id) } });
        emit('dados');
      } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    b.prepend(h('span', { class: 'btn-label' }));
    const sh = openSheet({ title: 'Concluir compra', footer: b, content: [err,
      h('div', { class: 'kv-list' }, kv('Itens', String(on.length)), kv('Subtotal', money(bruto)), kv('Total', totEl, 'is-total')),
      pickField('Pagou com', { value: rec, items: () => recursoItems(), onChange: (v) => { rec = v; parcWrap.hidden = !isCard(); } }), parcWrap,
      h('div', { class: 'grid-2' }, moneyField('Desconto', { value: 0, onChange: (v) => { desc = v; upd(); } }), dateField('Data', { value: HOJE, max: HOJE, onChange: (v) => { data = v; } })),
      textField('Chave da nota (NFC-e)', { placeholder: 'Opcional', inputmode: 'numeric', tipText: 'Com a chave, os preços entram como verificados.', onInput: (v) => { chave = v.replace(/\D/g, ''); } })] });
    upd();
  };
  reload();
}
