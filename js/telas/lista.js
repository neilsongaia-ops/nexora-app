// Lista de compras: itens, quantidade, estimativa por loja (preços opcionais e sugestão de pacote), adicionar por busca/código, comparar, ir às compras
// A busca da barra "Adicionar item" usa o índice local de produtos (js/indice.js); sem índice, cai em produtos.listar.
import { h, money, uuid, emit, debounce, num, embalagem, haptic } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast, undoable } from '../ui/toast.js';
import { swipeable } from '../ui/gestures.js';
import { row, thumb, badge, empty, errorState, skelRows, btn, iconBtn, stepper, pickField, formError, sectionHead, chip } from '../ui/components.js';
import { lerProduto, lojaForm, pacoteTxt, buscarProduto, talvezUnir } from './compras.js';
import { recursoItems } from './lancForm.js';
import { garantir, indicePronto, buscarLocal, onIndice } from '../indice.js';

const isPeso = (u) => u === 'KG' || u === 'L';
const fmtQ = (q, u) => (isPeso(u) ? num(q, 3) + ' ' + u.toLowerCase() : num(q, 2) + '×');
const qTxt = (q, u) => (isPeso(u) ? fmtQ(q, u) : num(q, 2));

export default async function lista(ctx, id) {
  const { view, setTitle, go } = ctx;
  let loja_id = ctx.query.get('loja') || null, d, lojas = [], aberta, novo = null;
  const dispensadas = new Set();
  const ed = can('editor');
  const head = h('div', { class: 'est-bar' });
  const listEl = h('div', { class: 'list' }, skelRows(6));
  const doneEl = h('div', {});
  const cta = h('div', { class: 'cta-row' });
  const addBar = ed ? addItemBar() : null;
  view.append(head, cta, listEl, doneEl, addBar);
  setTitle('Lista', { back: '/compras' });

  // Se a tela foi trocada (ex.: cadastro de produto recarregou tudo), recarrega a tela nova
  const refresh = () => (ctx.alive() ? reload() : emit('dados'));
  async function reload() {
    try {
      if (aberta === undefined) {
        const a = await load('sessoes.listar', { lista_id: id, status: 'ABERTA' }).catch(() => []);
        aberta = a[0] || null;
        if (!loja_id && aberta && aberta.loja) loja_id = aberta.loja.id;
      }
      [d, lojas] = await Promise.all([call('listas.detalhe', { id, loja_id: loja_id || undefined }), load('lojas.listar', {})]);
      if (ctx.alive()) draw();
    } catch (e) { listEl.replaceChildren(errorState(e.message, reload)); }
  }
  const sugDe = (i) => (!i.comprado && i.sugestao_pacote && !dispensadas.has(i.id + ':' + i.sugestao_pacote.produto_id) ? i.sugestao_pacote : null);
  function draw() {
    setTitle(d.nome, { back: '/compras', actions: [iconBtn('dots', 'Opções da lista', () => openMenu({ title: d.nome, items: [
      { icon: 'route', label: 'Comparar lojas', onClick: () => go('/compras/comparar/' + id) },
      ed && { icon: 'ban', label: 'Arquivar lista', tone: 'out', onClick: arquivar },
    ] }))] });
    const loja = lojas.find((l) => l.id === loja_id);
    const pend = d.itens.filter((i) => !i.comprado), feitos = d.itens.filter((i) => i.comprado);
    const eco = pend.reduce((t, i) => t + (sugDe(i) ? sugDe(i).economia : 0), 0);
    head.replaceChildren(h('div', { class: 'est-total' }, h('span', { class: 'tile-k' }, loja ? 'Estimado em ' + loja.nome : 'Estimado pelo último preço'), h('span', { class: 'num' }, money(d.total_estimado)),
      d.itens_sem_preco ? h('span', { class: 'set-row-sub' }, `${d.itens_sem_preco} ${d.itens_sem_preco > 1 ? 'itens' : 'item'} sem preço`) : null),
      chip(loja ? loja.nome : 'Escolher loja', { ic: 'store', onClick: async () => { const v = await pick({ title: 'Estimar em', value: loja_id, items: [{ value: null, label: 'Último preço pago', icon: 'history' }, ...lojas.map((l) => ({ value: l.id, label: l.nome, icon: 'store' }))] }); if (v !== undefined) { loja_id = v; reload(); } } }),
      d.economia_pacotes > 0 && eco > 0.004 ? h('button', { class: 'eco-line', type: 'button', onclick: irPacote }, icon('down'), h('span', { class: 'num' }, 'Pacotes podem economizar ' + money(eco)), icon('chevD')) : null);
    cta.replaceChildren(btn('Comparar lojas', { kind: 'secondary', icon: 'route', onClick: () => go('/compras/comparar/' + id), disabled: !pend.length }),
      ed ? btn(aberta ? 'Voltar à compra' : 'Ir às compras', { icon: 'cart', onClick: iniciar, disabled: !pend.length && !aberta }) : null);
    cta.hidden = !d.itens.length;
    listEl.replaceChildren(...(pend.length ? pend.flatMap(itemRow) : [empty({ ic: 'bag', title: d.itens.length ? 'Tudo comprado' : 'Lista vazia' })]));
    doneEl.replaceChildren(...(feitos.length ? [sectionHead('Comprados'), h('div', { class: 'list' }, feitos.flatMap(itemRow))] : []));
    const nw = novo && view.querySelector('.is-new');
    novo = null;
    if (nw) {
      const b = nw.getBoundingClientRect();
      if (b.top < 72 || b.bottom > innerHeight - 160) window.scrollTo({ top: Math.max(0, scrollY + b.top - innerHeight / 2), behavior: 'smooth' });
    }
  }
  function irPacote() {
    const el = listEl.querySelector('.pack-sug');
    if (!el) return;
    window.scrollTo({ top: Math.max(0, scrollY + el.getBoundingClientRect().top - innerHeight / 3), behavior: 'smooth' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  }
  function itemRow(i) {
    const p = i.produto_id && (store.produtos.get(i.produto_id) || { id: i.produto_id, nome: i.descricao, tem_imagem: i.tem_imagem });
    const peso = isPeso(i.unidade);
    const salvarQ = debounce((v) => call('listas.item.atualizar', { id: i.id, quantidade: v }, { rid: uuid() }).then(refresh).catch((e) => toast(e.message, { tone: 'danger' })), 600);
    const qty = ed && !i.comprado ? stepper({ value: i.quantidade, min: peso ? 0.1 : 1, max: 999, step: peso ? 0.25 : 1, small: true, label: 'Quantidade de ' + i.descricao, format: (v) => fmtQ(v, i.unidade),
      onChange: (v) => { i.quantidade = v; salvarQ(v); } }) : null;
    const preco = i.preco_estimado != null ? money(i.preco_estimado) + (i.preco_fonte === 'COMPARTILHADO' ? ' · preço da comunidade' : '') : i.comprado ? fmtQ(i.quantidade, i.unidade) : 'sem preço';
    const badges = [!i.produto_id && !i.comprado ? badge('Sem produto', 'neutral') : null, i.opcao && !i.comprado ? badge(i.opcao.rotulo, 'xfer', 'tag') : null].filter(Boolean);
    const r = row({
      cls: (i.comprado ? 'is-dead' : '') + (novo === i.id ? ' is-new' : ''), lead: p ? thumb(p) : h('span', { class: 'thumb' }, h('span', { class: 'thumb-ph' }, icon('tag'))),
      title: i.descricao,
      sub: [pacoteTxt(i), preco].filter(Boolean).join(' · '),
      badges: badges.length ? badges : null,
      trail: qty || (i.comprado ? null : h('span', { class: 'num muted' }, fmtQ(i.quantidade, i.unidade))),
      onClick: ed ? () => openMenu({ title: i.descricao, items: [
        { icon: i.comprado ? 'undo' : 'check', label: i.comprado ? 'Voltar para a lista' : 'Marcar como comprado', onClick: () => set(i, { comprado: !i.comprado }) },
        !i.produto_id && { icon: 'tag', label: 'Ligar a um produto', onClick: () => ligar(i) },
        i.produto_id && { icon: 'tag', label: 'Ver produto', onClick: () => go('/compras/produto/' + i.produto_id) },
        { icon: 'x', label: 'Remover da lista', tone: 'out', onClick: () => remover(i) },
      ] }) : i.produto_id ? () => go('/compras/produto/' + i.produto_id) : null,
    });
    if (i.dica && !i.comprado) r.querySelector('.row-main').append(h('span', { class: 'row-hint num' }, `${money(i.dica.preco)} levando ${num(i.dica.qtd_min, 3)}`));
    const out = [ed ? swipeable(r, { right: { label: i.comprado ? 'Voltar' : 'Comprado', icon: i.comprado ? 'undo' : 'check', tone: 'in', run: () => set(i, { comprado: !i.comprado }) }, left: { label: 'Remover', icon: 'x', tone: 'out', run: () => remover(i) } }) : r];
    const sp = sugDe(i);
    if (sp) {
      const key = i.id + ':' + sp.produto_id;
      out.push(h('div', { class: 'pack-sug', role: 'group', 'aria-label': 'Sugestão de pacote para ' + i.descricao }, icon('bag'),
        h('div', { class: 'pack-txt' },
          h('span', { class: 'pack-t num' }, sp.qtd_pacotes > 1 ? `${sp.qtd_pacotes} pacotes com ${sp.contem_qtd} saem ${money(sp.preco_pacote * sp.qtd_pacotes)}` : `Pacote com ${sp.contem_qtd} sai ${money(sp.preco_pacote)}`),
          h('span', { class: 'pack-s num' }, 'economiza ' + money(sp.economia) + (sp.resto ? ` · mais ${qTxt(sp.resto, i.unidade)} avulsa${sp.resto > 1 ? 's' : ''}` : ''))),
        ed ? h('div', { class: 'pack-acts' },
          btn('Dispensar', { kind: 'ghost', size: 'sm', onClick: () => { dispensadas.add(key); draw(); } }),
          btn('Trocar', { kind: 'secondary', size: 'sm', onClick: (e) => trocar(i, sp, e.currentTarget) })) : null));
    }
    return out;
  }
  async function trocar(i, sp, b) {
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      const r = await call('listas.item.usar_pacote', { id: i.id, pacote_id: sp.produto_id }, { rid: uuid() });
      haptic(12);
      novo = r.item ? r.item.id : null;
      toast(`Trocado: ${sp.qtd_pacotes} ${sp.qtd_pacotes > 1 ? 'pacotes' : 'pacote'}${r.resto ? ' + ' + qTxt(r.resto, i.unidade) + ' avulsa' + (r.resto > 1 ? 's' : '') : ''}.`, { tone: 'success', duration: 2400 });
      refresh();
    } catch (e) { toast(e.message, { tone: 'danger' }); b.disabled = false; b.removeAttribute('aria-busy'); }
  }
  async function ligar(i) {
    const p = await buscarProduto({ title: 'Ligar “' + i.descricao + '” a', texto: i.descricao });
    if (!p) return;
    try {
      const r = await call('listas.item.vincular', { id: i.id, produto_id: p.id }, { rid: uuid() });
      novo = r.id;
      toast(r.unido ? `Unido a ${r.descricao}: agora ${qTxt(r.quantidade, p.unidade)}` : 'Ligado a ' + p.nome + '.', { tone: 'success', duration: 2400 });
      refresh();
    } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  async function set(i, p) { try { await call('listas.item.atualizar', { id: i.id, ...p }, { rid: uuid() }); Object.assign(i, p); draw(); refresh(); } catch (e) { toast(e.message, { tone: 'danger' }); } }   // recarrega: o total do topo depende do que falta comprar
  async function remover(i) {
    d.itens = d.itens.filter((x) => x !== i); draw();
    const r = await undoable(`“${i.descricao}” removido`, () => call('listas.item.atualizar', { id: i.id, remover: true }, { rid: uuid() }), { delay: 4000 });
    if (!r) refresh();
  }
  async function arquivar() {
    if (!(await confirmSheet({ title: 'Arquivar “' + d.nome + '”?', content: aberta ? h('p', { class: 'muted' }, 'A compra em andamento desta lista será encerrada.') : null, confirm: 'Arquivar', tone: 'danger' }))) return;
    try { await call('listas.arquivar', { id }, { rid: uuid() }); toast('Lista arquivada.', { tone: 'success' }); go('/compras'); } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  // Barra "Adicionar item": nunca age sobre texto velho. A linha "Adicionar" e o Enter leem a caixa NO MOMENTO do toque;
  // produtos de um texto anterior ficam esmaecidos e sem clique até chegar a resposta do texto atual.
  function addItemBar() {
    garantir();
    const input = h('input', { type: 'search', placeholder: 'Adicionar item', 'aria-label': 'Adicionar item', enterkeyhint: 'done', autocomplete: 'off', 'aria-expanded': 'false' });
    const atual = () => input.value.trim();
    const busy = h('span', { class: 'sug-busy', hidden: true, 'aria-hidden': 'true' });
    const status = h('span', { class: 'sug-status', 'aria-live': 'polite' });
    const head = h('div', { class: 'sug-head' }, h('span', { class: 'sug-label' }, 'Produtos encontrados'), status);
    const prods = h('div', { class: 'sug-list', role: 'group', 'aria-label': 'Produtos encontrados' });
    const act = row({ cls: 'sug-act', lead: h('span', { class: 'tipo-ico sug-act-ico' }, icon('plus')), title: '', sub: 'Item sem produto: sem preço e sem comparação', onClick: () => addTexto() });
    const actT = act.querySelector('.row-title');
    const panel = h('div', { class: 'sug-panel', role: 'region', 'aria-label': 'Sugestões para adicionar', hidden: true }, busy, head, prods, act);
    let seq = 0, mostrado = null, local = false;   // mostrado: texto a que pertencem os produtos exibidos
    const abrir = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const fechar = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const setBusy = (v) => { busy.hidden = !v; status.textContent = v ? 'Buscando…' : ''; };
    const velho = (v) => { prods.classList.toggle('is-stale', v); prods.inert = v; prods.setAttribute('aria-busy', String(v)); };
    const mostrar = (t, itens) => {
      mostrado = t; velho(false); setBusy(false);
      prods.replaceChildren(...itens.map(sugRow));
      head.hidden = prods.hidden = !itens.length;
    };
    const add = async (p, q = 1) => {
      seq++; input.value = ''; mostrado = null; fechar(); input.focus({ preventScroll: true });
      try {
        const r = await call('listas.item.adicionar', p.id ? { lista_id: id, produto_id: p.id, quantidade: q } : { lista_id: id, descricao: p.descricao, quantidade: q }, { rid: uuid() });
        haptic(10);
        novo = r.id;
        if (r.ja_existia) toast('Já estava na lista: agora são ' + qTxt(r.quantidade, p.unidade || r.unidade), { tone: 'success', duration: 1800 });
        else if (p.id) toast('Adicionado: ' + p.nome, { tone: 'success', duration: 1800 });
        else toast('Adicionado: ' + p.descricao, { tone: 'success', duration: 4000, action: { label: 'Ligar a um produto', onClick: () => ligar({ id: r.id, descricao: p.descricao }) } });
        await refresh();
        if (p.id && r.parecidos && r.parecidos.length) { if (await talvezUnir(r.parecidos, p)) refresh(); input.focus({ preventScroll: true }); }
      } catch (e) { toast(e.message, { tone: 'danger' }); }
    };
    // Lê a caixa agora, nunca o texto de quando a linha foi desenhada
    const addTexto = () => { const t = atual(); if (t) add({ descricao: t }); else fechar(); };
    const sugRow = (p) => {
      let q = 1;
      const peso = isPeso(p.unidade);
      const st = stepper({ value: 1, min: peso ? 0.25 : 1, max: 999, step: peso ? 0.25 : 1, small: true, label: 'Quantidade de ' + p.nome, format: (v) => fmtQ(v, p.unidade), onChange: (v) => { q = v; } });
      return row({ cls: 'sug-row', lead: thumb(p), title: p.nome, sub: [p.marca, pacoteTxt(p) || embalagem(p)].filter(Boolean).join(' · ') || null,
        trail: st, trailSub: p.ultimo_preco ? money(p.ultimo_preco) : null, onClick: () => add(p, q) });
    };
    // Sem índice ainda (primeira abertura): busca no servidor, descartando respostas de textos anteriores
    const rede = debounce(async (t) => {
      if (indicePronto()) return;
      const my = ++seq;
      try {
        const r = await load('produtos.listar', { texto: t, limite: 8 });
        if (my !== seq || t !== atual()) return;
        r.itens.forEach((p) => store.produtos.set(p.id, p));
        mostrar(t, r.itens.slice(0, 8));
      } catch { if (my === seq && t === atual()) mostrar(t, []); }
    }, 250);
    const sugerir = () => {
      const t = atual();
      if (!t) { seq++; mostrado = null; fechar(); return; }
      actT.textContent = 'Adicionar “' + t + '”';
      act.setAttribute('aria-label', 'Adicionar “' + t + '” como item sem produto');
      abrir();
      local = indicePronto();
      if (local) { seq++; mostrar(t, buscarLocal(t, { limite: 8 }).itens); return; }
      if (mostrado !== t) { velho(true); setBusy(true); head.hidden = false; }
      rede(t);
    };
    input.addEventListener('input', sugerir);
    input.addEventListener('focus', () => { if (atual() && panel.hidden) sugerir(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const t = atual();
        if (!t) return;
        // Só usa o primeiro produto se ele pertence ao texto que está na caixa agora
        const first = !panel.hidden && mostrado === t && !prods.inert ? prods.querySelector('.row') : null;
        if (first) first.click(); else addTexto();
      }
      if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); e.stopPropagation(); fechar(); }
    });
    const dock = h('div', { class: 'add-dock' }, panel, h('div', { class: 'add-bar' }, h('label', { class: 'search' }, icon('plus'), input), iconBtn('barcode', 'Ler código de barras', () => lerProduto(ctx, { onProduct: (p) => add(p) }))));
    const fora = (e) => { if (!panel.hidden && !dock.contains(e.target)) fechar(); };
    document.addEventListener('pointerdown', fora, true);
    const off = onIndice(() => { if (!local && !panel.hidden) sugerir(); });   // o índice chegou: passa a buscar no aparelho
    if (ctx.onCleanup) ctx.onCleanup(() => { document.removeEventListener('pointerdown', fora, true); off(); });
    return dock;
  }
  async function iniciar() {
    if (aberta) { go('/compras/sessao/' + aberta.id); return; }
    const abertas = await load('sessoes.listar', { lista_id: id, status: 'ABERTA' }).catch(() => []);
    if (abertas.length) { go('/compras/sessao/' + abertas[0].id); return; }
    const err = formError(), rid = uuid();
    let lj = loja_id, rec = null, lf;
    const b = btn('Começar', { size: 'lg', full: true, icon: 'cart' });
    b.onclick = async () => {
      if (!lj) { err.show('Escolha a loja.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { const se = await call('sessoes.iniciar', { lista_id: id, loja_id: lj, recurso_id: rec || undefined }, { rid }); await s.close(); go('/compras/sessao/' + se.id); }
      catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const s = openSheet({ title: 'Ir às compras', footer: b, content: [err,
      (lf = pickField('Loja', { value: lj, items: () => lojas.map((l) => ({ value: l.id, label: l.nome, icon: 'store', sub: l.cidade || null })), placeholder: 'Escolher loja', onChange: (v) => { lj = v; },
        action: can('editor') ? { label: 'Nova loja', icon: 'plus', onClick: () => lojaForm(null, (r) => { lojas.push(r); lj = r.id; lf.set(r.id); }) } : null })),
      pickField('Pagar com', { value: rec, items: () => recursoItems(), placeholder: 'Decidir no final', onChange: (v) => { rec = v; } })] });
  }
  reload();
}
