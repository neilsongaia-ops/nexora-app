// Produto: foto, dados, evolução de preço, meu histórico, preços da comunidade (confirmar/mudou), registrar preço, denunciar
import { h, money, dmy, relDate, uuid, emit, monthShort, HOJE, num, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { store, can, catNome } from '../store.js';
import { openSheet, openMenu, pick } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { chooseImage, imageToThumb } from '../ui/media.js';
import { card, row, badge, empty, errorState, skelRows, skelCards, sectionHead, btn, iconBtn, thumb, forgetImg, moneyField, pickField, dateField, formError, tip } from '../ui/components.js';
import { line } from '../ui/charts.js';
import { produtoForm, denunciar, lojaForm } from './compras.js';

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
    p.global_id && { icon: 'flag', label: 'Denunciar produto', tone: 'out', onClick: () => denunciar('produto', p.global_id) },
  ] }))] });
  const photo = h('button', { class: 'photo-btn', type: 'button', 'aria-label': 'Foto do produto', onclick: () => fotoMenu() }, thumb(p, 'is-lg'));
  view.append(h('div', { class: 'prod-head' }, photo, h('div', { class: 'prod-head-txt' }, h('h2', { class: 'prod-name' }, p.nome),
    h('div', { class: 'prod-meta' }, [p.marca, embalagem(p), p.unidade === 'KG' || p.unidade === 'L' ? 'vendido por ' + p.unidade.toLowerCase() : null].filter(Boolean).map((x) => h('span', {}, x)), p.categoria_id ? h('span', {}, catNome(p.categoria_id)) : null),
    p.gtin ? h('span', { class: 'prod-meta num' }, icon('barcode'), p.gtin) : badge('Sem código: só neste espaço', 'neutral'))));
  const evo = card('sec-card', sectionHead('Evolução do preço'), skelCards(1));
  const comm = h('section', { class: 'sec' }, sectionHead('Preços da comunidade', tip('Preços de outras pessoas, sem identificar ninguém. Verificado = confirmado por nota ou por várias pessoas.')), skelRows(3));
  const mine = h('section', { class: 'sec' }, sectionHead('Meu histórico'), skelRows(3));
  view.append(h('div', { class: 'cols' }, h('div', { class: 'sec' }, evo, mine), comm));
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
    const f = await chooseImage({ camera });
    if (!f) return;
    const t = toast('Enviando foto…', { ico: 'upload', duration: 10000 });
    try {
      const dados = await imageToThumb(f);
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
async function addLista(p) {
  const ls = await load('listas.listar', {}).catch(() => []);
  const v = await pick({ title: 'Adicionar a', items: ls.map((l) => ({ value: l.id, label: l.nome, icon: 'bag' })), emptyText: 'Crie uma lista primeiro' });
  if (!v) return;
  try { await call('listas.item.adicionar', { lista_id: v, produto_id: p.id, quantidade: 1 }, { rid: uuid() }); toast('Adicionado à lista.', { tone: 'success' }); } catch (e) { toast(e.message, { tone: 'danger' }); }
}
