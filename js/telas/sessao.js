// Sessão de compra ("no mercado"): marcar item pego, ajustar preço real (normal ou opcional), total correndo, concluir.
// A compra aberta e a lista são a mesma coisa: o que entra aqui entra na lista, e vice-versa.
import { h, money, uuid, emit, num, haptic, HOJE, r2, debounce } from '../util.js';
import { icon } from '../icons.js';
import { call, invalidate } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { openSheet, openMenu, confirmSheet } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { badge, empty, errorState, skelRows, btn, iconBtn, moneyField, stepper, pickField, dateField, textField, formError, countUp, thumb, kv, chip } from '../ui/components.js';
import { lerProduto, talvezUnir } from './compras.js';
import { recursoItems, categoriaItems } from './lancForm.js';

const sincronizadas = new Set();   // sessoes.sincronizar: uma vez por compra aberta nesta execução do app
const isPeso = (u) => u === 'KG' || u === 'L';
const qTxt = (q, u) => (isPeso(u) ? num(q, 3) + ' ' + u.toLowerCase() : num(q, 3));
const SERVIDOR = ['preco_unitario', 'rotulo', 'preco_normal', 'opcoes', 'dica', 'quantidade', 'preco_sugerido'];

export default async function sessao(ctx, id) {
  const { view, setTitle, go } = ctx;
  const ed = can('editor');
  let s, novo = null;
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
    try {
      if (ed && !sincronizadas.has(id)) { sincronizadas.add(id); await call('sessoes.sincronizar', { id }, { rid: uuid() }).catch(() => {}); }
      s = await call('sessoes.detalhe', { id });
      if (ctx.alive()) draw();
    } catch (e) { listEl.replaceChildren(errorState(e.message, reload)); }
  }
  // Depois de adicionar: recarrega a compra e invalida os dados lidos (o mesmo que emit('dados') sem piscar a tela nem voltar ao topo)
  const refresh = () => { invalidate(); return ctx.alive() ? reload() : emit('dados'); };
  function draw() {
    setTitle(s.loja ? s.loja.nome : 'Compra', { back: s.lista_id ? '/compras/lista/' + s.lista_id : '/compras', sub: s.lista_nome, actions: [ed && s.status === 'ABERTA' ? iconBtn('dots', 'Opções', () => openMenu({ title: 'Compra', items: [
      { icon: 'barcode', label: 'Ler código de barras', onClick: ler },
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
    const nw = novo && view.querySelector('.sess-item.is-new');
    novo = null;
    if (nw) { const b = nw.getBoundingClientRect(); if (b.top < 72 || b.bottom > innerHeight - 140) window.scrollTo({ top: Math.max(0, scrollY + b.top - innerHeight / 2), behavior: 'smooth' }); }
  }
  function item(i) {
    const p = i.produto_id && (store.produtos.get(i.produto_id) || { id: i.produto_id, nome: i.descricao });
    const priceBtn = h('button', { class: 'price-btn' + (i.preco_unitario ? '' : ' is-empty'), type: 'button', 'aria-label': `Preço de ${i.descricao}: ${i.preco_unitario ? money(i.preco_unitario) : 'sem preço'}${i.rotulo ? ' (' + i.rotulo + ')' : ''}. Alterar`, onclick: (e) => { e.stopPropagation(); editar(i); } },
      h('span', { class: 'num' }, i.preco_unitario ? money(i.preco_unitario * i.quantidade) : 'Preço'), i.quantidade !== 1 ? h('small', { class: 'num' }, `${num(i.quantidade, 3)} × ${money(i.preco_unitario || 0)}`) : i.preco_sugerido && i.preco_unitario !== i.preco_sugerido ? h('small', { class: 'num' }, 'era ' + money(i.preco_sugerido)) : null);
    const el = h('div', { class: 'sess-item' + (i.marcado ? ' is-on' : '') + (i._p ? ' is-pending' : '') + (novo === i.id ? ' is-new' : ''), role: 'checkbox', tabindex: '0', 'aria-checked': String(!!i.marcado), 'aria-label': i.descricao },
      h('span', { class: 'sess-check', 'aria-hidden': 'true' }, icon('check')), p ? thumb(p) : null,
      h('div', { class: 'sess-main' }, h('span', { class: 'row-title' }, i.descricao),
        h('span', { class: 'row-sub' }, i.quantidade !== 1 ? (isPeso(i.unidade) ? num(i.quantidade, 3) + ' ' + i.unidade.toLowerCase() : num(i.quantidade, 3) + ' un.') : '', i.rotulo ? badge(i.rotulo, 'xfer', 'tag') : null, !i.preco_unitario && i.marcado ? badge('Sem preço', 'warn', 'alert') : null),
        i.dica ? h('span', { class: 'row-hint num' }, `Leve ${num(i.dica.qtd_min, 3)} e pague ${money(i.dica.preco)} cada`) : null), priceBtn);
    const toggle = () => { if (!ed) return; haptic(i.marcado ? 8 : [8, 30, 12]); i.marcado = !i.marcado; draw(); sync(i, { marcado: i.marcado }); if (i.marcado && !i.preco_unitario) editar(i); };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    return el;
  }
  // Gravação otimista com fila por item (evita duplo envio e mantém o último estado). Devolve o item como o servidor gravou.
  function sync(i, patch) {
    const w = { ...(i._want || {}) };
    if ('opcao_id' in patch) { delete w.preco_unitario; delete w.rotulo; }
    if ('preco_unitario' in patch) delete w.opcao_id;
    i._want = { ...w, ...patch };
    if (i._run) return i._run;
    i._run = (async () => {
      let last = null;
      while (i._want) {
        const x = i._want; i._want = null; i._p = true;
        try { last = await call('sessoes.item.salvar', { id: i.id, ...x }, { rid: uuid() }); }
        catch (e) { toast(e.message, { tone: 'danger', action: { label: 'Recarregar', onClick: reload } }); i._p = false; i._run = null; reload(); return null; }
      }
      i._p = false; i._run = null;
      if (last) SERVIDOR.forEach((k) => { if (k in last) i[k] = last[k]; });
      return last;
    })();
    return i._run;
  }
  function editar(i) {
    let preco = i.preco_unitario || 0, q = i.quantidade, cat = i.categoria_id, rot = i.rotulo || '', mexeu = false, nomeP = '';
    const kg = isPeso(i.unidade);
    const mf = moneyField(i.quantidade !== 1 ? 'Preço unitário' : 'Preço', { value: preco, big: true, autofocus: true, onChange: (v) => { preco = v; mexeu = true; rot = ''; upd(); drawChips(); } });
    mf.input.dataset.forceFocus = '1';
    const chips = h('div', { class: 'chip-row price-chips', role: 'group', 'aria-label': 'Preços deste item' });
    const dicaEl = h('p', { class: 'price-hint num' });
    const sub = h('div', { class: 'items-sum' });
    const upd = () => sub.replaceChildren(h('span', {}, 'Total do item'), h('strong', { class: 'num' }, money(preco * q)));
    const igual = (a, b) => a != null && Math.abs(a - b) < 0.005;
    const drawChips = () => {
      const ops = (i.opcoes || []).filter((o) => o.preco > 0);
      const todos = [...(i.preco_normal > 0 ? [{ id: '', rotulo: 'Normal', preco: i.preco_normal }] : []), ...ops];
      chips.hidden = !ops.length;
      chips.replaceChildren(...todos.map((o) => chip(`${o.rotulo} ${money(o.preco)}${o.qtd_min ? ` (a partir de ${num(o.qtd_min, 3)})` : ''}`, {
        selected: igual(o.preco, preco) && (o.id ? rot === o.rotulo : !rot), onClick: () => escolher(o) })));
      dicaEl.textContent = i.dica ? `Leve ${num(i.dica.qtd_min, 3)} e pague ${money(i.dica.preco)} cada` : '';
      dicaEl.hidden = !i.dica;
    };
    const doServidor = (r) => { if (!r || mexeu) return; preco = r.preco_unitario || 0; rot = r.rotulo || ''; mf.set(preco); upd(); drawChips(); };
    const escolher = (o) => {
      haptic(6); mexeu = false; nomeP = ''; nomeF.input.value = '';
      preco = o.preco; rot = o.id ? o.rotulo : ''; mf.set(preco); upd(); drawChips();
      sync(i, o.id ? { opcao_id: o.id } : { preco_unitario: i.preco_normal, rotulo: '' }).then(doServidor);
    };
    // Mudou só a quantidade: o servidor reaplica o preço certo (ex.: chegou a 12 → Atacado) se o preço não foi mexido à mão
    const enviarQ = debounce((v) => sync(i, { quantidade: v }).then(doServidor), 450);
    const nomeF = textField('Nome do preço', { placeholder: 'Ex.: Promoção', maxlength: 30, onInput: (v) => { nomeP = v.trim(); } });
    const nomeBox = h('div', { hidden: true }, nomeF);
    const nomeBtn = i.produto_id ? btn('Dar nome a este preço', { kind: 'ghost', size: 'sm', icon: 'tag', onClick: () => { nomeBox.hidden = false; nomeBtn.hidden = true; nomeF.input.focus(); } }) : null;
    const b = btn('Pronto', { size: 'lg', full: true });
    b.onclick = async () => {
      const patch = { categoria_id: cat, marcado: true };
      if (q !== i.quantidade) patch.quantidade = q;
      if (mexeu || nomeP) { patch.preco_unitario = preco || null; if (nomeP) patch.rotulo = nomeP; }
      Object.assign(i, { quantidade: q, categoria_id: cat, marcado: true }, mexeu || nomeP ? { preco_unitario: preco || null, rotulo: nomeP } : {});
      await sh.close(); draw();
      sync(i, patch).then((r) => { if (r && ctx.alive()) draw(); });
    };
    mf.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') b.click(); });
    upd(); drawChips();
    const sh = openSheet({ title: i.descricao, footer: b, content: [chips, dicaEl, mf, nomeBtn, nomeBox,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, kg ? 'Peso' : 'Quantidade'), stepper({ value: q, min: kg ? 0.05 : 1, max: 999, step: kg ? 0.05 : 1, label: 'Quantidade', format: (v) => (kg ? num(v, 3) + ' ' + i.unidade.toLowerCase() : String(v)), onChange: (v) => { q = v; upd(); enviarQ(v); } })),
      pickField('Categoria', { value: cat, items: () => categoriaItems('DESPESA'), onChange: (v) => { cat = v; } }), sub] });
  }
  function ler() { lerProduto(ctx, { onProduct: (p) => addItem(p) }); }
  // Produto que já está na compra: soma direto, sem perguntar preço de novo
  async function addItem(prod) {
    if (prod && s) {
      const ex = s.itens.find((x) => x.produto_id === prod.id);
      if (ex) { try { await adicionar({ prod, q: 1, antes: !!ex.marcado }); } catch (e) { toast(e.message, { tone: 'danger' }); } return; }
    }
    let desc = prod ? prod.nome : '', preco = 0, q = 1;
    const err = formError(), rid = uuid();
    const f = prod ? null : textField('Item', { placeholder: 'Ex.: Pão francês', autofocus: true, onInput: (v) => { desc = v; } });
    const mf = moneyField('Preço', { value: 0, onChange: (v) => { preco = v; } });
    const b = btn('Adicionar ao carrinho', { size: 'lg', full: true, icon: 'cart' });
    b.onclick = async () => {
      if (!desc.trim()) { f && f.setError('Informe o item'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { await adicionar({ prod, desc: desc.trim(), q, preco, rid, fechar: () => sh.close() }); }
      catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const sh = openSheet({ title: prod ? prod.nome : 'Adicionar item', footer: b, content: [err, f, h('div', { class: 'grid-2' }, mf, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quantidade'), stepper({ value: 1, min: 1, max: 99, onChange: (v) => { q = v; } }))),
      prod ? null : btn('Ler código de barras', { kind: 'ghost', icon: 'barcode', onClick: async () => { await sh.close(); ler(); } })] });
  }
  async function adicionar({ prod, desc, q, preco, rid, antes, fechar }) {
    const r = await call('sessoes.item.adicionar', { sessao_id: id, produto_id: prod ? prod.id : undefined, descricao: prod ? undefined : desc, quantidade: q, preco_unitario: preco || undefined }, { rid: rid || uuid() });
    if (fechar) await fechar();
    haptic(12);
    novo = r.id;
    const qt = qTxt(r.quantidade, r.unidade);
    toast(r.ja_existia ? (antes === false ? 'Estava na lista: agora no carrinho, ' + qt : 'Já estava no carrinho: agora ' + qt) : 'No carrinho: ' + r.descricao, { tone: 'success', duration: 2000 });
    await refresh();
    if (prod && r.parecidos && r.parecidos.length && (await talvezUnir(r.parecidos, prod))) refresh();
    return r;
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
