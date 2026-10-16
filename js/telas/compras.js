// Compras: listas, produtos e lojas (hub) + roteamento para lista, sessão, comparação e produto
// Também: busca de produto em sheet, união de item digitado com produto, adicionar a uma lista e cadastro de pacote
import { h, money, relDate, uuid, emit, dmy, initials, embalagem, debounce, haptic, num } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { infinite, swipeable, longPress } from '../ui/gestures.js';
import { scanCode, geolocate } from '../ui/media.js';
import { escolherNoMapa, coordTxt } from '../ui/mapa.js';
import { segmented, card, row, badge, empty, errorState, skelRows, skelCards, btn, iconBtn, searchBox, thumb, textField, pickField, formError, chip, sectionHead, field, toggle } from '../ui/components.js';
import { categoriaItems } from './lancForm.js';
import { garantir, indicePronto, buscarLocal, onIndice, aplicarLocal } from '../indice.js';

export default async function compras(ctx) {
  const [sub, id] = ctx.params;
  if (sub === 'lista') return (await import('./lista.js')).default(ctx, id);
  if (sub === 'sessao') return (await import('./sessao.js')).default(ctx, id);
  if (sub === 'comparar') return (await import('./comparar.js')).default(ctx, id);
  if (sub === 'produto') return (await import('./produto.js')).default(ctx, id);
  const aba = ['produtos', 'lojas'].includes(sub) ? sub : 'listas';
  ctx.setTitle('Compras', { actions: [iconBtn('barcode', 'Ler código de barras', () => lerProduto(ctx))] });
  const tabs = segmented([{ value: 'listas', label: 'Listas' }, { value: 'produtos', label: 'Produtos' }, { value: 'lojas', label: 'Lojas' }], { value: aba, aria: 'Seção', onChange: (v) => ctx.go('/compras' + (v === 'listas' ? '' : '/' + v)) });
  const body = h('div', { class: 'sec' });
  ctx.view.append(h('div', { class: 'sticky-tools' }, tabs), body);
  if (aba === 'listas') return listas(ctx, body);
  if (aba === 'produtos') return produtos(ctx, body);
  return lojas(ctx, body);
}

async function listas(ctx, body) {
  if (can('editor')) ctx.setFab({ label: 'Nova lista', icon: 'plus', onClick: () => novaLista(ctx) });
  const grid = h('div', { class: 'list-cards' }, skelCards(3));
  body.append(grid);
  try {
    const [ls, abertas] = await Promise.all([load('listas.listar', {}), load('sessoes.listar', { status: 'ABERTA' })]);
    if (!ls.length) { grid.replaceChildren(empty({ ic: 'bag', title: 'Nenhuma lista de compras', action: can('editor') ? btn('Criar lista', { icon: 'plus', onClick: () => novaLista(ctx) }) : null })); return; }
    const out = abertas.map((s) => h('button', { class: 'card lcard', type: 'button', onclick: () => ctx.go('/compras/sessao/' + s.id) },
      h('div', { class: 'lcard-top' }, h('span', { class: 'tipo-ico tone-in' }, icon('cart')), h('span', { class: 'lcard-name truncate' }, 'Comprando: ' + s.lista_nome), icon('chevR')),
      h('span', { class: 'lcard-sub' }, (s.loja ? s.loja.nome : '') + ' · ' + s.itens.filter((i) => i.marcado).length + ' de ' + s.itens.length + ' no carrinho')));
    out.push(...ls.map((l) => h('button', { class: 'card lcard', type: 'button', onclick: () => ctx.go('/compras/lista/' + l.id) },
      h('div', { class: 'lcard-top' }, h('span', { class: 'tipo-ico' }, icon('bag')), h('span', { class: 'lcard-name truncate' }, l.nome), icon('chevR', 'muted')),
      h('span', { class: 'lcard-sub' }, l.itens ? `${l.itens - l.comprados} a comprar${l.comprados ? ` · ${l.comprados} comprados` : ''}` : 'Vazia'),
      l.itens ? h('span', { class: 'lcard-prog', style: { '--p': String(l.comprados / l.itens) } }) : null)));
    grid.replaceChildren(...out);
  } catch (e) { grid.replaceChildren(errorState(e.message, ctx.refresh)); }
}
export function novaLista(ctx) {
  const err = formError(), rid = uuid();
  let nome = '';
  const f = textField('Nome da lista', { placeholder: 'Ex.: Mercado da semana', autofocus: true, onInput: (v) => { nome = v; f.setError(''); } });
  f.input.dataset.forceFocus = '1';
  const b = btn('Criar lista', { size: 'lg', full: true });
  const go = async () => {
    if (!nome.trim()) { f.setError('Dê um nome'); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { const l = await call('listas.criar', { nome: nome.trim() }, { rid }); await s.close(); ctx.go('/compras/lista/' + l.id); } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  b.onclick = go;
  f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const s = openSheet({ title: 'Nova lista', content: [err, f], footer: b });
}

function produtos(ctx, body) {
  if (can('editor')) ctx.setFab({ label: 'Novo produto', icon: 'plus', onClick: () => produtoForm({ onSaved: (p) => ctx.go('/compras/produto/' + p.id) }) });
  let texto = '';
  const list = h('div', { class: 'list' });
  const search = searchBox({ placeholder: 'Buscar produto ou código', onSearch: (v) => { texto = v; reload(); } });
  const velho = (v) => { list.classList.toggle('is-stale', v); list.inert = v; };
  search.input.addEventListener('input', () => velho(search.input.value.trim() !== texto));
  body.append(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search), btn('', { kind: 'secondary', icon: 'barcode', aria: 'Ler código de barras', onClick: () => lerProduto(ctx) })), list);
  let inf;
  const reload = () => {
    inf && inf.stop(); list.replaceChildren(); velho(false);
    inf = infinite({ container: list, skeleton: () => skelRows(4), limite: 40,
      load: (offset, limite) => call('produtos.listar', { texto: texto || undefined, offset, limite }),
      render: (its) => its.forEach((p) => {
        store.produtos.set(p.id, p);
        const r = prodRow(p, () => ctx.go('/compras/produto/' + p.id));
        if (!can('editor')) { list.append(r); return; }
        longPress(r, () => openMenu({ title: p.nome, items: [
          { icon: 'bag', label: 'Adicionar a uma lista', onClick: () => addLista(p) },
          { icon: 'chevR', label: 'Ver produto', onClick: () => ctx.go('/compras/produto/' + p.id) },
        ] }));
        list.append(swipeable(r, { right: { label: 'Na lista', icon: 'bag', tone: 'xfer', run: () => addLista(p) } }));
      }),
      onEmpty: () => list.replaceChildren(empty({ ic: 'tag', title: texto ? 'Nenhum produto encontrado' : 'Nenhum produto ainda', action: can('editor') ? btn(texto ? 'Cadastrar “' + texto + '”' : 'Cadastrar produto', { kind: 'secondary', icon: 'plus', onClick: () => { const t = search.input.value.trim(); produtoForm({ initial: { nome: t }, conferirNome: !!t, onSaved: (p) => ctx.go('/compras/produto/' + p.id) }); } }) : null })),
      onError: (e, retry) => list.append(errorState(e.message, retry)) });
  };
  ctx.onCleanup(() => inf && inf.stop());
  reload();
}
export const pacoteTxt = (p) => (p && p.contem_qtd ? 'Pacote com ' + p.contem_qtd : '');
export const unidadeTxt = (p) => (p && p.contem_qtd && p.preco_unidade ? money(p.preco_unidade) + ' / un.' : '');
export const prodSub = (p) => [p.marca, pacoteTxt(p) || embalagem(p)].filter(Boolean).join(' · ');
export function prodRow(p, onClick, trail) {
  return row({ lead: thumb(p), title: p.nome, sub: [prodSub(p), p.gtin ? null : 'sem código'].filter(Boolean).join(' · '),
    trail: trail !== undefined ? trail : p.ultimo_preco ? h('span', { class: 'num' }, money(p.ultimo_preco)) : null, trailSub: unidadeTxt(p) || (p.ultimo_preco_data ? relDate(p.ultimo_preco_data) : null), onClick });
}

// Busca de produto em sheet (texto ou código). filtro: quais produtos servem (ex.: só unidades, nunca ele mesmo)
export function buscarProduto({ title = 'Escolher produto', texto = '', filtro } = {}) {
  garantir();
  return new Promise((res) => {
    let chosen = null, seq = 0, mostrado = null, local = false;
    const list = h('div', { class: 'pick-list', role: 'listbox', 'aria-label': title }, skelRows(4));
    const busy = h('span', { class: 'sug-busy', hidden: true, 'aria-hidden': 'true' });
    const atual = () => input.value.trim();
    const escolher = (p) => { chosen = p; haptic(6); s.close(); };
    const velho = (v) => { list.classList.toggle('is-stale', v); list.inert = v; busy.hidden = !v; };
    const draw = (t, its) => { mostrado = t; velho(false); list.replaceChildren(...(its.length ? its.map((p) => h('button', { class: 'pick-item', type: 'button', role: 'option', onclick: () => escolher(p) },
      thumb(p), h('span', { class: 'pick-text' }, h('span', { class: 'pick-label' }, p.nome), prodSub(p) ? h('span', { class: 'pick-sub' }, prodSub(p)) : null),
      p.ultimo_preco ? h('span', { class: 'pick-right num' }, money(p.ultimo_preco)) : null)) : [h('p', { class: 'pick-empty' }, 'Nada encontrado')])); };
    const rede = debounce(async (t) => {
      if (indicePronto()) return;
      const my = ++seq;
      try {
        const r = await load('produtos.listar', { texto: t || undefined, limite: 20 });
        if (my !== seq || t !== atual()) return;
        r.itens.forEach((p) => store.produtos.set(p.id, p));
        draw(t, r.itens.filter((p) => !filtro || filtro(p)));
      } catch (e) { if (my === seq && t === atual()) { mostrado = t; velho(false); list.replaceChildren(errorState(e.message, find)); } }
    }, 250);
    // Com índice: filtra no aparelho a cada tecla. Sem índice: servidor, com o resultado velho esmaecido até chegar o novo
    const find = () => {
      const t = atual();
      local = indicePronto();
      if (local) { seq++; draw(t, buscarLocal(t, { limite: 20, filtro }).itens); return; }
      if (mostrado !== null && mostrado !== t) velho(true);
      rede(t);
    };
    const input = h('input', { type: 'search', placeholder: 'Buscar produto', 'aria-label': 'Buscar produto', value: texto, autofocus: true, enterkeyhint: 'search', oninput: find });
    input.dataset.forceFocus = '1';
    const ler = async () => {
      const c = await scanCode({ title: 'Ler código de barras' });
      if (!c) return;
      try {
        const r = await call('produtos.porGtin', { gtin: c });
        if (r.origem !== 'ESPACO') { toast('Produto não cadastrado neste espaço.', { ico: 'tag' }); return; }
        store.produtos.set(r.produto.id, r.produto);
        if (filtro && !filtro(r.produto)) { toast('Este produto não serve aqui.', { ico: 'tag' }); return; }
        escolher(r.produto);
      } catch (e) { toast(e.message, { tone: 'danger' }); }
    };
    const off = onIndice(() => { if (!local) find(); });
    const s = openSheet({ title, size: 'tall', content: [h('div', { class: 'toolbar' }, h('label', { class: 'search grow' }, icon('search'), input), btn('', { kind: 'secondary', icon: 'barcode', aria: 'Ler código de barras', onClick: ler })), busy, list], onClose: () => { off(); res(chosen); } });
    find();
  });
}

// Itens digitados à mão que parecem o produto: o servidor nunca une sozinho, a pessoa decide. Devolve quantos uniu.
export async function talvezUnir(parecidos, produto) {
  let n = 0;
  for (const x of parecidos || []) {
    const ok = await new Promise((res) => {
      let r = false;
      const s = openSheet({ title: 'Este item é o mesmo que “' + x.descricao + '”?',
        content: h('div', { class: 'list' },
          row({ lead: h('span', { class: 'thumb' }, h('span', { class: 'thumb-ph' }, icon('tag'))), title: x.descricao, sub: 'Digitado · ' + num(x.quantidade, 3) + '×' }),
          row({ lead: thumb(produto), title: produto.nome, sub: prodSub(produto) || null })),
        footer: h('div', { class: 'btn-row' }, btn('São diferentes', { kind: 'secondary', onClick: () => s.close() }), btn('Unir', { icon: 'check', onClick: () => { r = true; haptic(12); s.close(); } })),
        onClose: () => res(r) });
    });
    if (!ok) continue;
    try { const r = await call('listas.item.vincular', { id: x.id, produto_id: produto.id }, { rid: uuid() }); n++; toast('Unido: ' + r.descricao + (r.unido ? ' · ' + num(r.quantidade, 3) + '×' : ''), { tone: 'success', duration: 2200 }); }
    catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  return n;
}

// Adicionar produto a uma lista ativa (se só existe uma, vai direto)
export async function addLista(p, { quantidade = 1 } = {}) {
  const ls = await load('listas.listar', {}).catch(() => []);
  const v = ls.length === 1 ? ls[0].id : await pick({ title: 'Adicionar a', items: ls.map((l) => ({ value: l.id, label: l.nome, icon: 'bag', sub: l.itens ? (l.itens - l.comprados) + ' a comprar' : 'Vazia' })), emptyText: 'Crie uma lista primeiro' });
  if (!v) return null;
  const nome = (ls.find((l) => l.id === v) || {}).nome || 'lista';
  try {
    const r = await call('listas.item.adicionar', { lista_id: v, produto_id: p.id, quantidade }, { rid: uuid() });
    haptic(10);
    toast(r.ja_existia ? 'Já estava em ' + nome + ': agora são ' + num(r.quantidade, 3) : 'Adicionado a ' + nome + '.', { tone: 'success', duration: 2200 });
    if (r.parecidos && r.parecidos.length) await talvezUnir(r.parecidos, p);
    return r;
  } catch (e) { toast(e.message, { tone: 'danger' }); return null; }
}

export async function lerProduto(ctx, { onProduct } = {}) {
  const code = await scanCode({ title: 'Ler código de barras' });
  if (!code) return;
  const t = toast('Procurando ' + code + '…', { ico: 'search', duration: 8000 });
  try {
    const r = await call('produtos.porGtin', { gtin: code });
    t();
    if (r.origem === 'ESPACO') { store.produtos.set(r.produto.id, r.produto); return onProduct ? onProduct(r.produto) : ctx.go('/compras/produto/' + r.produto.id); }
    if (!can('editor')) { toast('Produto não cadastrado neste espaço.', { ico: 'tag' }); return; }
    if (r.externo_indisponivel) toast('Consulta de produtos indisponível agora. Preencha manualmente.', { ico: 'search' });
    produtoForm({ initial: r.sugestao ? { ...r.sugestao, gtin: code } : { gtin: code }, fromCatalog: !!r.sugestao, onSaved: (p) => (onProduct ? onProduct(p) : ctx.go('/compras/produto/' + p.id)) });
  } catch (e) { t(); toast(e.message, { tone: 'danger' }); }
}

const UNID = ['UN', 'KG', 'G', 'L', 'ML'].map((u) => ({ value: u, label: { UN: 'Unidade', KG: 'Quilo (kg)', G: 'Grama (g)', L: 'Litro (L)', ML: 'Mililitro (ml)' }[u] }));
export function produtoForm({ edit, initial = {}, fromCatalog, conferirNome, onSaved } = {}) {
  const st = { nome: '', marca: '', gtin: '', unidade: 'UN', tam_embalagem: '', categoria_id: null, contem_id: null, contem_qtd: null, ...(edit || initial) };
  const err = formError(), rid = uuid();
  const fn = textField('Nome', { value: st.nome, placeholder: 'Ex.: Cerveja Amstel — pacote com 12', autofocus: !st.nome || !!conferirNome, onInput: (v) => { st.nome = v; fn.setError(''); } });
  if (conferirNome) { fn.classList.add('field--check'); fn.input.dataset.forceFocus = '1'; }
  // Pacote: contém N unidades de outro produto (que não pode ser, ele mesmo, um pacote)
  let pac = !!st.contem_id;
  let contem = st.contem_id ? (store.produtos.get(st.contem_id) || { id: st.contem_id, nome: st.contem_nome || 'Produto' }) : null;
  let qtd = st.contem_qtd ? String(st.contem_qtd) : '';
  const contemTxt = h('span', { class: 'pickf-text' });
  const contemIco = h('span', { class: 'pickf-ico' });
  const drawContem = () => { contemTxt.textContent = contem ? contem.nome : 'Escolher a unidade'; contemTxt.classList.toggle('is-ph', !contem); contemIco.replaceChildren(icon('tag')); };
  const contemBtn = h('button', { class: 'input input--pick', type: 'button', 'aria-haspopup': 'dialog', onclick: async () => {
    const p = await buscarProduto({ title: 'O pacote contém', filtro: (x) => !x.contem_id && (!edit || x.id !== edit.id) });
    if (p) { contem = p; drawContem(); contemF.setError(''); }
  } }, contemIco, contemTxt, icon('chevD', 'pickf-chev'));
  drawContem();
  const contemF = field('Contém', contemBtn);
  const qtdF = textField('Quantidade', { value: qtd, inputmode: 'numeric', placeholder: 'Ex.: 12', maxlength: 3, onInput: (v) => { qtd = v.replace(/\D/g, ''); qtdF.input.value = qtd; qtdF.setError(''); } });
  const pacBox = h('div', { class: 'grid-2 pac-box', hidden: !pac }, contemF, qtdF);
  const tamF = textField('Tamanho da embalagem', { value: st.tam_embalagem && !pac ? String(st.tam_embalagem).replace('.', ',') : '', placeholder: 'Ex.: 500', inputmode: 'decimal', tipText: 'Só o número, na unidade escolhida ao lado (ex.: 500 com Grama = 500 g). Deixe em branco se o produto é vendido por unidade.', onInput: (v) => { st.tam_embalagem = v.replace(/[^\d.,]/g, ''); } });
  const unF = pickField('Unidade', { value: st.unidade, items: UNID, onChange: (v) => { st.unidade = v; } });
  const setPac = (v) => {
    pac = v; pacBox.hidden = !v; tamF.input.disabled = v;
    if (v) { st.unidade = 'UN'; unF.set('UN'); st.tam_embalagem = ''; tamF.input.value = ''; }
  };
  const pacT = toggle('É um pacote?', { checked: pac, onChange: setPac });
  tamF.input.disabled = pac;
  const campoDoErro = (m) => (/quantidade/i.test(m) ? qtdF : /pacote|cont[eé]m|unidade|ele mesmo/i.test(m) ? contemF : /nome/i.test(m) ? fn : null);
  const b = btn(edit ? 'Salvar' : 'Cadastrar produto', { size: 'lg', full: true });
  b.onclick = async () => {
    let bad = false;
    if (!st.nome.trim()) { fn.setError('Dê um nome'); bad = true; }
    if (pac && !contem) { contemF.setError('Escolha a unidade que vem no pacote'); bad = true; }
    if (pac && !(Number(qtd) >= 2)) { qtdF.setError('A partir de 2'); bad = true; }
    if (bad) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      const p = { nome: st.nome.trim(), marca: st.marca || undefined, unidade: st.unidade, tam_embalagem: st.tam_embalagem === '' || st.tam_embalagem == null ? undefined : st.tam_embalagem, categoria_id: st.categoria_id || undefined };
      if (pac) Object.assign(p, { contem_id: contem.id, contem_qtd: Number(qtd) });
      else if (edit && edit.contem_id) p.contem_id = '';
      if (edit) Object.assign(p, { id: edit.id, versao: edit.versao }); else if (st.gtin) p.gtin = st.gtin;
      const r = await call('produtos.salvar', p, { rid });
      store.produtos.set(r.id, r); aplicarLocal(r);
      await s.close(); toast(edit ? 'Produto atualizado.' : 'Produto cadastrado.', { tone: 'success' }); emit('dados'); onSaved && onSaved(r);
    } catch (e) {
      const f = campoDoErro(e.message);
      if (f) f.setError(e.message); else err.show(e.message);
    } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar produto' : 'Novo produto', size: 'full', footer: b, content: [
    fromCatalog ? h('div', { class: 'warn-item' }, icon('verified'), h('span', {}, 'Encontrado no catálogo colaborativo. Confira e salve.')) : null,
    err, fn, conferirNome ? h('p', { class: 'name-check' }, icon('edit'), h('span', {}, 'Veio do que você digitou. Confira o nome antes de cadastrar.')) : null, pacT, pacBox,
    h('div', { class: 'grid-2' }, textField('Marca', { value: st.marca || '', onInput: (v) => { st.marca = v; } }), tamF),
    h('div', { class: 'grid-2' }, unF, pickField('Categoria', { value: st.categoria_id, items: () => categoriaItems('DESPESA'), placeholder: 'Opcional', onChange: (v) => { st.categoria_id = v; } })),
    edit && edit.gtin ? h('div', { class: 'form-readonly' }, h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Código de barras'), h('span', { class: 'kv-v num' }, edit.gtin))) :
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Código de barras'), h('div', { class: 'scan-manual' }, h('input', { class: 'input num', inputmode: 'numeric', value: st.gtin || '', placeholder: 'Opcional', 'aria-label': 'Código de barras', oninput: (e) => { st.gtin = e.target.value.replace(/\D/g, ''); } }),
        btn('', { kind: 'secondary', icon: 'barcode', aria: 'Ler código', onClick: async () => { const c = await scanCode(); if (c) { st.gtin = c; s.el.querySelector('input[aria-label="Código de barras"]').value = c; } } }))),
  ] });
  if (conferirNome) setTimeout(() => { fn.input.focus({ preventScroll: true }); fn.input.select(); }, 360);   // depois da animação da sheet
}

async function lojas(ctx, body) {
  if (can('editor')) ctx.setFab({ label: 'Nova loja', icon: 'plus', onClick: () => lojaForm() });
  let modo = 'todas', pos = null, casa = null;
  const tools = h('div', { class: 'chip-row chip-row--scroll' });
  const list = h('div', { class: 'list' }, skelRows(4));
  body.append(tools, list);
  load('deslocamento.ler', {}).then((d) => { casa = (d.enderecos || []).find((e) => e.padrao && e.status !== 'INATIVO') || null; if (casa) drawTools(); }).catch(() => {});
  // Filtros primeiro; depois do separador, a ação que abre o catálogo da comunidade (não é filtro, não fica marcada)
  const drawTools = () => tools.replaceChildren(chip('Todas', { selected: modo === 'todas', onClick: () => { modo = 'todas'; draw(); } }), casa ? chip('Perto de ' + casa.nome, { selected: modo === 'casa', ic: 'home', onClick: () => { modo = 'casa'; draw(); } }) : '', chip('Perto de mim', { selected: modo === 'perto', ic: 'pin', onClick: async () => { try { pos ||= await geolocate(); modo = 'perto'; draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } } }),
    can('editor') ? h('span', { class: 'chip-sep', 'aria-hidden': 'true' }) : '', can('editor') ? chip('Da comunidade', { ic: 'users', onClick: () => catalogoLojas(draw) }) : '');
  const draw = async () => {
    drawTools(); list.replaceChildren(skelRows(4));
    try {
      const ref = modo === 'casa' && casa ? casa : modo === 'perto' ? pos : null;
      const ls = ref ? await call('lojas.proximas', { latitude: ref.latitude, longitude: ref.longitude, raio_km: 15 }) : await load('lojas.listar', {});
      if (!ls.length) { list.replaceChildren(empty({ ic: 'store', title: ref ? 'Nenhuma loja a até 15 km' : 'Nenhuma loja cadastrada', action: can('editor') ? h('div', { class: 'btn-inline' }, btn('Cadastrar loja', { icon: 'plus', onClick: () => lojaForm(null, draw) }), btn('Buscar na comunidade', { kind: 'secondary', icon: 'users', onClick: () => catalogoLojas(draw) })) : null })); return; }
      list.replaceChildren(...ls.map((l) => row({
        lead: h('span', { class: 'tipo-ico' }, icon('store')), title: l.nome,
        sub: [l.cidade && l.uf ? `${l.cidade}/${l.uf}` : l.cidade, l.cnpj ? 'CNPJ ' + l.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null].filter(Boolean).join(' · '),
        badges: [l.latitude == null ? badge('Sem localização', 'warn', 'pin') : null, l.global ? badge('De outras pessoas', 'neutral', 'users') : null].filter(Boolean),
        trail: l.distancia_km != null ? h('span', { class: 'num' }, String(l.distancia_km).replace('.', ',') + ' km') : null,
        onClick: () => openMenu({ title: l.nome, items: [
          can('editor') && !l.global && { icon: 'edit', label: 'Editar', onClick: () => lojaForm(l, draw) },
          can('editor') && !l.global && { icon: 'ban', label: 'Inativar loja', tone: 'out', onClick: async () => { if (!(await confirmSheet({ title: `Inativar “${l.nome}”?`, content: 'Ela deixa de aparecer nas escolhas e nas comparações. Os preços já registrados continuam no histórico.', confirm: 'Inativar', tone: 'danger' }))) return; try { await call('lojas.salvar', { id: l.id, status: 'INATIVO', versao: l.versao }, { rid: uuid() }); toast('Loja inativada.', { tone: 'success' }); emit('dados'); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } } },
          l.latitude != null && { icon: 'route', label: 'Abrir no mapa', onClick: () => window.open(`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=17/${l.latitude}/${l.longitude}`, '_blank', 'noopener') },
          { icon: 'flag', label: 'Denunciar', tone: 'out', onClick: () => denunciar('loja', l.id) },
        ] }),
      })));
    } catch (e) { list.replaceChildren(errorState(e.message, draw)); }
  };
  draw();
}
const LOC_TXT = { oficial: 'Localização oficial', confirmada: 'Confirmada pela comunidade', informada: 'Informada por você', manual: 'Informada manualmente' };
const cnpjMask = (v) => String(v || '').replace(/\D/g, '').slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
const cepMaskL = (v) => { const d = String(v || '').replace(/\D/g, '').slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; };

export function lojaForm(edit, after) {
  const st = { nome: '', cnpj: '', cidade: '', uf: '', cep: '', logradouro: '', numero: '', bairro: '', latitude: null, longitude: null, loc_origem: '', ...(edit || {}) };
  ['cnpj', 'cidade', 'uf', 'logradouro', 'numero', 'bairro'].forEach((k) => { st[k] = st[k] || ''; });
  st.cep = cepMaskL(st.cep); st.userCoord = false;
  const err = formError(), rid = uuid();
  const fn = textField('Nome da loja', { value: st.nome, placeholder: 'Ex.: Mercado do bairro', autofocus: !edit, onInput: (v) => { st.nome = v; fn.setError(''); } });
  const info = h('div', { class: 'loc-cep', 'aria-live': 'polite' });
  let seq = 0;
  const fcnpj = textField('CNPJ', { value: cnpjMask(st.cnpj), inputmode: 'numeric', placeholder: 'Opcional', maxlength: 18, tipText: 'Com o CNPJ, o nome, o endereço e a localização oficiais vêm sozinhos.',
    onInput: (v) => { st.cnpj = v.replace(/\D/g, '').slice(0, 14); fcnpj.input.value = cnpjMask(st.cnpj); if (st.cnpj.length === 14 && !(edit && edit.cnpj)) consultarCnpj(); else if (st.cnpj.length < 14) { seq++; info.replaceChildren(); } } });
  const cepErr = h('span', { class: 'field-err', role: 'alert' });
  const fcep = textField('CEP', { value: st.cep, inputmode: 'numeric', placeholder: '00000-000', autocomplete: 'postal-code', maxlength: 9, onInput: (v) => { st.cep = cepMaskL(v); fcep.input.value = st.cep; cepErr.textContent = ''; if (st.cep.length === 9 && !st.logradouro) consultarCep(); } });
  const frua = textField('Rua', { value: st.logradouro, onInput: (v) => { st.logradouro = v; } });
  const fnum = textField('Número', { value: st.numero, placeholder: 'S/N se não tiver', onInput: (v) => { st.numero = v; } });
  const fbai = textField('Bairro', { value: st.bairro, onInput: (v) => { st.bairro = v; } });
  const fcid = textField('Cidade', { value: st.cidade, onInput: (v) => { st.cidade = v; } });
  const fuf = textField('UF', { value: st.uf, maxlength: 2, placeholder: 'PA', onInput: (v) => { st.uf = v.toUpperCase(); fuf.input.value = st.uf; } });
  const poe = (campo, f, v) => { if (v && !String(st[campo] || '').trim()) { st[campo] = v; f.input.value = v; } };
  const nota = (cls, ic, txt, ...extra) => h('div', { class: 'warn-item' + (cls ? ' ' + cls : ''), role: cls === 'is-danger' ? 'alert' : null }, icon(ic), h('div', { class: 'warn-body' }, h('span', {}, txt), ...extra));
  // Endereço: recolhido num resumo quando já está completo (veio do CNPJ ou é edição); "Editar" abre os campos
  const composto = () => [st.logradouro, st.numero, st.bairro, st.cidade && st.uf ? st.cidade + '/' + st.uf : st.cidade, st.cep.length === 9 ? 'CEP ' + st.cep : ''].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const resumo = h('p', { class: 'end-resumo' });
  const corpo = h('div', { class: 'form-sec-body' }, h('div', { class: 'grid-2' }, fcep, fnum), cepErr, frua, fbai, h('div', { class: 'grid-2 grid-uf' }, fcid, fuf));
  const bEnd = btn('Editar', { kind: 'ghost', size: 'sm', icon: 'edit', aria: 'Editar endereço', onClick: () => drawEnd(true, true) });
  const drawEnd = (aberto, foco) => { corpo.hidden = !aberto; bEnd.hidden = aberto; resumo.hidden = aberto; resumo.textContent = composto(); if (foco) fcep.input.focus(); };
  async function consultarCnpj() {
    const n = ++seq;
    info.replaceChildren(h('span', { class: 'loc-sub', role: 'status' }, 'Buscando os dados oficiais…'));
    try {
      const r = await call('cnpj.consultar', { cnpj: st.cnpj });
      if (n !== seq) return;
      poe('nome', fn, r.nome); poe('cidade', fcid, r.cidade); poe('uf', fuf, r.uf); poe('cep', fcep, cepMaskL(r.cep)); poe('logradouro', frua, r.logradouro); poe('numero', fnum, r.numero); poe('bairro', fbai, r.bairro);
      if (st.latitude == null && r.latitude != null) { st.latitude = r.latitude; st.longitude = r.longitude; st.loc_origem = 'oficial'; drawGeo(); }
      const outs = [h('div', { class: 'loc-found' }, icon(r.fonte === 'catalogo' ? 'users' : 'verified'), h('div', { class: 'loc-txt' },
        h('span', { class: 'loc-k' }, r.razao_social || r.nome),
        h('span', { class: 'loc-sub' }, r.fonte === 'catalogo' ? 'Do catálogo da comunidade' : 'Dados oficiais (Receita)'),
        r.precisao === 'cep' ? h('span', { class: 'loc-sub' }, 'Localização aproximada pelo CEP') : null))];
      if (r.ativa === false) outs.push(nota('', 'alert', 'Situação cadastral na Receita: ' + String(r.situacao || 'não ativa').toLowerCase() + '. Confira se a loja ainda funciona.'));
      if (r.loja_id && !(edit && edit.id === r.loja_id)) outs.push(nota('', 'store', 'Você já tem esta loja cadastrada.'));
      info.replaceChildren(...outs);
      if (st.logradouro.trim() && st.cidade.trim()) drawEnd(false);
    } catch (e) { if (n === seq) info.replaceChildren(nota('is-danger', 'alert', e.message, h('div', { class: 'btn-inline' }, btn('Tentar de novo', { kind: 'secondary', size: 'sm', onClick: consultarCnpj })))); }
  }
  async function consultarCep() {
    try {
      const r = await call('cep.consultar', { cep: st.cep.replace(/\D/g, ''), numero: st.numero || undefined });
      poe('logradouro', frua, r.logradouro); poe('bairro', fbai, r.bairro); poe('cidade', fcid, r.cidade); poe('uf', fuf, r.uf);
    } catch (e) { cepErr.textContent = e.message; }
  }
  const locIco = h('span', { class: 'tipo-ico' }), locTxt = h('span', { class: 'loc-txt' });
  const drawGeo = () => {
    const ok = st.latitude != null;
    locIco.className = 'tipo-ico' + (ok ? ' tone-in' : '');
    locIco.replaceChildren(icon(ok ? 'check' : 'pin'));
    locTxt.replaceChildren(h('span', { class: 'loc-k' }, ok ? (LOC_TXT[st.loc_origem] || 'Local marcado') : 'Sem localização'),
      h('span', { class: 'loc-sub' + (ok ? ' num' : '') }, ok ? coordTxt(st.latitude, st.longitude) : 'Sem local, a loja não aparece em “Perto de mim”. Informe o CNPJ ou marque abaixo.'));
  };
  drawGeo();
  const setUser = (p) => { st.latitude = p.latitude; st.longitude = p.longitude; st.userCoord = true; st.loc_origem = 'informada'; drawGeo(); };
  const bGps = btn('Onde estou', { kind: 'secondary', icon: 'locate', size: 'sm', onClick: async (e) => { const bb = e.currentTarget; bb.disabled = true; bb.setAttribute('aria-busy', 'true'); try { setUser(await geolocate()); } catch (x) { toast(x.message, { tone: 'danger' }); } finally { bb.disabled = false; bb.removeAttribute('aria-busy'); } } });
  const bMapa = btn('No mapa', { kind: 'secondary', icon: 'map', size: 'sm', onClick: async () => { const r = await escolherNoMapa({ latitude: st.latitude, longitude: st.longitude, busca: [st.logradouro, st.numero, st.cidade || st.nome].filter(Boolean).join(', ') }); if (r) setUser(r); } });
  drawEnd(!(st.logradouro.trim() && st.cidade.trim()));
  const b = btn(edit ? 'Salvar' : 'Cadastrar loja', { size: 'lg', full: true });
  b.onclick = async () => {
    if (!st.nome.trim()) { fn.setError('Dê um nome'); fn.input.focus(); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      const r = await call('lojas.salvar', { ...(edit ? { id: edit.id } : {}), nome: st.nome.trim(), cnpj: st.cnpj || undefined, cidade: st.cidade || undefined, uf: st.uf || undefined,
        cep: st.cep.replace(/\D/g, '') || undefined, logradouro: st.logradouro || undefined, numero: st.numero || undefined, bairro: st.bairro || undefined,
        ...(st.userCoord ? { latitude: st.latitude, longitude: st.longitude } : {}) }, { rid });
      await s.close(); toast('Loja salva.', { tone: 'success' }); if (r && r.aviso) setTimeout(() => toast(r.aviso, { tone: 'danger', duration: 9000 }), 400); emit('dados'); after && after(r);
    } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar loja' : 'Nova loja', footer: b, content: [err, fcnpj, info, fn,
    h('div', { class: 'form-sec' }, h('div', { class: 'form-sec-h' }, icon('pin'), h('span', { class: 'grow' }, 'Endereço'), bEnd), resumo, corpo),
    h('div', { class: 'form-sec' }, h('div', { class: 'form-sec-h' }, icon('map'), 'Localização'),
      h('div', { class: 'loc-box' }, h('div', { class: 'loc-now' }, locIco, locTxt), h('div', { class: 'loc-acts loc-acts--2' }, bGps, bMapa)))] });
}

/** Diretório da comunidade: lojas por CNPJ com endereço e localização oficiais. */
function catalogoLojas(depois) {
  let texto = '', pos = null, seq = 0;
  const lista = h('div', { class: 'list' });
  const conta = h('p', { class: 'loc-sub', 'aria-live': 'polite' });
  const busca = searchBox({ placeholder: 'Nome, cidade ou CNPJ', onSearch: (v) => { texto = (v || '').trim(); carregar(); } });
  const chips = h('div', { class: 'chip-row' });
  const drawChips = () => chips.replaceChildren(chip('Perto de mim', { ic: 'pin', selected: !!pos, onClick: async () => {
    if (pos) { pos = null; drawChips(); carregar(); return; }
    try { pos = await geolocate(); drawChips(); carregar(); } catch (x) { toast(x.message, { tone: 'danger' }); }
  } }));
  const adicionar = async (it, bb) => {
    bb.disabled = true; bb.setAttribute('aria-busy', 'true');
    try { await call('lojas.salvar', { nome: it.nome, cnpj: it.cnpj }, { rid: uuid() }); toast('Loja adicionada: ' + it.nome + '.', { tone: 'success' }); emit('dados'); depois && depois(); carregar(); }
    catch (x) { toast(x.message, { tone: 'danger' }); bb.disabled = false; bb.removeAttribute('aria-busy'); }
  };
  async function carregar() {
    const n = ++seq; lista.replaceChildren(skelRows(3)); conta.textContent = '';
    try {
      const r = await call('lojas.catalogo', { texto: texto || undefined, ...(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}) });
      if (n !== seq) return;
      const total = r.total != null ? r.total : r.itens.length;
      conta.textContent = !r.itens.length ? '' : (total > r.itens.length ? 'Mostrando ' + r.itens.length + ' de ' + total : total === 1 ? '1 loja' : total + ' lojas') + (pos ? ', das mais perto para as mais longe' : '');
      lista.replaceChildren(...(r.itens.length ? r.itens.map((it) => row({
        lead: h('span', { class: 'tipo-ico' }, icon('store')), title: it.nome,
        sub: [it.endereco || [it.cidade, it.uf].filter(Boolean).join('/'), it.distancia_km != null ? String(it.distancia_km).replace('.', ',') + ' km' : null].filter(Boolean).join(' · '),
        badges: [it.loc_origem === 'oficial' || it.loc_origem === 'confirmada' ? badge(LOC_TXT[it.loc_origem], 'in', 'check') : it.loc_origem ? badge(LOC_TXT[it.loc_origem] || 'Sem confirmação', 'muted', 'pin') : badge('Sem localização', 'warn', 'pin')],
        trail: it.ja_tenho ? badge('Já adicionada', 'muted', 'check') : btn('Adicionar', { kind: 'secondary', size: 'sm', aria: 'Adicionar ' + it.nome, onClick: (e) => { e.stopPropagation(); adicionar(it, e.currentTarget); } }),
      })) : [empty({ ic: 'store', title: texto || pos ? 'Nenhuma loja encontrada na comunidade' : 'Ainda não há lojas na comunidade',
        action: btn('Cadastrar loja', { kind: 'secondary', icon: 'plus', onClick: async () => { await s.close(); lojaForm(null, depois); } }) })]));
    } catch (e) { if (n === seq) lista.replaceChildren(errorState(e.message, carregar)); }
  }
  drawChips();
  const s = openSheet({ title: 'Lojas da comunidade', size: 'tall', content: [h('p', { class: 'sheet-note' }, 'Lojas que outras pessoas já cadastraram pelo CNPJ. Ao adicionar, o endereço e a localização vêm junto.'), busca, chips, conta, lista] });
  carregar();
}

export function denunciar(alvo_tipo, alvo_id) {
  const MOT = ['Preço errado ou impossível', 'Produto diferente', 'Conteúdo ofensivo', 'Propaganda ou spam', 'Outro motivo'];
  let motivo = null, extra = '';
  const err = formError(), rid = uuid();
  const b = btn('Enviar denúncia', { kind: 'danger', size: 'lg', full: true });
  const opts = h('div', { class: 'chip-row' });
  const draw = () => opts.replaceChildren(...MOT.map((m) => chip(m, { selected: motivo === m, onClick: () => { motivo = m; draw(); } })));
  draw();
  b.onclick = async () => {
    if (!motivo) { err.show('Escolha um motivo.'); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { const r = await call('denuncias.criar', { alvo_tipo, alvo_id, motivo: motivo + (extra ? ': ' + extra : '') }, { rid }); await s.close(); toast(r.conteudo_escondido ? 'Obrigado. O conteúdo foi escondido até a revisão.' : 'Obrigado. Vamos revisar.', { tone: 'success' }); emit('dados'); }
    catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: 'Denunciar', footer: b, content: [err, opts, textField('Detalhes', { placeholder: 'Opcional', multiline: true, rows: 3, onInput: (v) => { extra = v.trim(); } })] });
}
