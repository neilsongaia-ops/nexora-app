// Comparação de lojas: origem e transporte da pessoa, total, cobertura, distância, custo de deslocamento, melhor opção e compra dividida
import { h, money, num, pct } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { openSheet, pick } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { geolocate } from '../ui/media.js';
import { card, chip, badge, empty, errorState, skelCards, sectionHead, row, tip, btn } from '../ui/components.js';
import { hbars } from '../ui/charts.js';
import { TIPO_MODO, TIPO_VEIC, faltaModo, custoModo } from './deslocamento.js';

export default async function comparar(ctx, listaId) {
  const { view, setTitle } = ctx;
  setTitle('Comparar lojas', { back: '/compras/lista/' + listaId });
  let origem = null, modoId = null, pos = null, raio = null, compart = true;
  let desl = null, ult = null, antes = null, mudouDesl = false;
  const irDesl = () => ctx.go('/ajustes/deslocamento?de=' + encodeURIComponent('/compras/comparar/' + listaId));
  const sel = h('div', { class: 'cmp-sel', role: 'group', 'aria-label': 'Origem e transporte' });
  const tools = h('div', { class: 'chip-row chip-row--scroll' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const out = h('div', { class: 'sec' }, skelCards(3));
  view.append(sel, tools, live, out);
  const lerDesl = () => (desl ? Promise.resolve(desl) : load('deslocamento.ler', {}).then((r) => { desl = r; return r; }));
  lerDesl().then(drawSel).catch(() => {});

  const ativo = (x) => x.status !== 'INATIVO';
  const origemNome = (o) => (o ? o.nome || (o.fonte === 'INFORMADA' ? 'onde você está' : 'Casa') : null);
  const modoIco = (m) => {
    if (!m) return 'route';
    if (m.tipo === 'VEICULO' && desl) { const mm = desl.modos.find((x) => x.id === m.id), v = mm && desl.veiculos.find((x) => x.id === mm.veiculo_id); if (v) return (TIPO_VEIC[v.tipo] || TIPO_VEIC.OUTRO).icon; }
    return (TIPO_MODO[m.tipo] || TIPO_MODO.OUTRO).icon;
  };
  const pickBtn = (k, v, ic, onClick, warn) => h('button', { class: 'cmp-pick' + (warn ? ' is-warn' : ''), type: 'button', 'aria-haspopup': 'listbox', 'aria-label': k + ': ' + v, onclick: onClick },
    h('span', { class: 'cmp-pick-ico' }, icon(ic)), h('span', { class: 'cmp-pick-t' }, h('span', { class: 'cmp-pick-k' }, k), h('span', { class: 'cmp-pick-v' }, v)), icon('chevD', 'cmp-pick-chev'));
  function drawSel() {
    const o = ult && ult.origem, m = ult && ult.modo;
    const nada = desl && !desl.enderecos.some(ativo) && !desl.modos.some(ativo) && !(o && o.fonte === 'INFORMADA');
    if (!ult || nada) { sel.replaceChildren(); sel.hidden = true; return; }
    sel.hidden = false;
    sel.replaceChildren(
      pickBtn('Saindo de', o ? (o.fonte === 'INFORMADA' ? 'Onde estou agora' : origemNome(o)) : 'Escolher', o && o.fonte === 'INFORMADA' ? 'locate' : 'home', escolherOrigem),
      pickBtn('Indo de', m ? m.nome : 'Escolher', modoIco(m), escolherModo, m && m.incompleto));
  }
  async function escolherOrigem() {
    let d; try { d = await lerDesl(); } catch (e) { toast(e.message, { tone: 'danger' }); return; }
    const cur = ult && ult.origem ? (ult.origem.fonte === 'INFORMADA' ? 'aqui' : ult.origem.endereco_id) : null;
    const v = await pick({ title: 'Saindo de', value: cur, items: [{ value: 'aqui', label: 'Onde estou agora', icon: 'locate' },
      ...d.enderecos.filter(ativo).map((e) => ({ value: e.id, label: e.nome, sub: e.endereco || null, icon: e.padrao ? 'home' : 'pin', right: e.padrao ? 'Padrão' : null }))],
      action: { label: 'Endereços', icon: 'settings', onClick: irDesl } });
    if (v === undefined || v === cur) return;
    if (v === 'aqui') { try { pos = await geolocate(); } catch (e) { toast(e.message, { tone: 'danger' }); return; } }
    origem = v; mudouDesl = true; run();
  }
  async function escolherModo() {
    let d; try { d = await lerDesl(); } catch (e) { toast(e.message, { tone: 'danger' }); return; }
    const ms = d.modos.filter(ativo), cur = ult && ult.modo ? ult.modo.id : null;
    const v = await pick({ title: 'Indo de', value: cur, items: ms.map((m) => {
      const vv = m.tipo === 'VEICULO' && d.veiculos.find((x) => x.id === m.veiculo_id);
      return { value: m.id, label: m.nome, sub: faltaModo(m, d) || custoModo(m), icon: vv ? (TIPO_VEIC[vv.tipo] || TIPO_VEIC.OUTRO).icon : (TIPO_MODO[m.tipo] || TIPO_MODO.OUTRO).icon, tone: m.incompleto ? 'warn' : null, right: m.padrao ? 'Padrão' : null };
    }), action: { label: 'Transportes', icon: 'settings', onClick: irDesl } });
    if (v === undefined || v === cur) return;
    modoId = v; mudouDesl = true; run();
  }
  const drawTools = () => tools.replaceChildren(
    ...[[null, 'Qualquer distância'], [3, 'Até 3 km'], [8, 'Até 8 km']].map(([v, l]) => chip(l, { selected: raio === v, onClick: () => { raio = v; run(); } })),
    chip('Lojas de outras pessoas', { selected: compart, ic: 'users', onClick: () => { compart = !compart; run(); } }));

  async function run() {
    drawTools();
    const comparaRanking = mudouDesl && antes;
    mudouDesl = false;
    out.replaceChildren(skelCards(3));
    try {
      const p = { lista_id: listaId, incluir_compartilhadas: compart, raio_km: raio || undefined };
      if (origem === 'aqui' && pos) Object.assign(p, pos); else if (origem && origem !== 'aqui') p.endereco_id = origem;
      if (modoId) p.modo_id = modoId;
      const r = await call('comparacao.lista', p);
      ult = { origem: r.origem || null, modo: r.modo || null };
      drawSel();
      const semOrigem = !r.origem || r.origem.latitude == null, semModo = !r.modo, inc = !!(r.modo && r.modo.incompleto);
      const semDesl = semOrigem || semModo || inc;
      const els = [];
      if (semOrigem) els.push(convite('home', 'Cadastre onde você mora para ver o custo de ir às lojas', 'Cadastrar endereço'));
      else if (semModo) els.push(convite('route', 'Cadastre como você vai às lojas para somar o deslocamento', 'Cadastrar transporte'));
      else if (inc) {
        let msg = 'Falta informação para calcular o deslocamento';
        try { const d = await lerDesl(); const m = d.modos.find((x) => x.id === r.modo.id); msg = faltaModo(m || r.modo, d) || msg; } catch { /* sem detalhes */ }
        els.push(h('div', { class: 'warn-item cmp-inc' }, icon('alert'), h('span', { class: 'grow' }, msg), btn('Completar', { kind: 'ghost', size: 'sm', onClick: irDesl })));
      }
      if (!r.lojas.length) {
        els.push(empty({ ic: 'store', title: 'Nenhuma loja com preços para esta lista', action: btn('Ver lojas', { kind: 'secondary', onClick: () => ctx.go('/compras/lojas') }) }));
        out.replaceChildren(...els); antes = null; return;
      }
      const best = r.lojas.find((l) => l.loja_id === r.melhor) || r.lojas[0];
      const ordemAntes = comparaRanking ? antes.ordem : null, melhorAntes = comparaRanking ? antes : null;
      const trocou = melhorAntes && melhorAntes.melhor !== best.loja_id;
      antes = { melhor: best.loja_id, nome: best.nome, ordem: new Map(r.lojas.map((l, i) => [l.loja_id, i])) };
      if (comparaRanking) live.textContent = trocou ? 'A melhor opção mudou para ' + best.nome + '.' : 'Custos atualizados. A melhor opção continua ' + best.nome + '.';
      els.push(h('section', { class: 'best' + (trocou ? ' is-changed' : ''), 'aria-label': 'Melhor opção' },
        h('span', { class: 'best-k' }, icon('verified'), trocou ? 'Nova melhor opção' : 'Melhor opção'), h('span', { class: 'best-name' }, best.nome), h('span', { class: 'best-v num' }, money(best.total_final)),
        !semOrigem && !semModo ? h('span', { class: 'best-from' }, icon('route'), h('span', {}, 'Saindo de ' + origemNome(r.origem) + ' · ' + r.modo.nome)) : null,
        h('div', { class: 'best-sub' }, trocou ? badge('Antes: ' + melhorAntes.nome, 'neutral', 'swap') : null,
          r.economia_vs_pior > 0 ? badge('Economia de ' + money(r.economia_vs_pior) + ' sobre a mais cara', 'in', 'down') : null, best.cobertura < 1 ? badge(pct(best.cobertura * 100) + ' dos itens com preço', 'warn', 'alert') : badge('Todos os itens com preço', 'in', 'check'))));
      els.push(card('sec-card', sectionHead('Total final por loja', tip(semDesl ? 'Item sem preço na loja usa o melhor preço conhecido.' : 'Compras + custo de ida e volta. Item sem preço na loja usa o melhor preço conhecido.')),
        hbars(r.lojas.map((l) => ({ label: l.nome, best: l.loja_id === r.melhor, parts: [{ label: 'Preços conhecidos', value: l.total_conhecido }, { label: 'Estimado', value: l.total_estimado - l.total_conhecido, cls: 'is-est' }, { label: 'Deslocamento', value: semDesl ? 0 : l.custo_deslocamento, cls: 'is-desl' }] }))),
        h('div', { class: 'chart-legend' }, h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--ink-2)' } }), 'Conhecido'), h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--ink-3)' } }), 'Estimado'), semDesl ? null : h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--warn)' } }), 'Deslocamento'))));
      if (r.compra_dividida) {
        const cd = r.compra_dividida, vale = cd.economia_vs_melhor > 0;
        els.push(card('sec-card', sectionHead('Comprar em ' + cd.lojas.length + ' lojas', vale ? badge('Economiza ' + money(cd.economia_vs_melhor), 'in', 'down') : badge('Não compensa', 'neutral')),
          h('div', { class: 'kv-list' }, kv2('Compras', money(cd.total)), kv2('Deslocamento', semDesl ? '—' : money(cd.custo_deslocamento)), kv2('Total', money(cd.total_final), 'is-total')),
          ...cd.lojas.map((g) => h('div', { class: 'split-group' }, h('h3', { class: 'day-h' }, g.nome + ' · ' + money(g.subtotal)), h('div', { class: 'list' }, g.itens.map((i) => row({ title: i.descricao, sub: `${num(i.quantidade, 3)} × ${money(i.preco)}`, trail: h('span', { class: 'num' }, money(i.subtotal)) })))))));
      }
      els.push(sectionHead('Lojas'));
      els.push(h('div', { class: 'list-cards' }, r.lojas.map((l, i) => storeCard(l, l.loja_id === r.melhor, semDesl, ordemAntes && ordemAntes.has(l.loja_id) ? ordemAntes.get(l.loja_id) - i : 0, r))));
      out.replaceChildren(...els);
    } catch (e) { out.replaceChildren(errorState(e.message, run)); }
  }
  function convite(ic, title, label) {
    return h('div', { class: 'card desl-convite' }, h('span', { class: 'tipo-ico tone-xfer' }, icon(ic)), h('p', { class: 'desl-convite-t' }, title), btn(label, { kind: 'secondary', size: 'sm', icon: 'plus', onClick: irDesl }));
  }
  run();
}
const kv2 = (k, v, cls = '') => h('div', { class: 'kv ' + cls }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v num' }, v));

function storeCard(l, best, semDesl, delta, r) {
  const semGeo = l.distancia_km == null;
  return h('button', { class: 'card store-card' + (delta ? ' is-moved' : ''), type: 'button', onclick: () => detalhe(l, semDesl, r) },
    h('div', { class: 'store-top' }, h('span', { class: 'tipo-ico' + (best ? ' tone-in' : '') }, icon(best ? 'verified' : 'store')), h('span', { class: 'store-name' }, h('span', { class: 'truncate', style: null }, l.nome)), h('span', { class: 'store-total num' }, money(l.total_final))),
    h('div', { class: 'det-badges' }, best ? badge('Melhor', 'in', 'check') : null,
      delta > 0 ? badge('Subiu ' + delta + (delta === 1 ? ' posição' : ' posições'), 'in', 'chevU') : delta < 0 ? badge('Desceu ' + -delta + (delta === -1 ? ' posição' : ' posições'), 'neutral', 'chevD') : null,
      semGeo ? badge('Sem localização', 'warn', 'pin') : null, l.compartilhada ? badge('De outras pessoas', 'neutral', 'users') : null, l.itens_faltantes.length ? badge(`${l.itens_faltantes.length} sem preço aqui`, 'warn') : null),
    h('div', { class: 'store-facts' },
      fact('Cobertura', pct(l.cobertura * 100)), fact('Compras', money(l.total_estimado)),
      fact('Distância', semGeo ? '—' : num(l.distancia_km, 1) + ' km'), fact('Deslocamento', semGeo || semDesl ? '—' : money(l.custo_deslocamento))));
}
const fact = (k, v) => h('div', { class: 'fact' }, h('span', { class: 'fact-k' }, k), h('span', { class: 'fact-v' }, v));

function detalhe(l, semDesl, r) {
  openSheet({ title: l.nome, snap: true, size: 'full', content: [
    h('div', { class: 'kv-list' }, kv2('Preços conhecidos', money(l.total_conhecido)), kv2('Com estimativas', money(l.total_estimado)),
      l.deslocamento_km != null ? kv2('Ida e volta', num(l.deslocamento_km, 1) + ' km') : null,
      r.modo && !semDesl ? kv2('Deslocamento · ' + r.modo.nome, money(l.custo_deslocamento)) : kv2('Deslocamento', '—'), kv2('Total final', money(l.total_final), 'is-total')),
    h('div', { class: 'list' }, l.itens.map((i) => row({ title: i.descricao, sub: i.preco != null ? `${num(i.quantidade, 3)} × ${money(i.preco)}` : 'Sem preço em nenhuma loja',
      badges: i.fonte === 'ESTIMADO' ? [badge('Estimado', 'warn')] : i.fonte === 'COMPARTILHADO' ? [badge('Comunidade', 'neutral', 'users')] : !i.fonte ? [badge('Sem preço', 'out')] : null,
      trail: h('span', { class: 'num' }, i.subtotal != null ? money(i.subtotal) : '—') }))),
  ] });
}
