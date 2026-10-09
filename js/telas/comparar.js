// Comparação de lojas: total, cobertura, distância, custo de deslocamento, melhor opção e compra dividida
import { h, money, num, pct } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { geolocate } from '../ui/media.js';
import { card, chip, badge, empty, errorState, skelCards, sectionHead, toggle, row, tip, btn } from '../ui/components.js';
import { hbars } from '../ui/charts.js';

export default async function comparar(ctx, listaId) {
  const { view, setTitle } = ctx;
  setTitle('Comparar lojas', { back: '/compras/lista/' + listaId });
  let origem = 'casa', pos = null, raio = null, compart = true;
  const tools = h('div', { class: 'chip-row chip-row--scroll' });
  const out = h('div', { class: 'sec' }, skelCards(3));
  view.append(tools, out);
  const drawTools = () => tools.replaceChildren(
    chip('Saindo de casa', { selected: origem === 'casa', ic: 'home', onClick: () => { origem = 'casa'; run(); } }),
    chip('Onde estou', { selected: origem === 'aqui', ic: 'pin', onClick: async () => { try { pos ||= await geolocate(); origem = 'aqui'; run(); } catch (e) { toast(e.message, { tone: 'danger' }); } } }),
    h('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
    ...[[null, 'Qualquer distância'], [3, 'Até 3 km'], [8, 'Até 8 km']].map(([v, l]) => chip(l, { selected: raio === v, onClick: () => { raio = v; run(); } })),
    chip('Lojas de outras pessoas', { selected: compart, ic: 'users', onClick: () => { compart = !compart; run(); } }));
  async function run() {
    drawTools();
    out.replaceChildren(skelCards(3));
    try {
      const p = { lista_id: listaId, incluir_compartilhadas: compart, raio_km: raio || undefined };
      if (origem === 'aqui' && pos) Object.assign(p, pos);
      const r = await call('comparacao.lista', p);
      if (!r.lojas.length) { out.replaceChildren(empty({ ic: 'store', title: 'Nenhuma loja com preços para esta lista', action: btn('Ver lojas', { kind: 'secondary', onClick: () => ctx.go('/compras/lojas') }) })); return; }
      const best = r.lojas.find((l) => l.loja_id === r.melhor) || r.lojas[0];
      const els = [];
      els.push(h('section', { class: 'best', 'aria-label': 'Melhor opção' },
        h('span', { class: 'best-k' }, icon('verified'), 'Melhor opção'), h('span', { class: 'best-name' }, best.nome), h('span', { class: 'best-v num' }, money(best.total_final)),
        h('div', { class: 'best-sub' }, r.economia_vs_pior > 0 ? badge('Economia de ' + money(r.economia_vs_pior) + ' sobre a mais cara', 'in', 'down') : null, best.cobertura < 1 ? badge(pct(best.cobertura * 100) + ' dos itens com preço', 'warn', 'alert') : badge('Todos os itens com preço', 'in', 'check'))));
      els.push(card('sec-card', sectionHead('Total final por loja', tip('Compras + custo de ida e volta. Item sem preço na loja usa o melhor preço conhecido.')),
        hbars(r.lojas.map((l) => ({ label: l.nome, best: l.loja_id === r.melhor, parts: [{ label: 'Preços conhecidos', value: l.total_conhecido }, { label: 'Estimado', value: l.total_estimado - l.total_conhecido, cls: 'is-est' }, { label: 'Deslocamento', value: l.custo_deslocamento, cls: 'is-desl' }] }))),
        h('div', { class: 'chart-legend' }, h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--ink-2)' } }), 'Conhecido'), h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--ink-3)' } }), 'Estimado'), h('span', {}, h('i', { class: 'chart-dot', style: { '--c': 'var(--warn)' } }), 'Deslocamento'))));
      if (r.compra_dividida) {
        const cd = r.compra_dividida, vale = cd.economia_vs_melhor > 0;
        els.push(card('sec-card', sectionHead('Comprar em ' + cd.lojas.length + ' lojas', vale ? badge('Economiza ' + money(cd.economia_vs_melhor), 'in', 'down') : badge('Não compensa', 'neutral')),
          h('div', { class: 'kv-list' }, kv2('Compras', money(cd.total)), kv2('Deslocamento', money(cd.custo_deslocamento)), kv2('Total', money(cd.total_final), 'is-total')),
          ...cd.lojas.map((g) => h('div', { class: 'split-group' }, h('h3', { class: 'day-h' }, g.nome + ' · ' + money(g.subtotal)), h('div', { class: 'list' }, g.itens.map((i) => row({ title: i.descricao, sub: `${num(i.quantidade, 3)} × ${money(i.preco)}`, trail: h('span', { class: 'num' }, money(i.subtotal)) })))))));
      }
      els.push(sectionHead('Lojas'));
      els.push(h('div', { class: 'list-cards' }, r.lojas.map((l) => storeCard(l, l.loja_id === r.melhor))));
      out.replaceChildren(...els);
    } catch (e) { out.replaceChildren(errorState(e.message, run)); }
  }
  run();
}
const kv2 = (k, v, cls = '') => h('div', { class: 'kv ' + cls }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v num' }, v));

function storeCard(l, best) {
  const semGeo = l.distancia_km == null;
  return h('button', { class: 'card store-card', type: 'button', onclick: () => detalhe(l) },
    h('div', { class: 'store-top' }, h('span', { class: 'tipo-ico' + (best ? ' tone-in' : '') }, icon(best ? 'verified' : 'store')), h('span', { class: 'store-name' }, h('span', { class: 'truncate', style: null }, l.nome)), h('span', { class: 'store-total num' }, money(l.total_final))),
    h('div', { class: 'det-badges' }, best ? badge('Melhor', 'in', 'check') : null, semGeo ? badge('Sem localização', 'warn', 'pin') : null, l.compartilhada ? badge('De outras pessoas', 'neutral', 'users') : null, l.itens_faltantes.length ? badge(`${l.itens_faltantes.length} sem preço aqui`, 'warn') : null),
    h('div', { class: 'store-facts' },
      fact('Cobertura', pct(l.cobertura * 100)), fact('Compras', money(l.total_estimado)),
      fact('Distância', semGeo ? '—' : num(l.distancia_km, 1) + ' km'), fact('Deslocamento', semGeo ? '—' : money(l.custo_deslocamento))));
}
const fact = (k, v) => h('div', { class: 'fact' }, h('span', { class: 'fact-k' }, k), h('span', { class: 'fact-v' }, v));

function detalhe(l) {
  openSheet({ title: l.nome, snap: true, size: 'full', content: [
    h('div', { class: 'kv-list' }, kv2('Preços conhecidos', money(l.total_conhecido)), kv2('Com estimativas', money(l.total_estimado)), l.deslocamento_km != null ? kv2('Ida e volta', num(l.deslocamento_km, 1) + ' km') : null, kv2('Deslocamento', money(l.custo_deslocamento)), kv2('Total final', money(l.total_final), 'is-total')),
    h('div', { class: 'list' }, l.itens.map((i) => row({ title: i.descricao, sub: i.preco != null ? `${num(i.quantidade, 3)} × ${money(i.preco)}` : 'Sem preço em nenhuma loja',
      badges: i.fonte === 'ESTIMADO' ? [badge('Estimado', 'warn')] : i.fonte === 'COMPARTILHADO' ? [badge('Comunidade', 'neutral', 'users')] : !i.fonte ? [badge('Sem preço', 'out')] : null,
      trail: h('span', { class: 'num' }, i.subtotal != null ? money(i.subtotal) : '—') }))),
  ] });
}
