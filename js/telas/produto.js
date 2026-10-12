// Produto: foto, dados, pacote (nos dois sentidos), evolução de preço, outros preços (opcionais), meu histórico, preços da comunidade, registrar preço, denunciar
import { h, money, dmy, relDate, uuid, emit, monthShort, HOJE, num, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { chooseImage, imageToThumb, capturePhoto } from '../ui/media.js';
import { card, row, badge, empty, errorState, skelRows, skelCards, sectionHead, btn, iconBtn, thumb, forgetImg, moneyField, pickField, dateField, formError, tip, textField, chip } from '../ui/components.js';
import { line } from '../ui/charts.js';
import { produtoForm, denunciar, lojaForm, addLista, pacoteTxt, unidadeTxt } from './compras.js';

export default async function produto(ctx, id) {
  const { view, setTitle, go } = ctx;
  setTitle('Produto', { back: '/compras/produtos' });
  let p = store.produtos.get(id);
  if (!p) {
    try { const r = await load('produtos.listar', { todos: true, limite: 200 }); r.itens.forEach((x) => store.produtos.set(x.id, x)); p = store.produtos.get(id); }
    catch (e) { view.append(errorState(e.message, ctx.refresh)); return; }
  }
  if (!p) { view.append(empty({ ic: 'tag', title: 'Produto não encontrado' })); return; }
  const ed = can('editor');
  setTitle(p.nome, { back: '/compras/produtos', actions: [iconBtn('dots', 'Opções', () => openMenu({ title: p.nome, items: [
    ed && { icon: 'edit', label: 'Editar', onClick: () => produtoForm({ edit: p, onSaved: () => ctx.refresh() }) },
    ed && { icon: 'tag', label: 'Registrar preço', onClick: () => registrar(p) },
    ed && { icon: 'bag', label: 'Adicionar a uma lista', onClick: () => addLista(p) },
    ed && { icon: 'ban', label: 'Inativar produto', tone: 'out', onClick: inativar },
    p.global_id && { icon: 'flag', label: 'Denunciar produto', tone: 'out', onClick: () => denunciar('produto', p.global_id) },
  ] }))] });
  async function inativar() {
    if (!(await confirmSheet({ title: `Inativar “${p.nome}”?`, content: 'Ele some das buscas e das listas novas. O histórico de preços e as compras já feitas continuam.', confirm: 'Inativar', tone: 'danger' }))) return;
    try { await call('produtos.salvar', { id, status: 'INATIVO', versao: p.versao }, { rid: uuid() }); store.produtos.delete(id); toast('Produto inativado.', { tone: 'success' }); emit('dados'); go('/compras/produtos'); } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  const photo = h('button', { class: 'photo-btn', type: 'button', 'aria-label': 'Foto do produto', onclick: () => fotoMenu() }, thumb(p, 'is-lg'));
  view.append(h('div', { class: 'prod-head' }, photo, h('div', { class: 'prod-head-txt' }, h('h2', { class: 'prod-name' }, p.nome),
    h('div', { class: 'prod-meta' }, [p.marca, pacoteTxt(p) || embalagem(p), unidadeTxt(p), p.unidade === 'KG' || p.unidade === 'L' ? 'vendido por ' + p.unidade.toLowerCase() : null].filter(Boolean).map((x) => h('span', {}, x)), p.categoria_id ? h('span', {}, catNome(p.categoria_id)) : null),
    p.gtin ? h('span', { class: 'prod-meta num' }, icon('barcode'), p.gtin) : badge('Sem código: só neste espaço', 'neutral'))));
  // Ligação do pacote nos dois sentidos
  const links = [
    p.contem_id ? row({ lead: h('span', { class: 'tipo-ico' }, icon('bag')), title: `Contém ${p.contem_qtd} × ${p.contem_nome || 'unidade'}`, sub: unidadeTxt(p) || null, trail: icon('chevR', 'muted'), onClick: () => go('/compras/produto/' + p.contem_id) }) : null,
    ...(p.pacotes || []).map((x) => row({ lead: h('span', { class: 'tipo-ico' }, icon('bag')), title: 'Também vendida em: pacote com ' + x.contem_qtd, sub: x.nome, trail: icon('chevR', 'muted'), onClick: () => go('/compras/produto/' + x.id) })),
  ].filter(Boolean);
  if (links.length) view.append(h('div', { class: 'list' }, links));
  const evo = card('sec-card', sectionHead('Evolução do preço'), skelCards(1));
  const opc = h('section', { class: 'sec' }, sectionHead('Outros preços'), skelRows(2));
  const comm = h('section', { class: 'sec' }, sectionHead('Preços da comunidade', tip('Preços de outras pessoas, sem identificar ninguém. Verificado = confirmado por nota ou por várias pessoas.')), skelRows(3));
  const mine = h('section', { class: 'sec' }, sectionHead('Meu histórico'), skelRows(3));
  view.append(h('div', { class: 'cols' }, h('div', { class: 'sec' }, evo, opc, mine), comm));
  if (ed) ctx.setFab({ label: 'Registrar preço', icon: 'tag', onClick: () => registrar(p) });

  load('precos.evolucao', { produto_id: id }).then((e) => {
    if (!e.pontos.length) { evo.replaceChildren(sectionHead('Evolução do preço'), empty({ ic: 'up', title: 'Ainda sem preços registrados' })); return; }
    const r = e.resumo, up = r.variacao_pct > 0;
    evo.replaceChildren(sectionHead('Evolução do preço', badge((up ? '+' : '') + num(r.variacao_pct, 1) + '%', up ? 'out' : 'in', up ? 'up' : 'down')),
      line(e.pontos.map((x) => ({ y: x.preco, label: dmy(x.data), sub: x.loja }))),
      h('div', { class: 'stats' }, [['Mínimo', r.minimo], ['Média', r.media], ['Máximo', r.maximo], ['Último', e.pontos[e.pontos.length - 1].preco]].map(([k, v]) => h('div', { class: 'fact' }, h('span', { class: 'fact-k' }, k), h('span', { class: 'fact-v num' }, money(v))))));
  }).catch((x) => evo.replaceChildren(errorState(x.message)));
  load('precos.historico', { produto_id: id }).then((hs) => {
    mine.replaceChildren(sectionHead('Meu histórico'), hs.length ? h('div', { class: 'list' }, hs.slice(0, 12).map((x) => row({ lead: h('span', { class: 'tipo-ico' }, icon(x.origem === 'nfce' ? 'receipt' : x.origem === 'sessao' ? 'cart' : 'edit')), title: x.loja, sub: dmy(x.data) + ' · ' + ({ nfce: 'nota fiscal', sessao: 'compra', manual: 'digitado' }[x.origem] || x.origem), trail: h('span', { class: 'num' }, money(x.preco)) }))) : empty({ ic: 'history', title: 'Você ainda não registrou preços' }));
  }).catch((x) => mine.replaceChildren(errorState(x.message)));
  const drawComm = async () => {
    try {
      const r = await call('precos.compartilhados', { produto_ids: [id] });
      const ls = r[id] || [];
      comm.replaceChildren(sectionHead('Preços da comunidade', tip('Preços de outras pessoas, sem identificar ninguém. Verificado = confirmado por nota ou por várias pessoas.')),
        !p.gtin ? empty({ ic: 'barcode', title: 'Cadastre o código de barras para ver preços de outras pessoas' }) : ls.length ? h('div', { class: 'list' }, ls.map(obsRow)) : empty({ ic: 'users', title: 'Ninguém compartilhou preço ainda' }));
    } catch (x) { comm.replaceChildren(errorState(x.message, drawComm)); }
  };
  function obsRow(o) {
    const st = o.status === 'suspeito' ? badge('Suspeito', 'out', 'alert') : o.verificado ? badge('Verificado', 'in', 'verified') : badge('Não confirmado', 'neutral', 'clock');
    const vote = async (tipo, b) => {
      b.disabled = true;
      try { const r = await call('precos.confirmar', { id: o.observacao_id, tipo }, { rid: uuid() }); o.meu_voto = tipo; o.confirmacoes = r.confirmacoes; o.verificado = r.status === 'validado'; o.status = r.status; toast(tipo === 'confirmo' ? 'Obrigado por confirmar.' : 'Obrigado. Registramos que o preço mudou.', { tone: 'success' }); drawComm(); }
      catch (e) { toast(e.message, { tone: 'danger' }); b.disabled = false; }
    };
    const votes = o.minha ? badge('Seu preço', 'xfer') : h('div', { class: 'vote' },
      btn('Confirmo', { kind: 'secondary', size: 'sm', icon: 'check', cls: o.meu_voto === 'confirmo' ? 'is-on' : '', disabled: !!o.meu_voto, onClick: (e) => vote('confirmo', e.currentTarget) }),
      btn('Mudou', { kind: 'secondary', size: 'sm', icon: 'refresh', cls: o.meu_voto === 'discordo' ? 'is-on' : '', disabled: !!o.meu_voto, onClick: (e) => vote('discordo', e.currentTarget) }));
    const el = h('div', { class: 'row', style: null },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, o.loja.nome), h('div', { class: 'row-sub' }, st, h('span', { class: 'row-subtext' }, `${o.loja.cidade || ''}${o.loja.uf ? '/' + o.loja.uf : ''} · ${o.idade_dias === 0 ? 'hoje' : relDate(o.data)}${o.confirmacoes ? ' · ' + o.confirmacoes + ' confirmações' : ''}`)), votes),
      h('div', { class: 'row-trail' }, h('span', { class: 'amount num' + (o.status === 'suspeito' ? ' is-strike' : '') }, money(o.preco)), o.minha ? null : iconBtn('flag', 'Denunciar preço', () => denunciar('preco', o.observacao_id))));
    return el;
  }
  drawComm();

  // Outros preços (atacado, app, cartão da loja…): ficam no espaço da pessoa, nunca viram o preço normal nem vão para a base colaborativa
  let lojasOpc = [];
  const opcHead = () => sectionHead('Outros preços', ed ? btn('Adicionar preço', { kind: 'ghost', size: 'sm', icon: 'plus', onClick: () => opcaoForm(null) }) : null);
  async function drawOpc() {
    try {
      const [os, ljs] = await Promise.all([call('precos.opcoes', { produto_id: id }), load('lojas.listar', {}).catch(() => [])]);
      lojasOpc = ljs;
      if (!os.length && !ed) { opc.hidden = true; return; }
      opc.hidden = false;
      opc.replaceChildren(opcHead(), os.length ? h('div', { class: 'list' }, os.map((o) => row({
        lead: h('span', { class: 'tipo-ico tone-xfer' }, icon('tag')), title: o.rotulo,
        sub: [o.loja_id ? o.loja_nome || 'Loja' : 'Qualquer loja', o.qtd_min ? `a partir de ${num(o.qtd_min)} un.` : null].filter(Boolean).join(' · '),
        trail: h('span', { class: 'num' }, money(o.preco)), onClick: ed ? () => opcaoForm(o) : null,
      }))) : empty({ ic: 'tag', title: 'Nenhum outro preço' }));
    } catch (x) { opc.replaceChildren(opcHead(), errorState(x.message, drawOpc)); }
  }
  function opcaoForm(o) {
    const st = { rotulo: o ? o.rotulo : '', preco: o ? o.preco : 0, loja_id: o ? o.loja_id : null, qtd_min: o && o.qtd_min ? String(o.qtd_min) : '' };
    const err = formError(), rid = uuid();
    const nf = textField('Nome', { value: st.rotulo, placeholder: 'Ex.: Atacado', maxlength: 30, autofocus: !o, onInput: (v) => { st.rotulo = v; nf.setError(''); drawSug(); } });
    const sugs = h('div', { class: 'chip-row' });
    const drawSug = () => sugs.replaceChildren(...['Atacado', 'App', 'Cartão da loja', 'Promoção'].map((t) => chip(t, { selected: st.rotulo.trim() === t, onClick: () => { st.rotulo = t; nf.input.value = t; nf.setError(''); drawSug(); } })));
    drawSug();
    const mf = moneyField('Preço', { value: st.preco, onChange: (v) => { st.preco = v; mf.setError(''); } });
    const lf = pickField('Loja', { value: st.loja_id, items: () => [{ value: null, label: 'Qualquer loja', icon: 'store' }, ...lojasOpc.map((l) => ({ value: l.id, label: l.nome, icon: 'store', sub: l.cidade || null }))], onChange: (v) => { st.loja_id = v; lf.setError(''); } });
    const qf = textField('A partir de', { value: st.qtd_min, inputmode: 'numeric', placeholder: 'Opcional', maxlength: 4, tipText: 'Se preencher, o app aplica sozinho quando a quantidade bater', onInput: (v) => { st.qtd_min = v.replace(/\D/g, ''); qf.input.value = st.qtd_min; qf.setError(''); } });
    const campo = (m) => (/nome/i.test(m) ? nf : /a partir|quantidade/i.test(m) ? qf : /loja/i.test(m) ? lf : /pre[cç]o/i.test(m) ? mf : null);
    const b = btn(o ? 'Salvar' : 'Adicionar preço', { size: 'lg', full: true });
    const enviar = async (pl, ok) => {
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try { await call('precos.opcoes.salvar', pl, { rid }); await sh.close(); toast(ok, { tone: 'success' }); drawOpc(); }
      catch (e) { const f = campo(e.message); if (f) f.setError(e.message); else err.show(e.message); }
      finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    b.onclick = () => {
      let bad = false;
      if (!st.rotulo.trim()) { nf.setError('Dê um nome'); bad = true; }
      if (!(st.preco > 0)) { mf.setError('Informe o preço'); bad = true; }
      if (st.qtd_min && Number(st.qtd_min) < 2) { qf.setError('A partir de 2'); bad = true; }
      if (bad) return;
      const pl = { rotulo: st.rotulo.trim(), preco: st.preco, loja_id: st.loja_id || (o ? '' : undefined), qtd_min: st.qtd_min ? Number(st.qtd_min) : o ? null : undefined };
      if (o) pl.id = o.id; else pl.produto_id = id;
      enviar(pl, o ? 'Preço atualizado.' : 'Preço adicionado.');
    };
    const inat = o ? btn('Inativar este preço', { kind: 'ghost', icon: 'ban', full: true, onClick: async () => {
      if (!(await confirmSheet({ title: `Inativar “${o.rotulo}”?`, confirm: 'Inativar', tone: 'danger' }))) return;
      try { await call('precos.opcoes.salvar', { id: o.id, status: 'INATIVO' }, { rid: uuid() }); await sh.close(); toast('Preço inativado.', { tone: 'success' }); drawOpc(); } catch (e) { err.show(e.message); }
    } }) : null;
    const sh = openSheet({ title: o ? o.rotulo : 'Outro preço', footer: b, content: [err, nf, sugs, mf, lf, qf, inat] });
  }
  drawOpc();

  function fotoMenu() {
    if (!ed) return;
    openMenu({ title: 'Foto do produto', items: [
      { icon: 'camera', label: 'Tirar foto', onClick: () => foto(true) },
      { icon: 'image', label: 'Escolher imagem', onClick: () => foto(false) },
      p.tem_imagem && { icon: 'x', label: 'Remover foto', tone: 'out', onClick: async () => { try { await call('produtos.imagem.remover', { produto_id: id }, { rid: uuid() }); forgetImg(id); p.tem_imagem = false; ctx.refresh(); } catch (e) { toast(e.message, { tone: 'danger' }); } } },
      p.gtin && p.tem_imagem && { icon: 'flag', label: 'Denunciar foto', tone: 'out', onClick: () => denunciar('imagem', p.gtin) },
    ] });
  }
  async function foto(camera) {
    let f = null, pronta = null;
    if (camera) {                                   // câmera DENTRO do app: não sai da página (celulares com pouca memória recarregavam)
      const r = await capturePhoto();
      if (!r) return;
      if (r.dados) pronta = r.dados; else f = r.file;
    } else f = await chooseImage({ camera: false });
    if (!pronta && !f) return;
    const t = toast('Enviando foto…', { ico: 'upload', duration: 10000 });
    try {
      const dados = pronta || await imageToThumb(f);
      const r = await call('produtos.imagem.salvar', { produto_id: id, dados }, { rid: uuid() });
      t(); forgetImg(id); p.tem_imagem = true; store.produtos.set(id, p);
      toast(r.publicada_no_catalogo ? 'Foto salva e compartilhada no catálogo.' : 'Foto salva.', { tone: 'success' });
      photo.replaceChildren(thumb(p, 'is-lg'));
    } catch (e) { t(); toast(e.message, { tone: 'danger' }); }
  }
}

export async function registrar(p) {
  const err = formError(), rid = uuid();
  let preco = p.ultimo_preco || 0, loja = null, data = HOJE;
  const lojas = await load('lojas.listar', {}).catch(() => []);
  let lf;
  const mf = moneyField('Preço', { value: preco, big: true, autofocus: true, onChange: (v) => { preco = v; mf.setError(''); } });
  mf.input.dataset.forceFocus = '1';
  lf = pickField('Loja', { value: loja, items: () => lojas.map((l) => ({ value: l.id, label: l.nome, icon: 'store' })), placeholder: 'Escolher loja', onChange: (v) => { loja = v; lf.setError(''); },
    action: can('editor') ? { label: 'Nova loja', icon: 'plus', onClick: () => lojaForm(null, (r) => { lojas.push(r); loja = r.id; lf.set(r.id); lf.setError(''); }) } : null });
  const b = btn('Registrar', { size: 'lg', full: true });
  b.onclick = async () => {
    let bad = false;
    if (!(preco > 0)) { mf.setError('Informe o preço'); bad = true; }
    if (!loja) { lf.setError('Escolha a loja'); bad = true; }
    if (bad) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { const r = await call('precos.registrar', { produto_id: p.id, loja_id: loja, preco, data }, { rid }); await s.close(); toast(r.publicado ? (r.status === 'suspeito' ? 'Registrado. Ficou fora do comum e será revisado.' : 'Registrado e compartilhado.') : 'Registrado.', { tone: 'success' }); emit('dados'); }
    catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: 'Preço de ' + p.nome, footer: b, content: [err, mf, lf, dateField('Data', { value: HOJE, max: HOJE, onChange: (v) => { data = v; } })] });
}
