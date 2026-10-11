// Compras: listas, produtos e lojas (hub) + roteamento para lista, sessão, comparação e produto
import { h, money, relDate, uuid, emit, dmy, initials, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { infinite } from '../ui/gestures.js';
import { scanCode, geolocate } from '../ui/media.js';
import { escolherNoMapa, coordTxt } from '../ui/mapa.js';
import { segmented, card, row, badge, empty, errorState, skelRows, skelCards, btn, iconBtn, searchBox, thumb, textField, pickField, formError, chip, sectionHead } from '../ui/components.js';
import { categoriaItems } from './lancForm.js';

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
  body.append(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search), btn('', { kind: 'secondary', icon: 'barcode', aria: 'Ler código de barras', onClick: () => lerProduto(ctx) })), list);
  let inf;
  const reload = () => {
    inf && inf.stop(); list.replaceChildren();
    inf = infinite({ container: list, skeleton: () => skelRows(4), limite: 40,
      load: (offset, limite) => call('produtos.listar', { texto: texto || undefined, offset, limite }),
      render: (its) => its.forEach((p) => { store.produtos.set(p.id, p); list.append(prodRow(p, () => ctx.go('/compras/produto/' + p.id))); }),
      onEmpty: () => list.replaceChildren(empty({ ic: 'tag', title: texto ? 'Nenhum produto encontrado' : 'Nenhum produto ainda', action: can('editor') ? btn(texto ? 'Cadastrar “' + texto + '”' : 'Cadastrar produto', { kind: 'secondary', icon: 'plus', onClick: () => produtoForm({ initial: { nome: texto }, onSaved: (p) => ctx.go('/compras/produto/' + p.id) }) }) : null })),
      onError: (e, retry) => list.append(errorState(e.message, retry)) });
  };
  ctx.onCleanup(() => inf && inf.stop());
  reload();
}
export function prodRow(p, onClick, trail) {
  return row({ lead: thumb(p), title: p.nome, sub: [p.marca, embalagem(p), p.gtin ? null : 'sem código'].filter(Boolean).join(' · '),
    trail: trail !== undefined ? trail : p.ultimo_preco ? h('span', { class: 'num' }, money(p.ultimo_preco)) : null, trailSub: p.ultimo_preco_data ? relDate(p.ultimo_preco_data) : null, onClick });
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
export function produtoForm({ edit, initial = {}, fromCatalog, onSaved } = {}) {
  const st = { nome: '', marca: '', gtin: '', unidade: 'UN', tam_embalagem: '', categoria_id: null, ...(edit || initial) };
  const err = formError(), rid = uuid();
  const fn = textField('Nome', { value: st.nome, autofocus: !st.nome, onInput: (v) => { st.nome = v; fn.setError(''); } });
  const b = btn(edit ? 'Salvar' : 'Cadastrar produto', { size: 'lg', full: true });
  b.onclick = async () => {
    if (!st.nome.trim()) { fn.setError('Dê um nome'); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      const p = { nome: st.nome.trim(), marca: st.marca || undefined, unidade: st.unidade, tam_embalagem: st.tam_embalagem === '' || st.tam_embalagem == null ? undefined : st.tam_embalagem, categoria_id: st.categoria_id || undefined };
      if (edit) Object.assign(p, { id: edit.id, versao: edit.versao }); else if (st.gtin) p.gtin = st.gtin;
      const r = await call('produtos.salvar', p, { rid });
      store.produtos.set(r.id, r);
      await s.close(); toast(edit ? 'Produto atualizado.' : 'Produto cadastrado.', { tone: 'success' }); emit('dados'); onSaved && onSaved(r);
    } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar produto' : 'Novo produto', size: 'full', footer: b, content: [
    fromCatalog ? h('div', { class: 'warn-item' }, icon('verified'), h('span', {}, 'Encontrado no catálogo colaborativo. Confira e salve.')) : null,
    err, fn,
    h('div', { class: 'grid-2' }, textField('Marca', { value: st.marca || '', onInput: (v) => { st.marca = v; } }), textField('Tamanho da embalagem', { value: st.tam_embalagem ? String(st.tam_embalagem).replace('.', ',') : '', placeholder: 'Ex.: 500', inputmode: 'decimal', tipText: 'Só o número, na unidade escolhida ao lado (ex.: 500 com Grama = 500 g). Deixe em branco se o produto é vendido por unidade.', onInput: (v) => { st.tam_embalagem = v.replace(/[^\d.,]/g, ''); } })),
    h('div', { class: 'grid-2' }, pickField('Unidade', { value: st.unidade, items: UNID, onChange: (v) => { st.unidade = v; } }), pickField('Categoria', { value: st.categoria_id, items: () => categoriaItems('DESPESA'), placeholder: 'Opcional', onChange: (v) => { st.categoria_id = v; } })),
    edit && edit.gtin ? h('div', { class: 'form-readonly' }, h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Código de barras'), h('span', { class: 'kv-v num' }, edit.gtin))) :
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Código de barras'), h('div', { class: 'scan-manual' }, h('input', { class: 'input num', inputmode: 'numeric', value: st.gtin || '', placeholder: 'Opcional', 'aria-label': 'Código de barras', oninput: (e) => { st.gtin = e.target.value.replace(/\D/g, ''); } }),
        btn('', { kind: 'secondary', icon: 'barcode', aria: 'Ler código', onClick: async () => { const c = await scanCode(); if (c) { st.gtin = c; s.el.querySelector('input[aria-label="Código de barras"]').value = c; } } }))),
  ] });
}

async function lojas(ctx, body) {
  if (can('editor')) ctx.setFab({ label: 'Nova loja', icon: 'plus', onClick: () => lojaForm() });
  let modo = 'todas', pos = null, casa = null;
  const tools = h('div', { class: 'chip-row' });
  const list = h('div', { class: 'list' }, skelRows(4));
  body.append(tools, list);
  load('deslocamento.ler', {}).then((d) => { casa = (d.enderecos || []).find((e) => e.padrao && e.status !== 'INATIVO') || null; if (casa) drawTools(); }).catch(() => {});
  const drawTools = () => tools.replaceChildren(chip('Todas', { selected: modo === 'todas', onClick: () => { modo = 'todas'; draw(); } }), casa ? chip('Perto de ' + casa.nome, { selected: modo === 'casa', ic: 'home', onClick: () => { modo = 'casa'; draw(); } }) : '', chip('Perto de mim', { selected: modo === 'perto', ic: 'pin', onClick: async () => { try { pos ||= await geolocate(); modo = 'perto'; draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } } }));
  const draw = async () => {
    drawTools(); list.replaceChildren(skelRows(4));
    try {
      const ref = modo === 'casa' && casa ? casa : modo === 'perto' ? pos : null;
      const ls = ref ? await call('lojas.proximas', { latitude: ref.latitude, longitude: ref.longitude, raio_km: 15 }) : await load('lojas.listar', {});
      if (!ls.length) { list.replaceChildren(empty({ ic: 'store', title: ref ? 'Nenhuma loja por perto' : 'Nenhuma loja cadastrada' })); return; }
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
export function lojaForm(edit, after) {
  const st = { nome: '', cnpj: '', cidade: '', uf: '', latitude: null, longitude: null, ...(edit || {}) };
  const err = formError(), rid = uuid();
  const fn = textField('Nome', { value: st.nome, autofocus: true, onInput: (v) => { st.nome = v; fn.setError(''); } });
  const geoTxt = h('span', { class: 'set-row-sub num' });
  const drawGeo = () => { geoTxt.textContent = st.latitude != null ? coordTxt(st.latitude, st.longitude) : 'Sem localização'; };
  drawGeo();
  const b = btn(edit ? 'Salvar' : 'Cadastrar loja', { size: 'lg', full: true });
  b.onclick = async () => {
    if (!st.nome.trim()) { fn.setError('Dê um nome'); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try { const r = await call('lojas.salvar', { ...(edit ? { id: edit.id } : {}), nome: st.nome.trim(), cnpj: st.cnpj || undefined, cidade: st.cidade || undefined, uf: st.uf || undefined, latitude: st.latitude ?? undefined, longitude: st.longitude ?? undefined }, { rid }); await s.close(); toast('Loja salva.', { tone: 'success' }); emit('dados'); after && after(r); }
    catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar loja' : 'Nova loja', footer: b, content: [err, fn,
    textField('CNPJ', { value: st.cnpj || '', inputmode: 'numeric', placeholder: 'Opcional', onInput: (v) => { st.cnpj = v.replace(/\D/g, ''); } }),
    h('div', { class: 'grid-2' }, textField('Cidade', { value: st.cidade || '', onInput: (v) => { st.cidade = v; } }), textField('UF', { value: st.uf || '', maxlength: 2, onInput: (v) => { st.uf = v.toUpperCase(); } })),
    h('div', { class: 'set-row' }, h('div', { class: 'set-row-k' }, h('span', { class: 'field-label' }, 'Localização'), geoTxt),
      h('div', { class: 'btn-inline' },
        btn('Onde estou', { kind: 'secondary', icon: 'locate', size: 'sm', onClick: async (e) => { const bb = e.currentTarget; bb.disabled = true; try { Object.assign(st, await geolocate()); drawGeo(); } catch (x) { toast(x.message, { tone: 'danger' }); } finally { bb.disabled = false; } } }),
        btn('No mapa', { kind: 'secondary', icon: 'map', size: 'sm', onClick: async () => { const r = await escolherNoMapa({ latitude: st.latitude, longitude: st.longitude, busca: [st.nome, st.cidade].filter(Boolean).join(', ') }); if (r) { st.latitude = r.latitude; st.longitude = r.longitude; drawGeo(); } } })))] });
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
