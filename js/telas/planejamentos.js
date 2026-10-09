// Planejamentos: planejado × realizado × disponível, por categoria, excedido em destaque
import { h, money, dmy, HOJE, monthStart, monthEnd, uuid, emit, pct } from '../util.js';
import { icon } from '../icons.js';
import { call, load } from '../api.js';
import { can, catNome } from '../store.js';
import { openSheet, pick } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { card, progress, badge, empty, errorState, skelCards, btn, iconBtn, kv, sectionHead, textField, moneyField, dateField, stepper, formError, tip, row } from '../ui/components.js';
import { categoriaItems } from './lancForm.js';

export default async function planejamentos(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Planejamentos', { actions: [can('editor') ? iconBtn('plus', 'Novo planejamento', () => planForm()) : null] });
  const grid = h('div', { class: 'plan-grid' }, skelCards(3));
  view.append(grid);
  try {
    const ps = await load('planejamentos.listar', {});
    if (!ps.length) { grid.replaceChildren(empty({ ic: 'target', title: 'Nenhum planejamento', action: can('editor') ? btn('Criar planejamento', { icon: 'plus', onClick: () => planForm() }) : null })); return; }
    grid.replaceChildren(...ps.sort((a, b) => (b.excedido > 0) - (a.excedido > 0) || a.prioridade - b.prioridade).map((p) => planCard(p)));
  } catch (e) { grid.replaceChildren(errorState(e.message, ctx.refresh)); }
}

function planCard(p) {
  const over = p.excedido > 0, ratio = p.planejado ? p.realizado / p.planejado : 0;
  const el = h('button', { class: 'card plan' + (over ? ' is-over' : ''), type: 'button', onclick: () => detalhe(p.id) },
    h('div', { class: 'plan-top' }, h('span', { class: 'plan-name truncate' }, p.nome), over ? badge('Excedido', 'out', 'alert') : ratio > 0.85 ? badge('Quase no limite', 'warn', 'clock') : null),
    h('span', { class: 'plan-period' }, dmy(p.data_inicio) + (p.data_fim ? ' a ' + dmy(p.data_fim) : ' em diante')),
    h('div', { class: 'plan-nums' }, h('span', { class: 'plan-real num' }, money(p.realizado)), h('span', { class: 'muted num' }, 'de ' + money(p.planejado))),
    progress(p.planejado, p.realizado, { label: p.nome }),
    h('div', { class: 'plan-foot' }, over ? h('span', { class: 'tone-out num' }, money(p.excedido) + ' acima') : h('span', { class: 'num' }, money(p.disponivel) + ' disponíveis'), h('span', { class: 'muted num' }, pct(ratio * 100))));
  return el;
}

async function detalhe(id) {
  const s = openSheet({ title: 'Planejamento', snap: true, size: 'full', content: skelCards(2) });
  try {
    const p = await call('planejamentos.situacao', { id });
    s.setTitle(p.nome);
    s.setContent([
      h('div', { class: 'plan-det' }, h('div', { class: 'tiles tiles--3' },
        h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, 'Planejado'), h('span', { class: 'tile-v num' }, money(p.planejado))),
        h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, 'Realizado'), h('span', { class: 'tile-v num' + (p.excedido ? ' tone-out' : '') }, money(p.realizado))),
        h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, p.excedido ? 'Excedido' : 'Disponível'), h('span', { class: 'tile-v num ' + (p.excedido ? 'tone-out' : 'tone-in') }, money(p.excedido || p.disponivel)))),
      progress(p.planejado, p.realizado, { label: p.nome })),
      sectionHead('Por categoria'),
      h('div', { class: 'list' }, p.categorias.map((c) => h('div', { class: 'plan-cat' + (c.excedido ? ' is-over' : '') },
        h('div', { class: 'plan-cat-top' }, h('span', { class: 'truncate' }, c.nome || catNome(c.categoria_id)), c.percentual_execucao < 100 ? badge(c.percentual_execucao + '%', 'neutral') : null, h('span', { class: 'num' }, money(c.realizado), h('span', { class: 'muted' }, ' / ' + money(c.limite)))),
        progress(c.limite, c.realizado, { label: c.nome }),
        c.excedido ? h('span', { class: 'plan-cat-sub tone-out num' }, icon('alert'), money(c.excedido) + ' acima') : h('span', { class: 'plan-cat-sub muted num' }, money(c.disponivel) + ' disponíveis')))),
      h('div', { class: 'kv-list' }, kv('Período', dmy(p.data_inicio) + (p.data_fim ? ' a ' + dmy(p.data_fim) : ' em diante')), kv(h('span', { class: 'kv-tip' }, 'Prioridade', tip('Se uma categoria está em mais de um planejamento, conta no de menor número.')), String(p.prioridade))),
    ]);
    if (can('editor')) s.setFooter(btn('Editar', { kind: 'secondary', icon: 'edit', full: true, onClick: async () => { await s.close(); planForm(p); } }));
  } catch (e) { s.setContent(errorState(e.message, () => { s.close(); detalhe(id); })); }
}

function planForm(edit) {
  const rid = uuid(), err = formError();
  const st = edit ? { nome: edit.nome, data_inicio: edit.data_inicio, data_fim: edit.data_fim, valor_limite: edit.planejado, prioridade: edit.prioridade, categorias: edit.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: c.limite, percentual_execucao: c.percentual_execucao || 100 })) }
    : { nome: '', data_inicio: monthStart(HOJE), data_fim: monthEnd(HOJE), valor_limite: 0, prioridade: 1, categorias: [] };
  let fn, fv;
  const somaCats = () => st.categorias.reduce((s, c) => s + (c.valor_limite || 0), 0);
  const build = () => {
    fn = textField('Nome', { value: st.nome, placeholder: 'Ex.: Mercado do mês', autofocus: true, onInput: (v) => { st.nome = v; fn.setError(''); } });
    fv = moneyField('Valor planejado', { value: st.valor_limite, big: true, onChange: (v) => { st.valor_limite = v; fv.setError(''); } });
    return [err, fn, fv,
      h('div', { class: 'grid-2' }, dateField('Início', { value: st.data_inicio, onChange: (v) => { st.data_inicio = v; } }), dateField('Fim', { value: st.data_fim || monthEnd(st.data_inicio), min: st.data_inicio, onChange: (v) => { st.data_fim = v; } })),
      h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Prioridade'), tip('Menor número vence quando a mesma categoria está em dois planejamentos.')), stepper({ value: st.prioridade, min: 1, max: 20, label: 'Prioridade', onChange: (v) => { st.prioridade = v; } })),
      sectionHead('Categorias', somaCats() ? h('span', { class: 'muted num' }, money(somaCats())) : null),
      h('div', { class: 'plan-cats-form' }, st.categorias.map((c, i) => h('div', { class: 'plan-cat-form' },
        h('div', { class: 'plan-cat-form-top' }, h('span', { class: 'truncate' }, catNome(c.categoria_id)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remover ' + catNome(c.categoria_id), onclick: () => { st.categorias.splice(i, 1); s.setContent(build()); } }, icon('x'))),
        h('div', { class: 'grid-2' }, moneyField('Limite', { value: c.valor_limite, onChange: (v) => { c.valor_limite = v; } }),
          h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Conta'), tip('Quanto de cada gasto desta categoria entra neste planejamento.')), stepper({ value: c.percentual_execucao, min: 5, max: 100, step: 5, label: 'Percentual', format: (v) => v + '%', onChange: (v) => { c.percentual_execucao = v; } })))))),
      btn('Adicionar categoria', { kind: 'ghost', icon: 'plus', onClick: async () => { const v = await pick({ title: 'Categoria', items: categoriaItems('DESPESA').filter((x) => !st.categorias.some((c) => c.categoria_id === x.value)) }); if (v) { st.categorias.push({ categoria_id: v, valor_limite: 0, percentual_execucao: 100 }); s.setContent(build()); } } })];
  };
  const b = btn(edit ? 'Salvar' : 'Criar planejamento', { size: 'lg', full: true });
  b.onclick = async () => {
    let bad = false;
    if (!st.nome.trim()) { fn.setError('Dê um nome'); bad = true; }
    if (!(st.valor_limite > 0)) { fv.setError('Informe o valor'); bad = true; }
    if (!st.categorias.length) { err.show('Escolha ao menos uma categoria.'); bad = true; }
    if (bad) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
    try {
      await call('planejamentos.salvar', { ...(edit ? { id: edit.id, versao: edit.versao } : {}), nome: st.nome.trim(), data_inicio: st.data_inicio, data_fim: st.data_fim, valor_limite: st.valor_limite, prioridade: st.prioridade, status: 'ATIVO', categorias: st.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: c.valor_limite || undefined, percentual_execucao: c.percentual_execucao })) }, { rid });
      await s.close(); toast('Planejamento salvo.', { tone: 'success' }); emit('dados');
    } catch (e) { err.show(e.message); s.body.scrollTop = 0; } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  const s = openSheet({ title: edit ? 'Editar planejamento' : 'Novo planejamento', size: 'full', content: build(), footer: b });
}
