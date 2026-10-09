// Lista de compras: itens, quantidade, estimativa por loja, adicionar por busca/código, comparar, ir às compras
import { h, money, uuid, emit, debounce, num, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast, undoable } from '../ui/toast.js';
import { swipeable } from '../ui/gestures.js';
import { row, thumb, badge, empty, errorState, skelRows, btn, iconBtn, stepper, pickField, formError, sectionHead, chip } from '../ui/components.js';
import { lerProduto } from './compras.js';
import { recursoItems } from './lancForm.js';

const fmtQ = (q, u) => (u === 'KG' || u === 'L' ? num(q, 3) + ' ' + u.toLowerCase() : num(q, 2) + '×');

export default async function lista(ctx, id) {
  const { view, setTitle, go } = ctx;
  let loja_id = ctx.query.get('loja') || null, d, lojas = [];
  const ed = can('editor');
  const head = h('div', { class: 'est-bar' });
  const listEl = h('div', { class: 'list' }, skelRows(6));
  const doneEl = h('div', {});
  const cta = h('div', { class: 'cta-row' });
  const addBar = ed ? addItemBar() : null;
  view.append(head, cta, listEl, doneEl, addBar);
  setTitle('Lista', { back: '/compras' });

  async function reload() {
    try {
      [d, lojas] = await Promise.all([call('listas.detalhe', { id, loja_id: loja_id || undefined }), load('lojas.listar', {})]);
      draw();
    } catch (e) { listEl.replaceChildren(errorState(e.message, reload)); }
  }
  function draw() {
    setTitle(d.nome, { back: '/compras', actions: [iconBtn('dots', 'Opções da lista', () => openMenu({ title: d.nome, items: [
      { icon: 'route', label: 'Comparar lojas', onClick: () => go('/compras/comparar/' + id) },
      ed && { icon: 'ban', label: 'Arquivar lista', tone: 'out', onClick: arquivar },
    ] }))] });
    const loja = lojas.find((l) => l.id === loja_id);
    head.replaceChildren(h('div', { class: 'est-total' }, h('span', { class: 'tile-k' }, loja ? 'Estimado em ' + loja.nome : 'Estimado pelo último preço'), h('span', { class: 'num' }, money(d.total_estimado)),
      d.itens_sem_preco ? h('span', { class: 'set-row-sub' }, `${d.itens_sem_preco} ${d.itens_sem_preco > 1 ? 'itens' : 'item'} sem preço`) : null),
      chip(loja ? loja.nome : 'Escolher loja', { ic: 'store', onClick: async () => { const v = await pick({ title: 'Estimar em', value: loja_id, items: [{ value: null, label: 'Último preço pago', icon: 'history' }, ...lojas.map((l) => ({ value: l.id, label: l.nome, icon: 'store' }))] }); if (v !== undefined) { loja_id = v; reload(); } } }));
    const pend = d.itens.filter((i) => !i.comprado), feitos = d.itens.filter((i) => i.comprado);
    cta.replaceChildren(btn('Comparar lojas', { kind: 'secondary', icon: 'route', onClick: () => go('/compras/comparar/' + id), disabled: !pend.length }), ed ? btn('Ir às compras', { icon: 'cart', onClick: iniciar, disabled: !pend.length }) : null);
    cta.hidden = !d.itens.length;
    listEl.replaceChildren(...(pend.length ? pend.map(itemRow) : [empty({ ic: 'bag', title: d.itens.length ? 'Tudo comprado' : 'Lista vazia' })]));
    doneEl.replaceChildren(...(feitos.length ? [sectionHead('Comprados'), h('div', { class: 'list' }, feitos.map(itemRow))] : []));
  }
  function itemRow(i) {
    const p = i.produto_id && (store.produtos.get(i.produto_id) || { id: i.produto_id, nome: i.descricao, tem_imagem: i.tem_imagem });
    const qty = ed && !i.comprado ? stepper({ value: i.quantidade, min: i.unidade === 'KG' || i.unidade === 'L' ? 0.1 : 1, max: 999, step: i.unidade === 'KG' || i.unidade === 'L' ? 0.25 : 1, small: true, label: 'Quantidade de ' + i.descricao, format: (v) => fmtQ(v, i.unidade),
      onChange: debounce((v) => call('listas.item.atualizar', { id: i.id, quantidade: v }, { rid: uuid() }).then(() => { i.quantidade = v; }).catch((e) => toast(e.message, { tone: 'danger' })), 500) }) : null;
    const r = row({
      cls: i.comprado ? 'is-dead' : '', lead: p ? thumb(p) : h('span', { class: 'thumb' }, h('span', { class: 'thumb-ph' }, icon('tag'))),
      title: i.descricao,
      sub: i.preco_estimado != null ? `${money(i.preco_estimado)}${i.preco_fonte === 'COMPARTILHADO' ? ' · preço da comunidade' : ''}` : i.comprado ? fmtQ(i.quantidade, i.unidade) : 'sem preço',
      badges: !i.produto_id && !i.comprado ? [badge('Sem produto', 'neutral')] : null,
      trail: qty || (i.comprado ? null : h('span', { class: 'num muted' }, fmtQ(i.quantidade, i.unidade))),
      onClick: ed ? () => openMenu({ title: i.descricao, items: [
        { icon: i.comprado ? 'undo' : 'check', label: i.comprado ? 'Voltar para a lista' : 'Marcar como comprado', onClick: () => set(i, { comprado: !i.comprado }) },
        i.produto_id && { icon: 'tag', label: 'Ver produto', onClick: () => go('/compras/produto/' + i.produto_id) },
        { icon: 'x', label: 'Remover da lista', tone: 'out', onClick: () => remover(i) },
      ] }) : i.produto_id ? () => go('/compras/produto/' + i.produto_id) : null,
    });
    if (!ed) return r;
    return swipeable(r, { right: { label: i.comprado ? 'Voltar' : 'Comprado', icon: i.comprado ? 'undo' : 'check', tone: 'in', run: () => set(i, { comprado: !i.comprado }) }, left: { label: 'Remover', icon: 'x', tone: 'out', run: () => remover(i) } });
  }
  async function set(i, p) { try { await call('listas.item.atualizar', { id: i.id, ...p }, { rid: uuid() }); Object.assign(i, p); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } }
  async function remover(i) {
    d.itens = d.itens.filter((x) => x !== i); draw();
    const r = await undoable(`“${i.descricao}” removido`, () => call('listas.item.atualizar', { id: i.id, remover: true }, { rid: uuid() }), { delay: 4000 });
    if (!r) reload();
  }
  async function arquivar() {
    if (!(await confirmSheet({ title: 'Arquivar “' + d.nome + '”?', confirm: 'Arquivar', tone: 'danger' }))) return;
    try { await call('listas.arquivar', { id }, { rid: uuid() }); toast('Lista arquivada.', { tone: 'success' }); go('/compras'); } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  function addItemBar() {
    const input = h('input', { type: 'search', placeholder: 'Adicionar item', 'aria-label': 'Adicionar item', enterkeyhint: 'done', autocomplete: 'off' });
    const sug = h('div', { class: 'list suggest', hidden: true, role: 'listbox' });
    const add = async (p) => {
      input.value = ''; sug.hidden = true;
      try { await call('listas.item.adicionar', p.id ? { lista_id: id, produto_id: p.id, quantidade: 1 } : { lista_id: id, descricao: p.descricao, quantidade: 1 }, { rid: uuid() }); toast('Adicionado: ' + (p.nome || p.descricao), { tone: 'success', duration: 1800 }); reload(); }
      catch (e) { toast(e.message, { tone: 'danger' }); }
    };
    const find = debounce(async (t) => {
      if (!t) { sug.hidden = true; return; }
      try {
        const r = await load('produtos.listar', { texto: t, limite: 6 });
        r.itens.forEach((p) => store.produtos.set(p.id, p));
        sug.replaceChildren(...r.itens.map((p) => row({ lead: thumb(p), title: p.nome, sub: [p.marca, embalagem(p)].filter(Boolean).join(' · '), onClick: () => add(p) })),
          row({ lead: h('span', { class: 'tipo-ico' }, icon('plus')), title: 'Adicionar “' + t + '”', sub: 'sem produto cadastrado', onClick: () => add({ descricao: t }) }));
        sug.hidden = false;
      } catch { sug.hidden = true; }
    }, 300);
    input.addEventListener('input', () => find(input.value.trim()));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { const first = sug.querySelector('.row'); if (first && !sug.hidden) first.click(); else add({ descricao: input.value.trim() }); } if (e.key === 'Escape') sug.hidden = true; });
    return h('div', {}, sug, h('div', { class: 'add-bar' }, h('label', { class: 'search' }, icon('plus'), input), iconBtn('barcode', 'Ler código de barras', () => lerProduto(ctx, { onProduct: add }))));
  }
  async function iniciar() {
    const abertas = await load('sessoes.listar', { lista_id: id, status: 'ABERTA' }).catch(() => []);
    if (abertas.length) { go('/compras/sessao/' + abertas[0].id); return; }
    const err = formError(), rid = uuid();
    let lj = loja_id, rec = null;
    const b = btn('Começar', { size: 'lg', full: true, icon: 'cart' });
    b.onclick = async () => {
      if (!lj) { err.show('Escolha a loja.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { const se = await call('sessoes.iniciar', { lista_id: id, loja_id: lj, recurso_id: rec || undefined }, { rid }); await s.close(); go('/compras/sessao/' + se.id); }
      catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const s = openSheet({ title: 'Ir às compras', footer: b, content: [err,
      pickField('Loja', { value: lj, items: lojas.map((l) => ({ value: l.id, label: l.nome, icon: 'store', sub: l.cidade || null })), placeholder: 'Escolher loja', onChange: (v) => { lj = v; } }),
      pickField('Pagar com', { value: rec, items: () => recursoItems(), placeholder: 'Decidir no final', onChange: (v) => { rec = v; } })] });
  }
  reload();
}
