// Conta com cheque especial e rendimento: resumo (lista, painel, detalhe), opção "cobrança do banco" e aviso de limite (LIMITE_CONTA).
import { h, money, num } from '../util.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { openSheet } from './sheet.js';
import { btn, card, kv, tip, toggle, sectionHead } from './components.js';

const UNID = { MES: 'ao mês', ANO: 'ao ano' };
export const taxaTxt = (v, u) => num(Number(v) || 0, 2) + '% ' + (UNID[u] || UNID.MES);
const pctTxt = (v) => num(Number(v) || 0, (Number(v) || 0) % 1 ? 1 : 0) + '%';
const estTag = () => h('span', { class: 'est-tag' }, 'estimativa');

// Selo forte: ícone + texto + valor (nunca só cor)
export const acimaBadge = (ce) => h('span', { class: 'badge tone-out is-strong' }, icon('alert'), 'Acima do limite · ', h('span', { class: 'num money' }, money(ce.excesso)));

// Barra "em uso × limite" com o percentual em texto
export function chequeMeter(ce) {
  const p = ce.limite > 0 ? Math.min(1, ce.em_uso / ce.limite) : 1;
  const txt = pctTxt(ce.uso_pct);
  return h('div', { class: 'chq-meter' },
    h('div', { class: 'meter-line chq-line' + (ce.acima_do_limite ? ' is-over' : ce.uso_pct >= 80 ? ' is-near' : ''), role: 'meter', 'aria-label': 'Cheque especial em uso',
      'aria-valuemin': '0', 'aria-valuemax': String(ce.limite), 'aria-valuenow': String(ce.em_uso), 'aria-valuetext': `${money(ce.em_uso)} de ${money(ce.limite)}, ${txt}`, style: { '--p': String(p) } }),
    h('div', { class: 'chq-nums' },
      h('span', {}, h('span', { class: 'muted' }, 'Em uso '), h('strong', { class: 'num money' }, money(ce.em_uso)), h('span', { class: 'muted num money' }, ' de ' + money(ce.limite))),
      h('strong', { class: 'num chq-pct' }, txt)));
}

export function estimativas(c) {
  const ce = c.cheque_especial, its = [];
  if (ce && ce.juros_estimados_mes > 0) its.push(h('span', { class: 'est' }, icon('up'), 'Juros do mês ', h('strong', { class: 'num money' }, money(ce.juros_estimados_mes)), estTag()));
  if (c.rendimento_estimado_mes > 0) its.push(h('span', { class: 'est' }, icon('piggy'), 'Rendimento do mês ', h('strong', { class: 'num money' }, money(c.rendimento_estimado_mes)), estTag()));
  return its.length ? h('span', { class: 'est-list' }, its) : null;
}

// Bloco do cartão da conta (tela Contas). Conta sem controle e sem taxa: nada muda.
export function contaResumo(c) {
  const ce = c.cheque_especial, out = [];
  if (ce) {
    if (ce.limite > 0) out.push(chequeMeter(ce));
    else if (!ce.acima_do_limite) out.push(h('span', { class: 'chq-disp' }, 'Sem cheque especial'));
    if (ce.acima_do_limite) out.push(h('span', {}, acimaBadge(ce)));
    else if (ce.limite > 0) out.push(h('span', { class: 'chq-disp' }, 'Disponível para usar ', h('strong', { class: 'num money' }, money(ce.disponivel_para_usar))));
  }
  const est = estimativas(c);
  if (est) out.push(est);
  return out.length ? h('span', { class: 'chq' }, out) : null;
}

// Linhas extras do "Onde está" (painel), compactas
export function ondeExtra(c) {
  const ce = c.cheque_especial, out = [];
  if (ce && ce.acima_do_limite) out.push(h('span', {}, acimaBadge(ce)));
  else if (ce && ce.limite > 0) out.push(h('span', { class: 'acct-chq' },
    h('span', { class: 'meter-line chq-line' + (ce.uso_pct >= 80 ? ' is-near' : ''), 'aria-hidden': 'true', style: { '--p': String(Math.min(1, ce.em_uso / ce.limite)) } }),
    h('span', {}, 'Limite em uso ' + pctTxt(ce.uso_pct)),
    h('span', {}, 'Disponível ', h('span', { class: 'num money' }, money(ce.disponivel_para_usar)))));
  if (c.rendimento_estimado_mes > 0) out.push(h('span', { class: 'est' }, 'Rende ', h('strong', { class: 'num money' }, money(c.rendimento_estimado_mes)), ' no mês', estTag()));
  return out;
}

const estK = (t) => h('span', { class: 'kv-tip' }, t, estTag(), tip('Pelo saldo de hoje e a taxa informada. O app não lança nada sozinho.'));

// Card do detalhe da conta: os três números do cheque especial, juros e rendimento
export function contaDetalhe(c, r) {
  const ce = c.cheque_especial, rend = Number(r && r.taxa_rendimento) > 0;
  if (!ce && !rend) return null;
  const parts = [];
  if (ce) {
    parts.push(sectionHead('Cheque especial', ce.acima_do_limite ? acimaBadge(ce) : null));
    if (ce.limite > 0) parts.push(chequeMeter(ce));
    parts.push(h('div', { class: 'kv-list' },
      kv('Limite total', ce.limite > 0 ? money(ce.limite) : 'Sem cheque especial'),
      kv('Em uso', money(ce.em_uso) + (ce.limite > 0 ? ' · ' + pctTxt(ce.uso_pct) : '')),
      kv(h('span', { class: 'kv-tip' }, 'Limite disponível', tip('O que sobra do limite: total menos o que está em uso.')), money(ce.limite_disponivel)),
      ce.acima_do_limite ? kv('Excesso', money(ce.excesso), 'tone-out') : null,
      kv(h('span', { class: 'kv-tip' }, 'Disponível para usar', tip('Saldo + limite: o que ainda dá para gastar nesta conta.')), money(ce.disponivel_para_usar), 'is-total'),
      ce.juros ? kv('Juros', taxaTxt(ce.juros, ce.juros_unidade)) : null,
      ce.juros_estimados_mes > 0 ? kv(estK('Juros do mês'), money(ce.juros_estimados_mes)) : null));
  }
  if (rend) parts.push(sectionHead('Rendimento'), h('div', { class: 'kv-list' },
    kv('Taxa', taxaTxt(r.taxa_rendimento, r.rendimento_unidade)),
    kv(estK('Rendimento do mês'), c.rendimento_estimado_mes > 0 ? money(c.rendimento_estimado_mes) : '—')));
  return card('sec-card chq-card', parts);
}

// "Cobrança do banco" só vale para saída de conta
export const podeCobranca = (tipo, recursoId) => tipo === 'SAIDA' && (!recursoId || (store.recs.get(recursoId) || {}).tipo === 'CONTA');

export function cobrancaField(checked, onChange) {
  return h('div', { class: 'field cobr-field' }, h('div', { class: 'cobr-row' },
    toggle('Cobrança do banco', { checked, sub: 'Juros, tarifa ou IOF', onChange }),
    tip('O banco debita mesmo sem saldo: este lançamento nunca é bloqueado pelo limite.')));
}

// Aviso que não some: mensagem do servidor + "Marcar como cobrança do banco e salvar" / "Voltar". Resolve true se a pessoa marcou.
export function avisoLimite(msg, { podeCobranca: pode } = {}) {
  return new Promise((res) => {
    let ok = false;
    const s = openSheet({
      title: 'Saldo + limite insuficientes',
      content: h('div', { class: 'lim-aviso', role: 'alert' }, h('span', { class: 'lim-aviso-ico' }, icon('alert')), h('p', { class: 'lim-aviso-msg' }, msg)),
      footer: h('div', { class: 'btn-col' },
        pode ? btn('Marcar como cobrança do banco e salvar', { full: true, size: 'lg', icon: 'check', onClick: () => { ok = true; s.close(); } }) : null,
        btn('Voltar', { kind: 'secondary', full: true, onClick: () => s.close() })),
      onClose: () => res(ok),
    });
  });
}
