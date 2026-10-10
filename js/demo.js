// Modo demonstração: implementação local de api() com dados 100% fictícios e coerentes (formatos de docs/API.md).
import { isoLocal, addDays, addMonths, diffDays, r2, sleep, monthStart, monthEnd } from './util.js';

const T = isoLocal(new Date());
const KEY = 'nx.demo.v7', FK = 'nx.demo.flags';
const sget = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio */ } };
const flags = Object.assign({ lento: false, falhar: false, conflito: false, expirar: false, offline: false, semBanco: false, vazio: false, contaNova: false }, sget(FK) || {});
if (new URLSearchParams(location.search).get('lento') === '1') flags.lento = true;
export const getFlags = () => ({ ...flags });
export function setFlag(k, v) { flags[k] = v; sset(FK, flags); }
export function resetDemo() { sessionStorage.removeItem(KEY); DB = null; flags.contaNova = false; sset(FK, flags); }

let DB = sget(KEY);
const save = () => sset(KEY, DB);
const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const pad = (n) => String(n).padStart(2, '0');
const nid = (p) => p + (++DB.seq).toString(36);
const fail = (msg, codigo = '') => { const e = new Error(msg); e.codigo = codigo; throw e; };
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const now = () => new Date().toISOString().slice(0, 19);
const PAPEL_TXT = { leitura: 'leitura', editor: 'editor', admin: 'administrador' };
/* Tipos de aviso configuráveis (convite e papel são sempre entregues e não entram aqui). */
const PREF_TIPOS = [
  { tipo: 'LANCAMENTO_MEMBRO', titulo: 'Lançamentos de outras pessoas', descricao: 'Quando alguém do espaço lança uma receita ou despesa.' },
  { tipo: 'FATURA_VENCENDO', titulo: 'Fatura perto de vencer', descricao: 'Até 3 dias antes do vencimento.' },
  { tipo: 'RESERVA_80', titulo: 'Reserva em 80%', descricao: 'Quando uma reserva chega a 80% do limite.' },
  { tipo: 'RESERVA_100', titulo: 'Reserva no limite', descricao: 'Quando uma reserva chega a 100% do limite.' },
  { tipo: 'QUEDA_PRECO', titulo: 'Queda de preço', descricao: 'Produto que você compra 10% mais barato em outra loja.' },
];
const prefsDe = () => DB.prefsNotif || (DB.prefsNotif = {});
const prefsView = () => ({ tipos: PREF_TIPOS.map((t) => ({ ...t, ativo: prefsDe()[t.tipo] !== false })) });
/* Fila de notificações da PESSOA logada (no demo, só Ana tem feed local). */
function notificar(email, n) {
  if (!DB.notificacoes || email !== DB.usuario.email) return null;
  if (prefsDe()[n.tipo] === false) return null;
  const item = { id: nid('nt'), lida: false, ref_id: null, espaco_id: null, criada_em: now(), ...n };
  DB.notificacoes.unshift(item);
  return item;
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gtin = (b12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(b12[11 - i]) * (i % 2 === 0 ? 3 : 1); return b12 + String((10 - (s % 10)) % 10); };
const dv11 = (s) => { let w = 2, t = 0; for (let i = s.length - 1; i >= 0; i--) { t += Number(s[i]) * w; w = w === 9 ? 2 : w + 1; } const r = t % 11; return r < 2 ? 0 : 11 - r; };

// ---------- categorias ----------
const CATS = [
  ['c_alim', 'Alimentação', 'DESPESA'], ['c_merc', 'Mercado', 'DESPESA', 'c_alim'], ['c_rest', 'Restaurantes', 'DESPESA', 'c_alim'], ['c_pada', 'Padaria e lanches', 'DESPESA', 'c_alim'],
  ['c_mor', 'Moradia', 'DESPESA'], ['c_alug', 'Aluguel', 'DESPESA', 'c_mor'], ['c_ener', 'Energia', 'DESPESA', 'c_mor'], ['c_agua', 'Água', 'DESPESA', 'c_mor'], ['c_net', 'Internet e telefone', 'DESPESA', 'c_mor'], ['c_cond', 'Condomínio', 'DESPESA', 'c_mor'],
  ['c_transp', 'Transporte', 'DESPESA'], ['c_comb', 'Combustível', 'DESPESA', 'c_transp'], ['c_app', 'Aplicativos de transporte', 'DESPESA', 'c_transp'], ['c_manut', 'Manutenção do carro', 'DESPESA', 'c_transp'],
  ['c_saude', 'Saúde', 'DESPESA'], ['c_farm', 'Farmácia', 'DESPESA', 'c_saude'], ['c_plano', 'Plano de saúde', 'DESPESA', 'c_saude'],
  ['c_edu', 'Educação', 'DESPESA'], ['c_lazer', 'Lazer', 'DESPESA'], ['c_casa', 'Casa e utilidades', 'DESPESA'], ['c_limp', 'Limpeza', 'DESPESA', 'c_casa'],
  ['c_pets', 'Pets', 'DESPESA'], ['c_vest', 'Vestuário', 'DESPESA'], ['c_assin', 'Assinaturas', 'DESPESA'], ['c_pres', 'Presentes', 'DESPESA'], ['c_tarifa', 'Impostos e tarifas', 'DESPESA'], ['c_hig', 'Higiene e beleza', 'DESPESA'],
  ['c_sal', 'Salário', 'RECEITA'], ['c_free', 'Trabalhos extras', 'RECEITA'], ['c_rend', 'Rendimentos', 'RECEITA'], ['c_reemb', 'Reembolsos', 'RECEITA'], ['c_vendas', 'Vendas', 'RECEITA'],
];
const baseSpace = (id, nome, papel) => ({
  id, nome, papel,
  categorias: CATS.map(([cid, n, tipo, pai]) => ({ id: cid, nome: n, tipo, pai_id: pai || null, status: 'ATIVA' })),
  recursos: [], lancamentos: [], pagamentos: [], recorrencias: [], planejamentos: [], produtos: [], lojas: [], precos: [], listas: [], listaItens: [], sessoes: [], notas: [], apelidos: {}, auditoria: [],
  membros: [{ usuario_id: 'u_ana', email: 'ana.prado@exemplo.com', nome: 'Ana Prado', papel: papel === 'leitura' ? 'leitura' : 'admin' }],
  config: { compartilhar_precos: true, custo_km: 0.95, fator_rota: 1.3, casa_latitude: -1.4552, casa_longitude: -48.4883 },
});

// ---------- motor financeiro ----------
const recOf = (S, id) => S.recursos.find((r) => r.id === id);
const closing = (k, ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(Math.min(k.dia_fechamento, new Date(y, m, 0).getDate()))}`; };
const due = (k, ym) => { let m = ym; if (k.dia_vencimento <= k.dia_fechamento) m = addMonths(ym + '-01', 1).slice(0, 7); const [y, mm] = m.split('-').map(Number); return `${m}-${pad(Math.min(k.dia_vencimento, new Date(y, mm, 0).getDate()))}`; };
const ymAdd = (ym, n) => addMonths(ym + '-01', n).slice(0, 7);
function faturaYm(k, data, retro) {
  let ym = data.slice(0, 7); const day = Number(data.slice(8, 10));
  if (day > k.dia_fechamento || (day === k.dia_fechamento && k.regra_fechamento === 'EXCLUSIVO')) ym = ymAdd(ym, 1);
  if (retro) while (closing(k, ym) < T) ym = ymAdd(ym, 1);
  return ym;
}
function faturasDe(S, kid) {
  const k = recOf(S, kid), map = new Map();
  const get = (ym) => {
    if (!map.has(ym)) { const f = closing(k, ym); map.set(ym, { id: `${kid}~${ym}`, recurso_id: kid, periodo_inicio: addDays(closing(k, ymAdd(ym, -1)), 1), periodo_fim: f, data_fechamento: f, data_vencimento: due(k, ym), parcelas: [], pagamentos: [] }); }
    return map.get(ym);
  };
  for (const l of S.lancamentos) for (const p of l.parcelas || []) {
    if (p.status === 'CANCELADA' || !p.fatura_id.startsWith(kid + '~')) continue;
    get(p.fatura_id.split('~')[1]).parcelas.push({ id: p.id, lancamento_id: l.id, descricao: l.descricao, numero: p.numero, total: p.total, valor: p.valor, data_compra: l.data_evento, credito: p.valor < 0 });
  }
  for (const pg of S.pagamentos) if (pg.fatura_id.startsWith(kid + '~')) get(pg.fatura_id.split('~')[1]).pagamentos.push(pg);
  get(faturaYm(k, T, true));
  return [...map.values()].map((f) => {
    const total = r2(f.parcelas.reduce((s, p) => s + p.valor, 0)), pago = r2(f.pagamentos.reduce((s, p) => s + p.valor, 0));
    let status;
    if (f.data_fechamento >= T) status = 'ABERTA';
    else if (pago >= total - 0.004) status = 'PAGA';
    else if (f.data_vencimento < T) status = 'VENCIDA';
    else if (pago > 0) status = 'PARCIALMENTE_PAGA';
    else status = 'FECHADA';
    return { ...f, valor_total: total, valor_pago: pago, valor_em_aberto: r2(Math.max(0, total - pago)), status };
  }).filter((f) => f.status === 'ABERTA' || f.valor_total !== 0).sort((a, b) => (a.data_fechamento < b.data_fechamento ? 1 : -1));
}
const resumoFat = ({ parcelas, pagamentos, ...f }) => f;
function saldo(S, id, { proj = false, ate = T } = {}) {
  let s = 0;
  for (const l of S.lancamentos) {
    if (l.status === 'CANCELADO') continue;
    const eff = l.status === 'EFETIVADO' || l.status === 'ESTORNADO';
    if (!eff && !proj) continue;
    for (const m of l.movimentacoes) {
      if (m.recurso_id !== id) continue;
      if (!proj && (m.data_efetivacao || l.data_evento) > ate) continue;
      s += m.natureza === 'CREDITO' ? m.valor : -m.valor;
    }
  }
  return r2(s);
}
function situacaoCartao(S, kid) {
  const k = recOf(S, kid), sal = saldo(S, kid, { ate: '9999-12-31' }), fs = faturasDe(S, kid);
  const comp = r2(Math.max(0, -sal));
  return {
    recurso_id: kid, nome: k.nome, limite: k.limite || 0, limite_comprometido: comp, limite_disponivel: r2(Math.max(0, (k.limite || 0) - comp)), credito_a_favor: r2(Math.max(0, sal)),
    fatura_aberta: resumoFat(fs.find((f) => f.status === 'ABERTA') || {}),
    faturas_a_pagar: fs.filter((f) => ['FECHADA', 'VENCIDA', 'PARCIALMENTE_PAGA'].includes(f.status)).map(resumoFat),
  };
}
function splitCents(total, n) { const c = Math.round(total * 100), b = Math.floor(c / n); return Array.from({ length: n }, (_, i) => (b + (i < c - b * n ? 1 : 0)) / 100); }
function parcelar(S, l, retro) {
  const k = recOf(S, l.recurso_id);
  if (!k || k.tipo !== 'CARTAO' || l.tipo !== 'SAIDA') return;
  const n = l.parcelas_total || 1, base = faturaYm(k, l.data_evento, retro);
  l.parcelas = splitCents(l.valor_total, n).map((v, i) => ({ id: nid('pc'), numero: i + 1, total: n, valor: v, fatura_id: `${k.id}~${ymAdd(base, i)}`, status: 'ATIVA' }));
}
function movs(l) {
  const eff = l.status === 'EFETIVADO' ? (l.data_efetivacao || l.data_evento) : null;
  const m = (recurso_id, natureza) => ({ id: nid('m'), recurso_id, natureza, valor: l.valor_total, data_efetivacao: eff });
  if (l.tipo === 'ENTRADA') return [m(l.recurso_id, 'CREDITO')];
  if (l.tipo === 'SAIDA') return [m(l.recurso_id, 'DEBITO')];
  return [m(l.origem_id, 'DEBITO'), m(l.destino_id, 'CREDITO')];
}
function audit(S, id, acao, mudancas = {}, quando = now()) { S.auditoria.push({ entidade_id: id, quando, quem: DB.usuario.nome || DB.usuario.email, acao, mudancas }); }

function criarLanc(S, p, { origem = 'MANUAL', retro = true, seed = false } = {}) {
  const tipo = p.tipo;
  if (!['ENTRADA', 'SAIDA', 'TRANSFERENCIA'].includes(tipo)) fail('Escolha entrada, saída ou transferência.');
  const bruto = r2(p.valor_bruto);
  if (!(bruto > 0)) fail('Informe um valor maior que zero.');
  if (!String(p.descricao || '').trim()) fail('Informe a descrição.');
  const desc = r2(p.descontos), acr = r2(p.acrescimos), enc = r2(p.encargos), total = r2(bruto - desc + acr + enc);
  if (total <= 0) fail('O total precisa ser maior que zero.');
  const data = (p.data_evento || T).slice(0, 10);
  let status = p.status || (data > T ? 'PLANEJADO' : 'EFETIVADO');
  if (status === 'EFETIVADO' && data > T) status = 'PLANEJADO';
  const l = { id: nid('l'), tipo, status, origem, data_evento: data, descricao: String(p.descricao).trim(), valor_bruto: bruto, descontos: desc, acrescimos: acr, encargos: enc, valor_total: total,
    categoria_id: tipo === 'TRANSFERENCIA' ? null : p.categoria_id || null, recurso_id: null, origem_id: null, destino_id: null, parcelas_total: 1, versao: 1,
    criado_em: seed ? data + 'T' + pad(8 + (DB.seq % 12)) + ':' + pad(DB.seq % 60) + ':00' : now(), recorrencia_id: p.recorrencia_id || null, fatura_id: p.fatura_id || null, estorno_de: null, estornado_por: null, motivo_estorno: null, itens: [], parcelas: [], movimentacoes: [] };
  if (tipo === 'TRANSFERENCIA') {
    const o = recOf(S, p.origem_id), d = recOf(S, p.destino_id);
    if (!o || !d) fail('Escolha a origem e o destino.');
    if (o.id === d.id) fail('Origem e destino precisam ser diferentes.');
    l.origem_id = o.id; l.destino_id = d.id;
  } else {
    const r = recOf(S, p.recurso_id);
    if (!r) fail(tipo === 'SAIDA' ? 'Escolha de onde sai o dinheiro.' : 'Escolha para onde vai o dinheiro.');
    if (r.status === 'INATIVO') fail('Este recurso está inativo.');
    if (tipo === 'ENTRADA' && r.tipo === 'CARTAO' && origem !== 'ESTORNO') fail('Entradas não vão para cartão.');
    l.recurso_id = r.id;
    if (r.tipo === 'CARTAO' && tipo === 'SAIDA') l.parcelas_total = Math.max(1, Math.min(48, Number(p.parcelas) || 1));
  }
  if (p.itens && p.itens.length) {
    l.itens = p.itens.map((i) => {
      const q = Number(i.quantidade) || 1, vt = r2(i.valor_total != null ? i.valor_total : q * (Number(i.valor_unitario) || 0));
      return { id: nid('it'), descricao: String(i.descricao || '').trim() || 'Item', quantidade: q, valor_unitario: r2(i.valor_unitario != null ? i.valor_unitario : vt / q), valor_total: vt, categoria_id: i.categoria_id || l.categoria_id, produto_id: i.produto_id || null };
    });
    const soma = r2(l.itens.reduce((s, i) => s + i.valor_total, 0));
    if (Math.abs(soma - bruto) > 0.009) fail('A soma dos itens (' + soma.toFixed(2).replace('.', ',') + ') precisa ser igual ao valor.');
  }
  if (status === 'EFETIVADO') { l.data_efetivacao = data; parcelar(S, l, retro); }
  l.movimentacoes = movs(l);
  S.lancamentos.push(l);
  if (!seed) audit(S, l.id, 'criado');
  return l;
}
const findL = (S, id) => S.lancamentos.find((l) => l.id === id) || fail('Lançamento não encontrado.');
function viewL(S, l, full = false) {
  const v = clone(l);
  v.movimentacoes = l.movimentacoes.map((m) => ({ recurso_id: m.recurso_id, natureza: m.natureza, valor: m.valor, data_efetivacao: m.data_efetivacao }));
  if (full) v.execucoes = execucoes(S, l);
  return v;
}

// consumo para categorias e planejamentos
const ancestors = (S, cid) => { const out = []; let c = S.categorias.find((x) => x.id === cid); while (c) { out.push(c.id); c = c.pai_id && S.categorias.find((x) => x.id === c.pai_id); } return out; };
const rootCat = (S, cid) => { const a = ancestors(S, cid); return a[a.length - 1] || null; };
function linhasConsumo(S, de, ate) {
  const out = [];
  for (const l of S.lancamentos) {
    if (l.data_evento < de || l.data_evento > ate) continue;
    let sign = 0;
    if (l.tipo === 'SAIDA' && (l.status === 'EFETIVADO' || l.status === 'ESTORNADO') && l.origem !== 'ESTORNO') sign = 1;
    if (l.origem === 'ESTORNO' && l.tipo === 'ENTRADA') sign = -1;
    if (!sign) continue;
    const consumo = l.valor_bruto - l.descontos + l.acrescimos;
    if (l.itens.length) l.itens.forEach((i) => out.push({ l, categoria_id: i.categoria_id, valor: sign * i.valor_total * consumo / l.valor_bruto, data: l.data_evento }));
    else out.push({ l, categoria_id: l.categoria_id, valor: sign * consumo, data: l.data_evento });
  }
  return out;
}
function planDe(S, linha) {
  const anc = ancestors(S, linha.categoria_id);
  let best = null;
  for (const p of S.planejamentos) {
    if (p.status !== 'ATIVO' || linha.data < p.data_inicio || (p.data_fim && linha.data > p.data_fim)) continue;
    const pc = p.categorias.find((c) => anc.includes(c.categoria_id));
    if (pc && (!best || p.prioridade < best.p.prioridade)) best = { p, pc };
  }
  return best;
}
function situacaoPlan(S, p) {
  const cats = p.categorias.map((c) => ({ categoria_id: c.categoria_id, nome: (S.categorias.find((x) => x.id === c.categoria_id) || {}).nome || '', limite: c.valor_limite || 0, percentual_execucao: c.percentual_execucao || 100, realizado: 0 }));
  for (const ln of linhasConsumo(S, p.data_inicio, p.data_fim || '9999-12-31')) {
    const b = planDe(S, ln);
    if (b && b.p.id === p.id) { const c = cats.find((x) => x.categoria_id === b.pc.categoria_id); c.realizado += ln.valor * (b.pc.percentual_execucao || 100) / 100; }
  }
  cats.forEach((c) => { c.realizado = r2(c.realizado); c.disponivel = r2(Math.max(0, c.limite - c.realizado)); c.excedido = r2(Math.max(0, c.realizado - c.limite)); });
  const real = r2(cats.reduce((s, c) => s + c.realizado, 0));
  return { id: p.id, nome: p.nome, data_inicio: p.data_inicio, data_fim: p.data_fim, prioridade: p.prioridade, status: p.status, versao: p.versao,
    planejado: p.valor_limite, realizado: real, disponivel: r2(Math.max(0, p.valor_limite - real)), excedido: r2(Math.max(0, real - p.valor_limite)), categorias: cats };
}
function execucoes(S, l) {
  const out = [];
  for (const ln of linhasConsumo(S, '0000', '9999').filter((x) => x.l.id === l.id)) { const b = planDe(S, ln); if (b) out.push({ planejamento_id: b.p.id, nome: b.p.nome, categoria_id: b.pc.categoria_id, valor: r2(ln.valor * (b.pc.percentual_execucao || 100) / 100) }); }
  return out;
}

// recorrências
function ocorrencias(r, ate) {
  const out = []; let d = r.data_inicial, i = 0;
  const fim = r.data_final && r.data_final < ate ? r.data_final : ate;
  while (d <= fim && i < 500) {
    out.push(d); i++;
    if (r.periodicidade === 'DIARIA') d = addDays(r.data_inicial, i);
    else if (r.periodicidade === 'SEMANAL') d = addDays(r.data_inicial, 7 * i);
    else if (r.periodicidade === 'A_CADA_N_DIAS') d = addDays(r.data_inicial, (r.intervalo || 1) * i);
    else if (r.periodicidade === 'ANUAL') d = addMonths(r.data_inicial, 12 * i);
    else d = addMonths(r.data_inicial, i);
  }
  return out;
}
function gerarRec(S, ate, seedPast = false) {
  let n = 0;
  for (const r of S.recorrencias) {
    if (r.status !== 'ATIVA') continue;
    for (const d of ocorrencias(r, ate)) {
      if (r.gerados.includes(d)) continue;
      r.gerados.push(d);
      const st = seedPast && d <= T ? 'EFETIVADO' : d <= T ? 'PENDENTE' : 'PLANEJADO';
      criarLanc(S, { tipo: r.tipo_lancamento, descricao: r.descricao, valor_bruto: r.valor, data_evento: d, status: st, recurso_id: r.recurso_id, origem_id: r.recurso_id, destino_id: r.recurso_destino_id, categoria_id: r.categoria_id, recorrencia_id: r.id }, { origem: 'RECORRENCIA', retro: false, seed: seedPast });
      n++;
    }
  }
  return n;
}
function pagarFatura(S, f, contaId, valor, data, seed) {
  const k = recOf(S, f.recurso_id);
  const l = criarLanc(S, { tipo: 'TRANSFERENCIA', descricao: 'Pagamento da fatura · ' + k.nome, valor_bruto: valor, data_evento: data, status: 'EFETIVADO', origem_id: contaId, destino_id: k.id, fatura_id: f.id }, { origem: 'PAGAMENTO_FATURA', seed });
  S.pagamentos.push({ id: nid('pg'), fatura_id: f.id, valor: r2(valor), data, recurso_id: contaId, lancamento_id: l.id });
  return l;
}

// ---------- produtos e preços ----------
// embalagem = número na unidade do produto (como no backend): "500 g" → { unidade: 'G', tam: 500 }; "1 L" → { 'ML', 1000 }; produto vendido por KG/L mantém a unidade
const tamNum = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return n > 0 ? n : null; };
function tamUn(un, txt) {
  if (un === 'KG' || un === 'L') return { unidade: un, tam: 1 };
  const m = /^\s*([\d.,]+)\s*(kg|g|l|ml|un)\s*$/i.exec(String(txt || '')); if (!m) return { unidade: un, tam: 1 };
  const n = tamNum(m[1]), u = m[2].toLowerCase();
  return u === 'kg' ? { unidade: 'G', tam: n * 1000 } : u === 'g' ? { unidade: 'G', tam: n } : u === 'l' ? { unidade: 'ML', tam: n * 1000 } : u === 'ml' ? { unidade: 'ML', tam: n } : { unidade: 'UN', tam: n };
}
const PRODUTOS = [
  ['Arroz tipo 1', 'Bom Grão', '789100010001', 'UN', '5 kg', 26.9, 'c_merc'], ['Feijão carioca', 'Bom Grão', '789100010002', 'UN', '1 kg', 8.49, 'c_merc'],
  ['Café torrado e moído', 'Serra Azul', '789100010003', 'UN', '500 g', 19.9, 'c_merc'], ['Leite integral', 'Vale Doce', '789100010004', 'UN', '1 L', 5.29, 'c_merc'],
  ['Açúcar cristal', 'Doce Lar', '789100010005', 'UN', '2 kg', 9.8, 'c_merc'], ['Óleo de soja', 'Campo Bom', '789100010006', 'UN', '900 ml', 7.49, 'c_merc'],
  ['Macarrão espaguete', 'Nonna Tina', '789100010007', 'UN', '500 g', 4.99, 'c_merc'], ['Molho de tomate', 'Horta Viva', '789100010008', 'UN', '340 g', 3.29, 'c_merc'],
  ['Ovos brancos', 'Granja Sol', '789100010009', 'UN', '12 un', 13.9, 'c_merc'], ['Pão de forma', 'Trigal', '789100010010', 'UN', '400 g', 8.99, 'c_pada'],
  ['Manteiga com sal', 'Vale Doce', '789100010011', 'UN', '200 g', 12.49, 'c_merc'], ['Queijo muçarela', 'Vale Doce', '789100010012', 'KG', '1 kg', 44.9, 'c_merc'],
  ['Banana prata', '', '', 'KG', '', 6.99, 'c_merc'], ['Tomate', '', '', 'KG', '', 8.49, 'c_merc'],
  ['Filé de frango', 'Campo Bom', '789100010015', 'UN', '1 kg', 21.9, 'c_merc'], ['Detergente neutro', 'Brilho', '789100010016', 'UN', '500 ml', 2.79, 'c_limp'],
  ['Sabão em pó', 'Brilho', '789100010017', 'UN', '1,6 kg', 18.9, 'c_limp'], ['Papel higiênico folha dupla', 'Macio', '789100010018', 'UN', '12 rolos', 21.5, 'c_hig'],
  ['Creme dental', 'Sorriso', '789100010019', 'UN', '90 g', 4.59, 'c_hig'], ['Ração para cães adultos', 'Patas', '789100010020', 'UN', '10 kg', 129.9, 'c_pets'],
  ['Água mineral sem gás', 'Fonte Clara', '789100010021', 'UN', '1,5 L', 2.99, 'c_merc'], ['Carvão vegetal', 'Brasa Boa', '789100010022', 'UN', '5 kg', 24.9, 'c_lazer'],
  ['Picanha bovina', '', '', 'KG', '', 79.9, 'c_merc'], ['Linguiça toscana', 'Campo Bom', '789100010024', 'KG', '1 kg', 22.9, 'c_merc'],
  ['Refrigerante de guaraná', 'Fresco', '789100010025', 'UN', '2 L', 8.49, 'c_merc'],
];
const LOJAS = [
  ['l_bp', 'Supermercado Bom Preço', '11222333000181', -1.4489, -48.4851, 1.0], ['l_ap', 'Atacado Popular', '22333444000172', -1.4169, -48.4526, 0.9],
  ['l_mb', 'Mercado do Bairro', '33444555000163', -1.4571, -48.4914, 1.07], ['l_fp', 'Feira da Pedreira', '', null, null, 0.86], ['l_hs', 'Hortifrúti Sol Nascente', '44555666000154', -1.4628, -48.4797, 0.94],
];
const PRODUCE = ['Banana prata', 'Tomate', 'Ovos brancos', 'Queijo muçarela', 'Picanha bovina'];

function seedCatalogo() {
  DB.catalogo = [{ gtin: gtin('789100010030'), nome: 'Biscoito recheado de chocolate', marca: 'Doce Lar', ...tamUn('UN', '130 g') ? { unidade: tamUn('UN', '130 g').unidade, tam_embalagem: tamUn('UN', '130 g').tam } : {} }, { gtin: gtin('789100010031'), nome: 'Achocolatado em pó', marca: 'Vale Doce', unidade: tamUn('UN', '400 g').unidade, tam_embalagem: tamUn('UN', '400 g').tam }];
  DB.lojasGlobais = [{ id: 'l_gl1', nome: 'Supermercado Litorâneo', cnpj: '55666777000145', cidade: 'Belém', uf: 'PA', latitude: -1.4402, longitude: -48.4721, global: true }];
  DB.obs = []; DB.imagens = {};
  const r = rng(7);
  PRODUTOS.forEach(([nome, , g, , , base]) => {
    if (!g) return;
    const code = gtin(g);
    [...LOJAS, ['l_gl1', 'Supermercado Litorâneo', '55666777000145', 0, 0, 0.93]].forEach(([, lnome, cnpj, , , k]) => {
      if (!cnpj || r() < 0.35) return;
      const st = r() < 0.55 ? 'validado' : 'observado', idade = Math.floor(r() * 26);
      DB.obs.push({ observacao_id: nid('ob'), gtin: code, cnpj, loja: { nome: lnome, cidade: 'Belém', uf: 'PA' }, preco: r2(base * k * (0.92 + r() * 0.1)), data: addDays(T, -idade), origem: st === 'validado' ? 'nfce' : 'manual', status: st, confirmacoes: st === 'validado' ? 2 + Math.floor(r() * 5) : Math.floor(r() * 2), discordancias: 0, minha: false, meu_voto: null, escondido: false });
    });
  });
  DB.obs.push({ observacao_id: nid('ob'), gtin: gtin('789100010003'), cnpj: '22333444000172', loja: { nome: 'Atacado Popular', cidade: 'Belém', uf: 'PA' }, preco: 4.99, data: addDays(T, -2), origem: 'manual', status: 'suspeito', confirmacoes: 0, discordancias: 1, minha: false, meu_voto: null, escondido: false });
  DB.obs.push({ observacao_id: nid('ob'), gtin: gtin('789100010003'), cnpj: '55666777000145', loja: { nome: 'Supermercado Litorâneo', cidade: 'Belém', uf: 'PA' }, preco: 16.49, data: addDays(T, -1), origem: 'nfce', status: 'validado', confirmacoes: 4, discordancias: 0, minha: false, meu_voto: null, escondido: false });
}

function seedCompras(S, r) {
  LOJAS.forEach(([id, nome, cnpj, lat, lng]) => S.lojas.push({ id, nome, cnpj: cnpj || null, cidade: 'Belém', uf: 'PA', latitude: lat, longitude: lng, status: 'ATIVA', versao: 1 }));
  PRODUTOS.forEach(([nome, marca, g, un0, tam0, base, cat], i) => { const { unidade: un, tam } = tamUn(un0, tam0); S.produtos.push({ id: 'p' + (i + 1), nome, marca: marca || null, gtin: g ? gtin(g) : null, unidade: un, tam_embalagem: tam, categoria_id: cat, status: 'ATIVO', versao: 1, global_id: g ? 'g' + (i + 1) : null, _base: base }); });
  for (const p of S.produtos) {
    const lojas = PRODUCE.includes(p.nome) ? ['l_fp', 'l_hs', 'l_bp'] : ['l_bp', 'l_mb', 'l_ap'];
    lojas.forEach((lid, j) => {
      if (j === 2 && r() < 0.4) return;
      const k = LOJAS.find((x) => x[0] === lid)[5];
      [-84, -52, -23, -6].forEach((dd, t) => { if (j > 0 && t % 2) return; S.precos.push({ id: nid('pr'), produto_id: p.id, loja_id: lid, preco: r2(p._base * k * (0.9 + t * 0.035 + r() * 0.03)), data: addDays(T, dd - Math.floor(r() * 3)), origem: t === 3 ? 'nfce' : 'sessao' }); });
    });
  }
  const P = (n) => S.produtos.find((p) => p.nome === n).id;
  const lista = (nome, itens, arquivada) => { const id = nid('li'); S.listas.push({ id, nome, status: arquivada ? 'ARQUIVADA' : 'ATIVA', criado_em: addDays(T, -9) + 'T09:00:00', atualizado_em: addDays(T, -1) + 'T18:20:00' }); itens.forEach(([d, q, c]) => S.listaItens.push({ id: nid('lx'), lista_id: id, produto_id: S.produtos.some((p) => p.nome === d) ? P(d) : null, descricao: d, quantidade: q, comprado: !!c })); return id; };
  S.listaItens = [];
  lista('Mercado da semana', [['Arroz tipo 1', 1], ['Feijão carioca', 2], ['Café torrado e moído', 2], ['Leite integral', 6], ['Ovos brancos', 1, true], ['Banana prata', 1.5], ['Tomate', 1], ['Detergente neutro', 3], ['Papel higiênico folha dupla', 1, true], ['Pão de forma', 2], ['Pilhas AA', 1], ['Queijo muçarela', 0.5]]);
  lista('Churrasco de sábado', [['Picanha bovina', 1.5], ['Linguiça toscana', 1], ['Carvão vegetal', 1], ['Refrigerante de guaraná', 3], ['Gelo em cubos 5 kg', 2]]);
  lista('Farmácia', [['Protetor solar FPS 50', 1], ['Vitamina C efervescente', 2]]);
  lista('Volta às aulas (janeiro)', [['Cadernos 10 matérias', 3]], true);
}

function seedCasa() {
  const S = baseSpace('ws_casa', 'Casa', 'admin');
  S.membros.push({ usuario_id: 'u_raf', email: 'rafael.prado@exemplo.com', nome: 'Rafael Prado', papel: 'editor' }, { usuario_id: 'u_lia', email: 'lia.prado@exemplo.com', nome: 'Lia Prado', papel: 'leitura' });
  const r = rng(42), start = addDays(monthStart(addMonths(T, -3)), -2);
  const R = (o) => { S.recursos.push({ status: 'ATIVO', versao: 1, versao_recurso: 1, ...o }); return o.id; };
  const cc = R({ id: 'r_cc', tipo: 'CONTA', nome: 'Conta corrente', instituicao: 'Banco Aurora', tipo_conta: 'CORRENTE', agencia: '0412', numero: '38127-4', saldo_inicial: 3200, data_saldo_inicial: start });
  const pp = R({ id: 'r_pp', tipo: 'CONTA', nome: 'Poupança da família', instituicao: 'Cooperativa Rio Verde', tipo_conta: 'POUPANCA', saldo_inicial: 8500, data_saldo_inicial: start });
  const ct = R({ id: 'r_ct', tipo: 'CARTEIRA', nome: 'Dinheiro na carteira', saldo_inicial: 180, data_saldo_inicial: start });
  const k1 = R({ id: 'r_k1', tipo: 'CARTAO', nome: 'Cartão Aurora', instituicao: 'Banco Aurora', bandeira: 'Mastercard', final: '4821', limite: 6000, dia_fechamento: 3, dia_vencimento: 10, regra_fechamento: 'INCLUSIVO', recurso_pagamento_id: cc, anuidade: 0, taxa_juros: 12.9 });
  const k2 = R({ id: 'r_k2', tipo: 'CARTAO', nome: 'Cartão Litoral Mais Internacional Platinum', instituicao: 'Banco Litoral', bandeira: 'Visa', final: '0937', limite: 4500, dia_fechamento: 25, dia_vencimento: 5, regra_fechamento: 'INCLUSIVO', recurso_pagamento_id: cc, anuidade: 39.9, taxa_juros: 14.5 });
  const k3 = R({ id: 'r_k3', tipo: 'CARTAO', nome: 'Cartão virtual', instituicao: 'Banco Aurora', bandeira: 'Elo', final: '1156', limite: 0, dia_fechamento: 15, dia_vencimento: 22, regra_fechamento: 'EXCLUSIVO', recurso_pagamento_id: cc });
  [[cc, 3200], [pp, 8500], [ct, 180]].forEach(([id, v]) => criarLanc(S, { tipo: 'ENTRADA', descricao: 'Saldo inicial', valor_bruto: v, data_evento: start, status: 'EFETIVADO', recurso_id: id }, { origem: 'SALDO_INICIAL', seed: true }));
  seedCompras(S, r);
  const ini = monthStart(addMonths(T, -3));
  const rec = (o) => { const x = { id: nid('rc'), status: 'ATIVA', intervalo: null, data_final: null, recurso_destino_id: null, gerados: [], versao: 1, ...o }; S.recorrencias.push(x); return x; };
  rec({ tipo_lancamento: 'ENTRADA', descricao: 'Salário Ana', valor: 6200, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '05', recurso_id: cc, categoria_id: 'c_sal' });
  rec({ tipo_lancamento: 'ENTRADA', descricao: 'Salário Rafael', valor: 4300, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '20', recurso_id: cc, categoria_id: 'c_sal' });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Aluguel', valor: 2100, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '08', recurso_id: cc, categoria_id: 'c_alug' });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Internet fibra 500 mega', valor: 119.9, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '12', recurso_id: k1, categoria_id: 'c_net' });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Streaming de filmes', valor: 39.9, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '03', recurso_id: k2, categoria_id: 'c_assin' });
  rec({ tipo_lancamento: 'TRANSFERENCIA', descricao: 'Guardar na poupança', valor: 800, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '06', recurso_id: cc, recurso_destino_id: pp });
  rec({ tipo_lancamento: 'TRANSFERENCIA', descricao: 'Saque para despesas do dia a dia', valor: 300, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '02', recurso_id: cc, recurso_destino_id: ct });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Plano de saúde familiar', valor: 689.5, periodicidade: 'MENSAL', data_inicial: ini.slice(0, 8) + '15', recurso_id: cc, categoria_id: 'c_plano' });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Ração do Thor', valor: 129.9, periodicidade: 'A_CADA_N_DIAS', intervalo: 25, data_inicial: addDays(ini, 4), recurso_id: k1, categoria_id: 'c_pets', status: 'PAUSADA' });
  rec({ tipo_lancamento: 'SAIDA', descricao: 'Revisão anual do carro', valor: 780, periodicidade: 'ANUAL', data_inicial: addMonths(T, 2), recurso_id: k2, categoria_id: 'c_manut' });
  gerarRec(S, T, true);
  // gastos variáveis
  const S_ = (o) => criarLanc(S, { status: 'EFETIVADO', ...o }, { retro: false, seed: true });
  const merc = S.produtos.filter((p) => !['Ração para cães adultos', 'Carvão vegetal', 'Picanha bovina'].includes(p.nome));
  for (let d = addDays(start, 3); d <= T; d = addDays(d, 7 + Math.floor(r() * 2))) {
    const n = 4 + Math.floor(r() * 4), its = [];
    for (let i = 0; i < n; i++) { const p = merc[Math.floor(r() * merc.length)]; if (its.some((x) => x.produto_id === p.id)) continue; const q = 1 + Math.floor(r() * 3); its.push({ descricao: p.nome, quantidade: q, valor_unitario: r2(p._base * (0.95 + r() * 0.1)), produto_id: p.id, categoria_id: p.categoria_id }); }
    its.forEach((i) => { i.valor_total = r2(i.quantidade * i.valor_unitario); });
    S_({ tipo: 'SAIDA', descricao: r() < 0.6 ? 'Supermercado Bom Preço' : 'Mercado do Bairro', valor_bruto: r2(its.reduce((s, i) => s + i.valor_total, 0)), data_evento: d, recurso_id: k1, categoria_id: 'c_merc', itens: its });
  }
  for (let d = addDays(start, 1); d <= T; d = addDays(d, 3 + Math.floor(r() * 4))) S_({ tipo: 'SAIDA', descricao: 'Padaria Trigo de Ouro', valor_bruto: r2(14 + r() * 22), data_evento: d, recurso_id: ct, categoria_id: 'c_pada' });
  for (let d = addDays(start, 5); d <= T; d = addDays(d, 13 + Math.floor(r() * 4))) S_({ tipo: 'SAIDA', descricao: 'Posto Avenida', valor_bruto: r2(180 + r() * 90), data_evento: d, recurso_id: k2, categoria_id: 'c_comb' });
  for (let d = addDays(start, 9); d <= T; d = addDays(d, 9 + Math.floor(r() * 8))) S_({ tipo: 'SAIDA', descricao: ['Restaurante Sabor da Terra', 'Pizzaria Forno a Lenha', 'Açaí da Esquina'][Math.floor(r() * 3)], valor_bruto: r2(55 + r() * 130), data_evento: d, recurso_id: k1, categoria_id: 'c_rest' });
  for (let d = addDays(start, 11); d <= T; d = addDays(d, 17 + Math.floor(r() * 8))) S_({ tipo: 'SAIDA', descricao: 'Farmácia Vida', valor_bruto: r2(40 + r() * 110), data_evento: d, recurso_id: k2, categoria_id: 'c_farm' });
  for (let m = -3; m <= 0; m++) { const d = monthStart(addMonths(T, m)).slice(0, 8) + '16'; if (d <= T) S_({ tipo: 'SAIDA', descricao: 'Conta de energia', valor_bruto: r2(185 + r() * 80), data_evento: d, recurso_id: cc, categoria_id: 'c_ener' }); }
  for (let m = -3; m <= -1; m++) { const d = monthStart(addMonths(T, m)).slice(0, 8) + '10'; S_({ tipo: 'SAIDA', descricao: 'Condomínio', valor_bruto: 640, data_evento: d, recurso_id: cc, categoria_id: 'c_cond' }); S_({ tipo: 'SAIDA', descricao: 'Conta de água', valor_bruto: r2(82 + r() * 20), data_evento: addDays(d, 3), recurso_id: cc, categoria_id: 'c_agua' }); }
  for (let d = addDays(start, 20); d <= T; d = addDays(d, 12 + Math.floor(r() * 10))) S_({ tipo: 'SAIDA', descricao: 'Corrida por aplicativo', valor_bruto: r2(14 + r() * 26), data_evento: d, recurso_id: k1, categoria_id: 'c_app' });
  S_({ tipo: 'SAIDA', descricao: 'Geladeira frost free 400 L', valor_bruto: 3890, parcelas: 10, data_evento: addDays(monthStart(addMonths(T, -2)), 13), recurso_id: k1, categoria_id: 'c_casa' });
  S_({ tipo: 'SAIDA', descricao: 'Notebook para os estudos da Lia', valor_bruto: 2400, parcelas: 6, data_evento: addDays(monthStart(addMonths(T, -1)), 1), recurso_id: k2, categoria_id: 'c_edu', encargos: 0 });
  S_({ tipo: 'SAIDA', descricao: 'Presente de aniversário da vovó Lurdes — cesta de café da manhã com entrega', valor_bruto: 189.9, descontos: 10, data_evento: addDays(T, -12), recurso_id: k1, categoria_id: 'c_pres' });
  S_({ tipo: 'SAIDA', descricao: 'Aplicativo de fotos — plano anual', valor_bruto: 59.9, data_evento: addDays(T, -20), recurso_id: k3, categoria_id: 'c_assin' });
  S_({ tipo: 'SAIDA', descricao: 'Boliche com as crianças', valor_bruto: 96, data_evento: T > monthStart(T) ? addDays(T, -1) : T, recurso_id: k1, categoria_id: 'c_lazer' });
  S_({ tipo: 'SAIDA', descricao: 'Cinema e pipoca', valor_bruto: 128, data_evento: T > monthStart(T) ? addDays(T, -1) : T, recurso_id: k1, categoria_id: 'c_lazer' });
  S_({ tipo: 'SAIDA', descricao: 'Ingressos do parque aquático', valor_bruto: 360, data_evento: addDays(T, -15), recurso_id: k2, categoria_id: 'c_lazer' });
  S_({ tipo: 'ENTRADA', descricao: 'Venda do carro antigo', valor_bruto: 48750, data_evento: addDays(monthStart(addMonths(T, -2)), 18), recurso_id: pp, categoria_id: 'c_vendas' });
  S_({ tipo: 'ENTRADA', descricao: 'Projeto de ilustração', valor_bruto: 1500, data_evento: addDays(monthStart(addMonths(T, -1)), 22), recurso_id: cc, categoria_id: 'c_free' });
  S_({ tipo: 'ENTRADA', descricao: 'Rendimento da poupança', valor_bruto: 61.37, data_evento: monthStart(T), recurso_id: pp, categoria_id: 'c_rend' });
  S_({ tipo: 'TRANSFERENCIA', descricao: 'Saque para a feira', valor_bruto: 150, data_evento: addDays(T, -9), origem_id: cc, destino_id: ct });
  // estorno
  const tenis = S_({ tipo: 'SAIDA', descricao: 'Tênis de corrida', valor_bruto: 459.9, data_evento: addDays(T, -18), recurso_id: k1, categoria_id: 'c_vest' });
  estornar(S, tenis, 'Produto devolvido na loja', addDays(T, -14), true);
  // pendentes e planejados
  criarLanc(S, { tipo: 'SAIDA', descricao: 'Conta de água', valor_bruto: 96.3, data_evento: addDays(T, -4), status: 'PENDENTE', recurso_id: cc, categoria_id: 'c_agua' }, { seed: true });
  criarLanc(S, { tipo: 'SAIDA', descricao: 'Condomínio', valor_bruto: 640, data_evento: addDays(T, -1), status: 'PENDENTE', recurso_id: cc, categoria_id: 'c_cond' }, { seed: true });
  criarLanc(S, { tipo: 'SAIDA', descricao: 'IPTU — parcela 8 de 10', valor_bruto: 186.4, data_evento: addDays(T, 12), recurso_id: cc, categoria_id: 'c_tarifa' }, { seed: true });
  criarLanc(S, { tipo: 'SAIDA', descricao: 'Mensalidade da natação', valor_bruto: 230, data_evento: addDays(T, 3), recurso_id: cc, categoria_id: 'c_lazer' }, { seed: true });
  criarLanc(S, { tipo: 'ENTRADA', descricao: 'Reembolso do plano de saúde', valor_bruto: 420, data_evento: addDays(T, 6), recurso_id: cc, categoria_id: 'c_reemb' }, { seed: true });
  const show = criarLanc(S, { tipo: 'SAIDA', descricao: 'Show no estádio', valor_bruto: 520, data_evento: addDays(T, 20), recurso_id: k1, categoria_id: 'c_lazer' }, { seed: true });
  show.status = 'CANCELADO';
  // pagamentos de faturas
  for (const kid of [k1, k2]) {
    const fs = faturasDe(S, kid).filter((f) => f.status !== 'ABERTA' && f.data_vencimento < T).reverse();
    fs.forEach((f, i) => { const last = i === fs.length - 1; const v = kid === k2 && last ? r2(f.valor_total * 0.4) : f.valor_total; if (v > 0) pagarFatura(S, f, cc, v, f.data_vencimento, true); });
  }
  // planejamentos
  const mi = monthStart(T), mf = monthEnd(T);
  S.planejamentos.push({ id: 'pl1', nome: 'Mercado e casa', data_inicio: mi, data_fim: mf, valor_limite: 1800, prioridade: 1, status: 'ATIVO', versao: 1, categorias: [{ categoria_id: 'c_alim', valor_limite: 1400, percentual_execucao: 100 }, { categoria_id: 'c_casa', valor_limite: 400, percentual_execucao: 100 }] });
  S.planejamentos.push({ id: 'pl2', nome: 'Lazer e passeios', data_inicio: mi, data_fim: mf, valor_limite: 180, prioridade: 2, status: 'ATIVO', versao: 1, categorias: [{ categoria_id: 'c_lazer', valor_limite: 150, percentual_execucao: 100 }, { categoria_id: 'c_pres', valor_limite: 30, percentual_execucao: 100 }] });
  S.planejamentos.push({ id: 'pl3', nome: 'Transporte', data_inicio: mi, data_fim: mf, valor_limite: 750, prioridade: 3, status: 'ATIVO', versao: 1, categorias: [{ categoria_id: 'c_transp', valor_limite: 750, percentual_execucao: 100 }] });
  S.planejamentos.push({ id: 'pl4', nome: 'Saúde do ano', data_inicio: T.slice(0, 4) + '-01-01', data_fim: T.slice(0, 4) + '-12-31', valor_limite: 9600, prioridade: 4, status: 'ATIVO', versao: 1, categorias: [{ categoria_id: 'c_saude', valor_limite: 9600, percentual_execucao: 100 }] });
  // histórico de um lançamento
  const ex = S.lancamentos.filter((l) => l.descricao === 'Supermercado Bom Preço').slice(-1)[0];
  if (ex) { S.auditoria.push({ entidade_id: ex.id, quando: ex.criado_em, quem: 'Rafael Prado', acao: 'criado', mudancas: {} }, { entidade_id: ex.id, quando: addDays(ex.data_evento, 1) + 'T21:14:00', quem: 'Ana Prado', acao: 'atualizado', mudancas: { descricao: ['Mercado', 'Supermercado Bom Preço'] } }); ex.versao = 2; }
  return S;
}
function seedPraia() {
  const S = baseSpace('ws_praia', 'Apartamento da praia', 'leitura');
  S.recursos.push({ id: 'rp_cc', tipo: 'CONTA', nome: 'Conta do condomínio da praia', instituicao: 'Banco Litoral', tipo_conta: 'CORRENTE', status: 'ATIVO', versao: 1, saldo_inicial: 1200 });
  criarLanc(S, { tipo: 'ENTRADA', descricao: 'Saldo inicial', valor_bruto: 1200, data_evento: addDays(T, -60), status: 'EFETIVADO', recurso_id: 'rp_cc' }, { origem: 'SALDO_INICIAL', seed: true });
  criarLanc(S, { tipo: 'ENTRADA', descricao: 'Aluguel de temporada', valor_bruto: 2600, data_evento: addDays(T, -20), recurso_id: 'rp_cc', categoria_id: 'c_vendas' }, { seed: true });
  criarLanc(S, { tipo: 'SAIDA', descricao: 'Faxina após hóspedes', valor_bruto: 180, data_evento: addDays(T, -18), recurso_id: 'rp_cc', categoria_id: 'c_limp' }, { seed: true });
  criarLanc(S, { tipo: 'SAIDA', descricao: 'Energia do apartamento', valor_bruto: 142.8, data_evento: addDays(T, 5), recurso_id: 'rp_cc', categoria_id: 'c_ener' }, { seed: true });
  return S;
}
function seed() {
  DB = { seq: 0, usuario: { id: 'u_ana', email: 'ana.prado@exemplo.com', nome: 'Ana Prado', papel_plataforma: 'admin' }, spaces: [], rids: {}, logado: false, banco: true };
  seedCatalogo();
  DB.spaces.push(seedCasa(), seedPraia());
  DB.reputacao = { pontos: 14, nivel: 'novo', observacoes: 23, validadas: 15, rejeitadas: 1 };
  DB.admin = {
    cadastro_aberto: true,
    usuarios: [{ email: 'ana.prado@exemplo.com', nome: 'Ana Prado', ativo: true, papel: 'admin', nivel: 'confiavel' }, { email: 'rafael.prado@exemplo.com', nome: 'Rafael Prado', ativo: true, papel: 'usuario', nivel: 'novo' }, { email: 'joao.silva@exemplo.com', nome: 'João Silva', ativo: true, papel: 'usuario', nivel: 'novo' }],
    denuncias: [
      { alvo_tipo: 'preco', alvo_id: DB.obs[DB.obs.length - 2].observacao_id, resumo: 'Café torrado e moído · R$ 4,99 · Atacado Popular', pessoas: 3, motivos: ['Preço impossível', 'Era outro produto', 'Promoção já acabou'], status_atual: 'em_revisao' },
      { alvo_tipo: 'produto', alvo_id: 'g99', resumo: 'Produto "OFERTA IMPERDIVEL CLIQUE"', pessoas: 2, motivos: ['Nome com propaganda', 'Spam'], status_atual: 'visivel' },
      { alvo_tipo: 'imagem', alvo_id: gtin('789100010016'), resumo: 'Foto de Detergente neutro', pessoas: 1, motivos: ['Foto de outro produto'], status_atual: 'visivel' },
    ],
    repetidos: [{ chave: 'Leite integral 1 L', itens: [{ id: 'g4', nome: 'Leite integral', marca: 'Vale Doce', gtin: gtin('789100010004') }, { id: 'g88', nome: 'LEITE INTEGRAL VALE DOCE 1L', marca: 'Vale Doce', gtin: '7891000100880' }] }],
    imagens: [{ gtin: gtin('789100010016'), produto: 'Detergente neutro', ativa: true }],
  };
  seedConvites();
  save();
}

function seedConvites() {
  const casa = DB.spaces.find((s) => s.id === 'ws_casa');
  casa.convites = [
    { id: 'cv_e1', espaco_id: 'ws_casa', espaco_nome: 'Casa', email: 'tio.marcos@exemplo.com', papel: 'editor', status: 'PENDENTE', convidado_por_nome: 'Ana Prado', expira_em: addDays(T, 9), respondido_em: null, criado_em: addDays(T, -5) + 'T14:10:00' },
    { id: 'cv_e2', espaco_id: 'ws_casa', espaco_nome: 'Casa', email: 'bruno.lima@exemplo.com', papel: 'leitura', status: 'PENDENTE', convidado_por_nome: 'Ana Prado', expira_em: addDays(T, -1), respondido_em: null, criado_em: addDays(T, -15) + 'T09:30:00' },
    { id: 'cv_e3', espaco_id: 'ws_casa', espaco_nome: 'Casa', email: 'carla.souza@exemplo.com', papel: 'editor', status: 'ACEITO', convidado_por_nome: 'Ana Prado', expira_em: addDays(T, -3), respondido_em: addDays(T, -6) + 'T20:00:00', criado_em: addDays(T, -10) + 'T11:00:00' },
    { id: 'cv_e4', espaco_id: 'ws_casa', espaco_nome: 'Casa', email: 'dido.antigo@exemplo.com', papel: 'leitura', status: 'RECUSADO', convidado_por_nome: 'Ana Prado', expira_em: addDays(T, -20), respondido_em: addDays(T, -25) + 'T08:00:00', criado_em: addDays(T, -28) + 'T08:00:00' },
  ];
  const sitio = baseSpace('ws_sitio', 'Sítio dos Prado', 'editor');
  sitio.membros = [{ usuario_id: 'u_raf', email: 'rafael.prado@exemplo.com', nome: 'Rafael Prado', papel: 'admin' }];
  sitio.recursos.push({ id: 'rs_cc', tipo: 'CONTA', nome: 'Conta do sítio', instituicao: 'Banco Aurora', tipo_conta: 'CORRENTE', status: 'ATIVO', versao: 1, versao_recurso: 1, saldo_inicial: 900 });
  criarLanc(sitio, { tipo: 'ENTRADA', descricao: 'Saldo inicial', valor_bruto: 900, data_evento: addDays(T, -40), status: 'EFETIVADO', recurso_id: 'rs_cc' }, { origem: 'SALDO_INICIAL', seed: true });
  const viagem = baseSpace('ws_viagem', 'Rateio da viagem', 'leitura');
  viagem.membros = [{ usuario_id: 'u_mar', email: 'marina.alves@exemplo.com', nome: 'Marina Alves', papel: 'admin' }];
  DB.spacesConvite = { ws_sitio: sitio, ws_viagem: viagem };
  DB.convitesRecebidos = [
    { id: 'cv_r1', espaco_id: 'ws_sitio', espaco_nome: 'Sítio dos Prado', email: DB.usuario.email, papel: 'editor', status: 'PENDENTE', convidado_por_nome: 'Rafael Prado', expira_em: addDays(T, 11), respondido_em: null, criado_em: addDays(T, -0) + 'T08:05:00' },
    { id: 'cv_r2', espaco_id: 'ws_viagem', espaco_nome: 'Rateio da viagem', email: DB.usuario.email, papel: 'leitura', status: 'PENDENTE', convidado_por_nome: 'Marina Alves', expira_em: addDays(T, 2), respondido_em: null, criado_em: addDays(T, -1) + 'T16:40:00' },
  ];
  DB.notificacoes = [
    { id: 'nt1', tipo: 'CONVITE_RECEBIDO', titulo: 'Convite para o espaço Sítio dos Prado', texto: 'Rafael Prado convidou você como editor.', lida: false, ref_id: 'cv_r1', espaco_id: 'ws_sitio', criada_em: addDays(T, -0) + 'T08:05:00' },
    { id: 'nt2', tipo: 'CONVITE_RECEBIDO', titulo: 'Convite para o espaço Rateio da viagem', texto: 'Marina Alves convidou você como leitura.', lida: false, ref_id: 'cv_r2', espaco_id: 'ws_viagem', criada_em: addDays(T, -1) + 'T16:40:00' },
    { id: 'nt3', tipo: 'PAPEL_ALTERADO', titulo: 'Seu papel mudou', texto: 'Agora você é editor no espaço Apartamento da praia.', lida: false, ref_id: null, espaco_id: 'ws_praia', criada_em: addDays(T, -2) + 'T12:30:00' },
    { id: 'nt4', tipo: 'CONVITE_ACEITO', titulo: 'Convite aceito', texto: 'Carla Souza aceitou seu convite para o espaço Casa.', lida: true, ref_id: 'cv_e3', espaco_id: 'ws_casa', criada_em: addDays(T, -6) + 'T20:00:00' },
    { id: 'nt5', tipo: 'CONVITE_RECUSADO', titulo: 'Convite recusado', texto: 'Dido não aceitou seu convite para o espaço Casa.', lida: true, ref_id: 'cv_e4', espaco_id: 'ws_casa', criada_em: addDays(T, -25) + 'T08:00:00' },
    { id: 'nt6', tipo: 'LANCAMENTO_MEMBRO', titulo: 'Rafael Prado fez 3 lançamentos em Casa', texto: 'O último: Farmácia, R$ 48,90.', lida: false, ref_id: 'lanc:u_raf:ws_casa', espaco_id: 'ws_casa', criada_em: T + 'T10:20:00' },
    { id: 'nt7', tipo: 'FATURA_VENCENDO', titulo: 'Fatura Cartão Aurora vence em 2 dias', texto: 'Pague até o vencimento para evitar juros.', lida: false, ref_id: 'fat:r_k1', espaco_id: 'ws_casa', criada_em: T + 'T06:00:00' },
    { id: 'nt8', tipo: 'RESERVA_80', titulo: 'Lazer e passeios chegou a 80%', texto: 'Você já usou 80% do limite desta reserva.', lida: false, ref_id: 'res:pl2:80:180', espaco_id: 'ws_casa', criada_em: T + 'T06:00:00' },
    { id: 'nt9', tipo: 'QUEDA_PRECO', titulo: 'Café torrado e moído 15% mais barato', texto: 'R$ 16,90 em outra loja; você costuma pagar R$ 19,90.', lida: false, ref_id: 'prec:p3:16.9:' + addDays(T, -1), espaco_id: 'ws_casa', criada_em: addDays(T, -1) + 'T06:00:00' },
    { id: 'nt10', tipo: 'RESERVA_100', titulo: 'Transporte chegou ao limite', texto: 'A reserva usou 100% do valor planejado.', lida: true, ref_id: 'res:pl3:100:750', espaco_id: 'ws_casa', criada_em: addDays(T, -3) + 'T06:00:00' },
    { id: 'nt11', tipo: 'LANCAMENTO_MEMBRO', titulo: 'Lia Prado lançou uma despesa em Apartamento da praia', texto: 'Condomínio, R$ 650,00.', lida: true, ref_id: 'lanc:u_lia:ws_praia', espaco_id: 'ws_praia', criada_em: addDays(T, -4) + 'T19:10:00' },
  ];
}

// ---------- relatórios ----------
function painel(S, de, ate) {
  const contas = S.recursos.filter((x) => x.tipo !== 'CARTAO' && x.status !== 'INATIVO'), cards = S.recursos.filter((x) => x.tipo === 'CARTAO' && x.status !== 'INATIVO');
  const onde = contas.map((c) => ({ recurso_id: c.id, nome: c.nome, tipo: c.tipo, saldo: saldo(S, c.id) }));
  const cs = cards.map((k) => { const s = situacaoCartao(S, k.id); return { recurso_id: k.id, nome: k.nome, limite: s.limite, comprometido: s.limite_comprometido, disponivel: s.limite_disponivel }; });
  const fl = fluxo(S, addDays(T, 30)), lines = linhasConsumo(S, de, ate);
  const porCat = {};
  lines.forEach((l) => { const rc = rootCat(S, l.categoria_id) || '_'; porCat[rc] = (porCat[rc] || 0) + l.valor; });
  const gasto = r2(lines.reduce((s, l) => s + l.valor, 0)), rec = receitas(S, de, ate);
  return {
    quanto_tenho: r2(onde.reduce((s, x) => s + x.saldo, 0)), onde_esta: onde, comprometido_nos_cartoes: r2(cs.reduce((s, x) => s + x.comprometido, 0)), cartoes: cs,
    limite_disponivel_total: r2(cs.reduce((s, x) => s + x.disponivel, 0)), a_pagar: fl.a_pagar, a_receber: fl.a_receber,
    patrimonio_liquido: r2(S.recursos.reduce((s, x) => s + saldo(S, x.id), 0)), gasto_no_periodo: gasto, resultado_no_periodo: r2(rec - gasto),
    gasto_por_categoria: Object.entries(porCat).map(([id, v]) => ({ categoria_id: id === '_' ? null : id, nome: id === '_' ? 'Sem categoria' : S.categorias.find((c) => c.id === id).nome, valor: r2(v) })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor),
    planejamentos: S.planejamentos.filter((p) => p.status === 'ATIVO' && p.data_inicio <= ate && (!p.data_fim || p.data_fim >= de)).map((p) => situacaoPlan(S, p)),
  };
}
function receitas(S, de, ate, porCat) {
  let t = 0;
  for (const l of S.lancamentos) {
    if (l.data_evento < de || l.data_evento > ate || !['EFETIVADO', 'ESTORNADO'].includes(l.status) && l.origem !== 'ESTORNO') continue;
    if (l.status !== 'EFETIVADO' && l.status !== 'ESTORNADO') continue;
    let v = 0;
    if (l.tipo === 'ENTRADA' && !['SALDO_INICIAL', 'ESTORNO'].includes(l.origem)) v = l.valor_total;
    if (l.tipo === 'SAIDA' && l.origem === 'ESTORNO') v = -l.valor_total;
    if (!v) continue;
    t += v;
    if (porCat) { const rc = rootCat(S, l.categoria_id) || '_'; porCat[rc] = (porCat[rc] || 0) + v; }
  }
  return r2(t);
}
const encargos = (S, de, ate) => r2(S.lancamentos.filter((l) => l.data_evento >= de && l.data_evento <= ate && l.status === 'EFETIVADO').reduce((s, l) => s + (l.encargos || 0), 0));
function fluxo(S, ate) {
  const itens = [];
  for (const l of S.lancamentos) {
    if (!['PLANEJADO', 'PENDENTE'].includes(l.status) || l.data_evento > ate || l.tipo === 'TRANSFERENCIA') continue;
    const r = recOf(S, l.recurso_id);
    if (r && r.tipo === 'CARTAO') continue;
    itens.push({ id: l.id, data: l.data_evento, tipo: l.tipo === 'ENTRADA' ? 'RECEBER' : 'PAGAR', origem: 'LANCAMENTO', descricao: l.descricao, valor: l.valor_total, atrasado: l.data_evento < T, recurso_id: l.recurso_id, status: l.status });
  }
  for (const k of S.recursos.filter((x) => x.tipo === 'CARTAO' && x.status !== 'INATIVO')) for (const f of faturasDe(S, k.id)) {
    if (f.data_vencimento > ate) continue;
    const v = f.status === 'ABERTA' ? f.valor_total - f.valor_pago : f.valor_em_aberto;
    if (v <= 0) continue;
    itens.push({ id: f.id, data: f.data_vencimento, tipo: 'PAGAR', origem: 'FATURA', descricao: 'Fatura · ' + k.nome, valor: r2(v), atrasado: f.data_vencimento < T, recurso_id: k.id, status: f.status });
  }
  itens.sort((a, b) => (a.data < b.data ? -1 : 1));
  return { a_pagar: r2(itens.filter((i) => i.tipo === 'PAGAR').reduce((s, i) => s + i.valor, 0)), a_receber: r2(itens.filter((i) => i.tipo === 'RECEBER').reduce((s, i) => s + i.valor, 0)), itens };
}

// ---------- compras ----------
const prodOf = (S, id) => S.produtos.find((p) => p.id === id);
const lojaOf = (S, id) => S.lojas.find((l) => l.id === id) || DB.lojasGlobais.find((l) => l.id === id);
function precoEm(S, pid, lid) {
  const p = prodOf(S, pid), l = lojaOf(S, lid);
  if (!p || !l) return null;
  const mine = S.precos.filter((x) => x.produto_id === pid && x.loja_id === lid).sort((a, b) => (a.data < b.data ? 1 : -1))[0];
  const sh = p.gtin && l.cnpj ? DB.obs.filter((o) => o.gtin === p.gtin && o.cnpj === l.cnpj && ['observado', 'validado'].includes(o.status) && !o.escondido).sort((a, b) => (a.data < b.data ? 1 : -1))[0] : null;
  if (mine && (!sh || mine.data >= sh.data)) return { preco: mine.preco, fonte: 'MEU', data: mine.data };
  if (sh) return { preco: sh.preco, fonte: 'COMPARTILHADO', data: sh.data };
  return null;
}
const ultimoPago = (S, pid) => S.precos.filter((x) => x.produto_id === pid).sort((a, b) => (a.data < b.data ? 1 : -1))[0] || null;
const viewProd = (S, p) => { const { _base, ...v } = p; const u = ultimoPago(S, p.id); return { ...v, tem_imagem: !!DB.imagens[p.id] || !!(p.gtin && DB.imagens['g:' + p.gtin]), ultimo_preco: u ? u.preco : null, ultimo_preco_data: u ? u.data : null }; };
const hav = (a, b, c, d) => { const R = 6371, t = (x) => x * Math.PI / 180; const x = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function listaView(S, li) {
  const its = S.listaItens.filter((i) => i.lista_id === li.id);
  return { ...li, itens: its.length, comprados: its.filter((i) => i.comprado).length };
}
function comparar(S, p) {
  const li = S.listas.find((l) => l.id === p.lista_id) || fail('Lista não encontrada.');
  const its = S.listaItens.filter((i) => i.lista_id === li.id && !i.comprado);
  if (!its.length) fail('A lista não tem itens pendentes.');
  const cfg = S.config, lat = p.latitude ?? cfg.casa_latitude, lng = p.longitude ?? cfg.casa_longitude;
  let lojas = S.lojas.filter((l) => l.status !== 'INATIVA');
  if (p.incluir_compartilhadas !== false) lojas = lojas.concat(DB.lojasGlobais);
  if (p.loja_ids && p.loja_ids.length) lojas = lojas.filter((l) => p.loja_ids.includes(l.id));
  const best = (it) => { let b = null; for (const l of lojas) { const x = it.produto_id && precoEm(S, it.produto_id, l.id); if (x && (!b || x.preco < b.preco)) b = { ...x, loja_id: l.id }; } return b; };
  const out = lojas.map((l) => {
    let conh = 0, est = 0, n = 0; const falt = [], itens = [];
    its.forEach((it) => {
      const x = it.produto_id && precoEm(S, it.produto_id, l.id);
      if (x) { n++; conh += x.preco * it.quantidade; itens.push({ item_id: it.id, descricao: it.descricao, quantidade: it.quantidade, preco: x.preco, subtotal: r2(x.preco * it.quantidade), fonte: x.fonte }); }
      else { const b = best(it); falt.push(it.descricao); if (b) est += b.preco * it.quantidade; itens.push({ item_id: it.id, descricao: it.descricao, quantidade: it.quantidade, preco: b ? b.preco : null, subtotal: b ? r2(b.preco * it.quantidade) : null, fonte: b ? 'ESTIMADO' : null }); }
    });
    const temGeo = l.latitude != null && lat != null;
    const dist = temGeo ? r2(hav(lat, lng, l.latitude, l.longitude)) : null, desl = temGeo ? r2(dist * (cfg.fator_rota || 1.3) * 2) : null, custo = temGeo ? r2(desl * (cfg.custo_km || 0)) : 0;
    return { loja_id: l.id, nome: l.nome, compartilhada: !!l.global, total_conhecido: r2(conh), total_estimado: r2(conh + est), cobertura: r2(n / its.length), itens_faltantes: falt, distancia_km: dist, deslocamento_km: desl, custo_deslocamento: custo, total_final: r2(conh + est + custo), itens };
  }).filter((l) => l.cobertura > 0 && (!p.raio_km || l.distancia_km == null || l.distancia_km <= p.raio_km)).sort((a, b) => (a.cobertura < 0.5) - (b.cobertura < 0.5) || a.total_final - b.total_final);
  if (!out.length) return { lojas: [], melhor: null, economia_vs_pior: 0, compra_dividida: null };
  const grupos = {};
  its.forEach((it) => { const b = best(it); if (!b) return; const lo = out.find((x) => x.loja_id === b.loja_id); if (!lo) return; (grupos[b.loja_id] ||= { loja_id: b.loja_id, nome: lo.nome, itens: [], subtotal: 0, custo_deslocamento: lo.custo_deslocamento }); grupos[b.loja_id].itens.push({ item_id: it.id, descricao: it.descricao, quantidade: it.quantidade, preco: b.preco, subtotal: r2(b.preco * it.quantidade) }); grupos[b.loja_id].subtotal = r2(grupos[b.loja_id].subtotal + b.preco * it.quantidade); });
  const gs = Object.values(grupos), tot = r2(gs.reduce((s, g) => s + g.subtotal, 0)), cd = r2(gs.reduce((s, g) => s + g.custo_deslocamento, 0));
  return { origem: { latitude: lat, longitude: lng }, lojas: out, melhor: out[0].loja_id, economia_vs_pior: r2(Math.max(0, Math.max(...out.filter((l) => l.cobertura >= 0.5).map((l) => l.total_final), out[0].total_final) - out[0].total_final)),
    compra_dividida: gs.length > 1 ? { lojas: gs, total: tot, custo_deslocamento: cd, total_final: r2(tot + cd), economia_vs_melhor: r2(out[0].total_final - tot - cd) } : null };
}
function sessaoView(S, s) { const l = lojaOf(S, s.loja_id); return { ...clone(s), loja: l ? { id: l.id, nome: l.nome } : null, lista_nome: (S.listas.find((x) => x.id === s.lista_id) || {}).nome || '' }; }
function registrarPreco(S, pid, lid, preco, data, origem, chave) {
  S.precos.push({ id: nid('pr'), produto_id: pid, loja_id: lid, preco: r2(preco), data: data || T, origem, chave_nfce: chave || null });
  const p = prodOf(S, pid), l = lojaOf(S, lid);
  if (!S.config.compartilhar_precos || !p || !p.gtin || !l || !l.cnpj) return { publicado: false, status: null };
  const outros = DB.obs.filter((o) => o.gtin === p.gtin && o.status !== 'rejeitado').map((o) => o.preco).sort((a, b) => a - b);
  const med = outros.length ? outros[Math.floor(outros.length / 2)] : preco;
  const status = chave ? 'validado' : preco < med / 2 || preco > med * 2 ? 'suspeito' : 'observado';
  DB.obs.push({ observacao_id: nid('ob'), gtin: p.gtin, cnpj: l.cnpj, loja: { nome: l.nome, cidade: l.cidade, uf: l.uf }, preco: r2(preco), data: data || T, origem: chave ? 'nfce' : 'manual', status, confirmacoes: 0, discordancias: 0, minha: true, meu_voto: null, escondido: false });
  DB.reputacao.observacoes++;
  return { publicado: true, status };
}

// ---------- NFC-e ----------
const brNum = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
function interpretar(S, entrada, texto) {
  const m = String(entrada || '').match(/\d{44}/), avisos = [];
  const chave = m ? m[0] : null;
  let info = null;
  if (chave) {
    info = { uf: chave.slice(0, 2), aamm: chave.slice(2, 6), cnpj: chave.slice(6, 20), modelo: chave.slice(20, 22), nfce: chave.slice(20, 22) === '65', dv_ok: dv11(chave.slice(0, 43)) === Number(chave[43]) };
    if (!info.dv_ok) avisos.push('O dígito verificador da chave não confere.');
  }
  const itens = [], tx = String(texto || '');
  const re = /^(.+?)\s*\(C[óo]digo:\s*(\w+)\s*\)\s*\n\s*Qtde\.:\s*([\d.,]+)\s*UN:\s*([A-Za-z]+)\d*\s*Vl\. Unit\.:\s*([\d.,]+)\s*Vl\. Total\s*\n\s*([\d.,]+)/gm;
  let x;
  while ((x = re.exec(tx))) {
    const un = /^K/i.test(x[4]) ? 'KG' : /^L/i.test(x[4]) ? 'L' : 'UN';
    const desc = x[1].trim(), cod = x[2];
    itens.push({ descricao: desc, codigo: cod, quantidade: brNum(x[3]), unidade: un, preco_unitario: brNum(x[5]), total: brNum(x[6]), produto_sugerido_id: null, motivo_sugestao: '' });
  }
  const cnpjM = tx.match(/CNPJ:\s*([\d./-]+)/), cnpj = cnpjM ? cnpjM[1].replace(/\D/g, '') : info ? info.cnpj : null;
  const linhas = tx.split('\n').map((s) => s.trim());
  const iC = linhas.findIndex((s) => /^CNPJ:/.test(s));
  const emitente = iC > 0 ? linhas.slice(0, iC).filter(Boolean).pop() : null;
  const end = iC >= 0 && linhas[iC + 1] ? linhas[iC + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const totM = tx.match(/Valor a pagar R\$:\s*\n?\s*([\d.,]+)/), dataM = tx.match(/Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const loja = cnpj && S.lojas.find((l) => l.cnpj === cnpj);
  itens.forEach((it) => {
    const ap = cnpj && S.apelidos[cnpj + ':' + it.codigo];
    if (ap) { it.produto_sugerido_id = ap; it.motivo_sugestao = 'codigo'; return; }
    const w = norm(it.descricao).split(/\W+/).filter((s) => s.length > 2);
    let b = null, bs = 0;
    S.produtos.forEach((p) => { const pn = norm(p.nome + ' ' + (p.marca || '')); const sc = w.filter((t) => pn.includes(t)).length; if (sc > bs) { bs = sc; b = p; } });
    if (b && bs >= 2) { it.produto_sugerido_id = b.id; it.motivo_sugestao = 'nome'; }
  });
  if (!chave) avisos.push('Sem a chave de acesso, os preços entram como não verificados.');
  if (!itens.length) avisos.push(tx ? 'Não foi possível reconhecer os itens neste texto.' : 'Copie o texto da página da nota (ou envie o PDF) para ler os itens.');
  const total = totM ? brNum(totM[1]) : r2(itens.reduce((s, i) => s + i.total, 0));
  return { chave, chave_info: info, cnpj, duplicada: !!(chave && S.notas.some((n) => n.chave === chave)), loja_id: loja ? loja.id : null, emitente,
    data: dataM ? `${dataM[3]}-${dataM[2]}-${dataM[1]}` : null, total, endereco: end.length >= 2 ? { cidade: end[end.length - 2].replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase()), uf: end[end.length - 1] } : null, itens, avisos };
}
export function amostraNota() {
  const cnpj = '11222333000181', base = '15' + T.slice(2, 4) + T.slice(5, 7) + cnpj + '65' + '501' + '000' + String(470000 + Math.floor(Math.random() * 9999)).padStart(6, '0') + '1' + '04857917';
  const chave = base + dv11(base);
  const d = T.split('-').reverse().join('/');
  const its = [['ARROZ BOM GRAO T1 5KG', '10231', '1', 'UND', '25,90', '25,90'], ['CAFE SERRA AZUL 500G', '10877', '2', 'UND', '18,49', '36,98'], ['LEITE INTEGRAL VALE DOCE 1L', '20114', '6', 'UND', '4,99', '29,94'],
    ['BANANA PRATA KG', '30017', '1,235', 'KG', '6,49', '8,02'], ['DETERGENTE NEUTRO BRILHO 500ML', '40512', '3', 'UND', '2,59', '7,77'], ['BISCOITO RECHEADO CHOCOLATE 130G', '50981', '2', 'UND', '3,49', '6,98']];
  const total = its.reduce((s, i) => s + brNum(i[5]), 0);
  const texto = 'DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA\n\nSUPERMERCADO BOM PRECO LTDA\nCNPJ: 11.222.333/0001-81\nAV. DAS FLORES , 1200 , , CENTRO , BELEM , PA\n' +
    its.map((i) => `${i[0]} (Código: ${i[1]} )\nQtde.:${i[2]}UN: ${i[3]}9Vl. Unit.:   ${i[4]}\tVl. Total\n${i[5]}\n`).join('') +
    `Qtd. total de itens:\n${its.length}\nValor a pagar R$:\n${total.toFixed(2).replace('.', ',')}\nForma de pagamento:\nCartão de Crédito\n\nNúmero: 473340 Série: 501 Emissão: ${d} 19:42:10 - Via Consumidor\n`;
  return { entrada: 'https://nfce.exemplo.gov.br/consulta?p=' + chave + '|2|1|1|ABCDEF', texto };
}

// ---------- rotas ----------
const ADMIN_WS = new Set(['ws.renomear', 'ws.resumo', 'ws.arquivar', 'membros.listar', 'membros.convidar', 'membros.remover', 'convites.enviados', 'convites.cancelar', 'exportar.espaco', 'config.salvar', 'integridade.verificar']);
const LEITURA_WRITES = new Set(['notificacoes.preferencias_salvar', 'precos.confirmar', 'denuncias.criar', 'perfil.salvar', 'ws.criar', 'ws.listar', 'ws.arquivados', 'ws.desarquivar']);
const RANK = { leitura: 1, editor: 2, admin: 3 };
const R = {
  'auth.pedir': ({ email }) => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) fail('Confira o e-mail.'); return { enviado: true, validade_min: 10 }; },
  'auth.confirmar': ({ email, codigo }) => { if (!/^\d{6}$/.test(codigo || '') || codigo === '000000') fail('Código inválido ou expirado.'); DB.usuario.email = email; DB.logado = true; flags.expirar = false; sset(FK, flags); return { token: 'demo.' + Math.random().toString(36).slice(2), email }; },
  'sistema.iniciar': () => { flags.semBanco = false; sset(FK, flags); return { banco: 'Nexora — Banco de dados (demonstração)', usuario: DB.usuario }; },
  'ws.listar': () => DB.spaces.map((s) => ({ id: s.id, nome: s.nome, papel: s.papel })),
  'ws.criar': ({ nome }) => { if (!String(nome || '').trim()) fail('Dê um nome ao espaço.'); flags.contaNova = false; sset(FK, flags); const S = baseSpace(nid('ws'), nome.trim(), 'admin'); S.produtos = []; S.listaItens = []; DB.spaces.push(S); return { id: S.id, nome: S.nome }; },
  'ws.resumo': (p, { S }) => {
    const conteudo = {}; ['recursos', 'lancamentos', 'recorrencias', 'planejamentos', 'produtos', 'lojas', 'listas', 'sessoes', 'notas'].forEach((k) => { if ((S[k] || []).length) conteudo[k] = S[k].length; });
    return { vazio: !Object.keys(conteudo).length, lancamentos: (S.lancamentos || []).length, conteudo, membros: S.membros.length, outros_espacos: DB.spaces.filter((x) => x.id !== S.id).length };
  },
  'ws.arquivar': (p, { S }) => {
    const r = R['ws.resumo'](p, { S }); if (!r.outros_espacos) fail('Você precisa ter pelo menos outro espaço ativo antes de arquivar ou excluir este.');
    DB.spaces = DB.spaces.filter((x) => x.id !== S.id); if (!r.vazio) DB.arquivados = (DB.arquivados || []).concat(S);
    return { acao: r.vazio ? 'EXCLUIDO' : 'ARQUIVADO', proximo_espaco_id: DB.spaces[0].id };
  },
  'ws.arquivados': () => (DB.arquivados || []).filter((s) => s.papel === 'admin').map((s) => ({ id: s.id, nome: s.nome })),
  'ws.desarquivar': ({ espaco_id }) => {
    const s = (DB.arquivados || []).find((x) => x.id === espaco_id && x.papel === 'admin'); if (!s) fail('Espaço arquivado não encontrado (só o admin do espaço pode reativá-lo, e espaços excluídos não voltam).');
    DB.arquivados = DB.arquivados.filter((x) => x !== s); DB.spaces.push(s); return { id: s.id, nome: s.nome };
  },
  'ws.renomear': ({ nome }, { S }) => { if (!String(nome || '').trim()) fail('Dê um nome ao espaço.'); S.nome = nome.trim(); return { id: S.id, nome: S.nome }; },
  'membros.listar': (p, { S }) => clone(S.membros),
  'membros.convidar': ({ email, papel }, { S }) => {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Confira o e-mail.');
    if (!RANK[papel]) fail('Escolha o papel.');
    const ex = S.membros.find((m) => m.email === email);
    if (ex) {
      if (ex.papel === 'admin' && papel !== 'admin' && S.membros.filter((m) => m.papel === 'admin').length < 2) fail('O espaço precisa de ao menos um administrador.');
      ex.papel = papel;
      notificar(email, { tipo: 'PAPEL_ALTERADO', titulo: 'Seu papel mudou', texto: `Agora você é ${PAPEL_TXT[papel]} no espaço ${S.nome}.`, espaco_id: S.id });
      return { email, papel, status: 'MEMBRO' };
    }
    const conta_existe = (DB.admin.usuarios || []).some((u) => u.email === email);
    if (!DB.admin.cadastro_aberto && !conta_existe) fail('O cadastro de novos usuários está fechado: só é possível convidar quem já tem cadastro.');
    S.convites = S.convites || [];
    const expira_em = addDays(T, 14);
    let cv = S.convites.find((c) => c.email === email && c.status === 'PENDENTE');
    if (cv) { cv.papel = papel; cv.expira_em = expira_em; cv.criado_em = now(); }
    else { cv = { id: nid('cv'), espaco_id: S.id, espaco_nome: S.nome, email, papel, status: 'PENDENTE', convidado_por_nome: DB.usuario.nome, expira_em, respondido_em: null, criado_em: now() }; S.convites.push(cv); }
    const email_enviado = !/sememail/.test(email);
    if (conta_existe) notificar(email, { tipo: 'CONVITE_RECEBIDO', titulo: `Convite para o espaço ${S.nome}`, texto: `${DB.usuario.nome} convidou você como ${PAPEL_TXT[papel]}.`, ref_id: cv.id, espaco_id: S.id });
    return { email, papel, status: 'PENDENTE', convite_id: cv.id, expira_em, conta_existe, email_enviado };
  },
  'convites.enviados': (p, { S }) => (S.convites || []).map((c) => ({ ...clone(c), status: c.status === 'PENDENTE' && c.expira_em < T ? 'EXPIRADO' : c.status })).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)),
  'convites.cancelar': ({ id }, { S }) => { const c = (S.convites || []).find((x) => x.id === id) || fail('Convite não encontrado.'); if (c.status !== 'PENDENTE') fail('Só dá para cancelar convites pendentes.'); c.status = 'CANCELADO'; c.respondido_em = now(); return { id, status: 'CANCELADO' }; },
  'convites.recebidos': () => (DB.convitesRecebidos || []).filter((c) => c.status === 'PENDENTE' && c.expira_em >= T).map(clone).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)),
  'convites.aceitar': ({ id }) => {
    const cv = (DB.convitesRecebidos || []).find((c) => c.id === id);
    if (!cv || cv.status !== 'PENDENTE') fail('Este convite não está mais disponível.');
    if (cv.expira_em < T) { cv.status = 'EXPIRADO'; fail('Este convite expirou. Peça um novo a quem convidou.'); }
    cv.status = 'ACEITO'; cv.respondido_em = now();
    flags.contaNova = false; sset(FK, flags);
    let S = DB.spaces.find((s) => s.id === cv.espaco_id);
    if (!S) { S = (DB.spacesConvite || {})[cv.espaco_id] || baseSpace(cv.espaco_id, cv.espaco_nome, cv.papel); if (DB.spacesConvite) delete DB.spacesConvite[cv.espaco_id]; DB.spaces.push(S); }
    S.papel = cv.papel;
    if (!S.membros.some((m) => m.email === DB.usuario.email)) S.membros.push({ usuario_id: DB.usuario.id, email: DB.usuario.email, nome: DB.usuario.nome, papel: cv.papel });
    (DB.notificacoes || []).forEach((n) => { if (n.ref_id === id) n.lida = true; });
    return { espaco_id: S.id, espaco_nome: S.nome, papel: cv.papel };
  },
  'convites.recusar': ({ id }) => { const cv = (DB.convitesRecebidos || []).find((c) => c.id === id); if (!cv || cv.status !== 'PENDENTE') fail('Este convite não está mais disponível.'); cv.status = 'RECUSADO'; cv.respondido_em = now(); (DB.notificacoes || []).forEach((n) => { if (n.ref_id === id) n.lida = true; }); return { id, status: 'RECUSADO' }; },
  'notificacoes.listar': ({ so_nao_lidas, limite } = {}) => { const all = (DB.notificacoes || []).slice().sort((a, b) => (a.criada_em < b.criada_em ? 1 : -1)); const itens = (so_nao_lidas ? all.filter((n) => !n.lida) : all).slice(0, Math.min(100, limite || 30)).map(clone); return { itens, nao_lidas: all.filter((n) => !n.lida).length, total: all.length }; },
  'notificacoes.preferencias': () => prefsView(),
  'notificacoes.preferencias_salvar': ({ tipos } = {}) => {
    if (!tipos || typeof tipos !== 'object' || Array.isArray(tipos)) fail('Informe os tipos de aviso.');
    for (const k of Object.keys(tipos)) if (!PREF_TIPOS.some((t) => t.tipo === k)) fail('Tipo de aviso inválido: ' + k + '.');
    for (const k of Object.keys(tipos)) prefsDe()[k] = !!tipos[k];
    return prefsView();
  },
  'notificacoes.contar': () => ({ nao_lidas: (DB.notificacoes || []).filter((n) => !n.lida).length }),
  'notificacoes.marcar_lida': ({ id, todas }) => { let marcadas = 0; (DB.notificacoes || []).forEach((n) => { if ((todas || n.id === id) && !n.lida) { n.lida = true; marcadas++; } }); return { marcadas, nao_lidas: (DB.notificacoes || []).filter((n) => !n.lida).length }; },
  'membros.remover': ({ usuario_id }, { S }) => { const m = S.membros.find((x) => x.usuario_id === usuario_id) || fail('Pessoa não encontrada.'); if (m.papel === 'admin' && S.membros.filter((x) => x.papel === 'admin').length < 2) fail('O espaço precisa de ao menos uma pessoa admin.'); S.membros = S.membros.filter((x) => x !== m); return { ok: true }; },
  'perfil.salvar': ({ nome }) => { if (!String(nome || '').trim()) fail('Informe seu nome.'); DB.usuario.nome = nome.trim(); return { nome: DB.usuario.nome }; },
  bootstrap: (p, { S }) => {
    gerarRec(S, addDays(T, 35));
    const saldos = {};
    S.recursos.forEach((r) => { saldos[r.id] = { saldo_atual: saldo(S, r.id), saldo_projetado: saldo(S, r.id, { proj: true }) }; });
    return { usuario: DB.usuario, espaco: { id: S.id, nome: S.nome, papel: S.papel }, espacos: R['ws.listar'](), hoje: T, recursos: S.recursos.filter((r) => r.status !== 'INATIVO').concat(S.recursos.filter((r) => r.status === 'INATIVO')), categorias: S.categorias, saldos, config: S.config };
  },
  'exportar.espaco': (p, { S }) => ({ tabelas: { recursos_financeiros: S.recursos, lancamentos: S.lancamentos, categorias: S.categorias, recorrencias: S.recorrencias, planejamentos: S.planejamentos, produtos: S.produtos.map(({ _base, ...x }) => x), lojas: S.lojas, precos: S.precos, listas: S.listas, itens_lista: S.listaItens, sessoes: S.sessoes, auditoria: S.auditoria } }),
  'recursos.listar': ({ todos }, { S }) => S.recursos.filter((r) => todos || r.status !== 'INATIVO').map((r) => ({ ...r, ...(r.tipo === 'CARTAO' ? situacaoCartao(S, r.id) : { saldo_atual: saldo(S, r.id), saldo_projetado: saldo(S, r.id, { proj: true }) }) })),
  'recursos.criar': (p, { S }) => {
    if (!['CONTA', 'CARTEIRA', 'CARTAO'].includes(p.tipo)) fail('Escolha o tipo.');
    if (!String(p.nome || '').trim()) fail('Dê um nome.');
    const r = { id: nid('r'), tipo: p.tipo, nome: p.nome.trim(), status: 'ATIVO', versao: 1, versao_recurso: 1 };
    if (p.tipo === 'CARTAO') {
      if (!(p.dia_fechamento >= 1 && p.dia_fechamento <= 31) || !(p.dia_vencimento >= 1 && p.dia_vencimento <= 31)) fail('Informe os dias de fechamento e vencimento.');
      Object.assign(r, { limite: r2(p.limite), dia_fechamento: p.dia_fechamento, dia_vencimento: p.dia_vencimento, instituicao: p.instituicao || null, bandeira: p.bandeira || null, final: p.final || null, regra_fechamento: p.regra_fechamento || 'INCLUSIVO', recurso_pagamento_id: p.recurso_pagamento_id || null, anuidade: r2(p.anuidade), taxa_juros: Number(p.taxa_juros) || 0 });
    } else Object.assign(r, { tipo_conta: p.tipo_conta || null, instituicao: p.instituicao || null, agencia: p.agencia || null, numero: p.numero || null, saldo_inicial: r2(p.saldo_inicial), data_saldo_inicial: p.data_saldo_inicial || T });
    S.recursos.push(r);
    if (r.tipo !== 'CARTAO' && r.saldo_inicial > 0) criarLanc(S, { tipo: 'ENTRADA', descricao: 'Saldo inicial', valor_bruto: r.saldo_inicial, data_evento: r.data_saldo_inicial, status: 'EFETIVADO', recurso_id: r.id }, { origem: 'SALDO_INICIAL' });
    return r;
  },
  'recursos.atualizar': (p, { S }) => {
    const r = recOf(S, p.id) || fail('Recurso não encontrado.');
    checkVer(r, p.versao);
    ['nome', 'instituicao', 'agencia', 'numero', 'tipo_conta', 'limite', 'dia_fechamento', 'dia_vencimento', 'bandeira', 'final', 'regra_fechamento', 'recurso_pagamento_id', 'anuidade', 'taxa_juros'].forEach((k) => { if (p[k] !== undefined) r[k] = p[k]; });
    r.versao++; r.versao_recurso++;
    return r;
  },
  'recursos.inativar': ({ id }, { S }) => { const r = recOf(S, id) || fail('Recurso não encontrado.'); if (Math.abs(saldo(S, id, { proj: true })) > 0.004) fail('Só é possível inativar com saldo zero.'); r.status = 'INATIVO'; r.versao++; return r; },
  'categorias.listar': (p, { S }) => S.categorias,
  'categorias.salvar': (p, { S }) => {
    if (p.id) { const c = S.categorias.find((x) => x.id === p.id) || fail('Categoria não encontrada.'); if (p.nome) c.nome = p.nome.trim(); if (p.status) c.status = p.status; return c; }
    if (!String(p.nome || '').trim()) fail('Dê um nome.');
    if (S.categorias.some((c) => norm(c.nome) === norm(p.nome) && c.tipo === p.tipo && (c.pai_id || null) === (p.pai_id || null))) fail('Já existe uma categoria com esse nome.');
    const c = { id: nid('c'), nome: p.nome.trim(), tipo: p.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA', pai_id: p.pai_id || null, status: 'ATIVA' };
    S.categorias.push(c); return c;
  },
  'lancamentos.criar': (p, { S }) => viewL(S, criarLanc(S, p), true),
  'lancamentos.listar': (p, { S }) => {
    const t = norm(p.texto), lim = Math.min(200, p.limite || 30), off = p.offset || 0;
    const catSet = p.categoria_id ? new Set(S.categorias.filter((c) => ancestors(S, c.id).includes(p.categoria_id)).map((c) => c.id)) : null;
    const f = S.lancamentos.filter((l) => (!p.de || l.data_evento >= p.de) && (!p.ate || l.data_evento <= p.ate) && (!p.tipo || l.tipo === p.tipo) && (!p.status || l.status === p.status)
      && (!catSet || catSet.has(l.categoria_id) || l.itens.some((i) => catSet.has(i.categoria_id))) && (!p.recurso_id || l.movimentacoes.some((m) => m.recurso_id === p.recurso_id))
      && (!t || norm(l.descricao).includes(t) || l.itens.some((i) => norm(i.descricao).includes(t))))
      .sort((a, b) => (a.data_evento === b.data_evento ? (a.criado_em < b.criado_em ? 1 : -1) : a.data_evento < b.data_evento ? 1 : -1));
    return { total: f.length, offset: off, itens: f.slice(off, off + lim).map((l) => viewL(S, l)) };
  },
  'lancamentos.detalhe': ({ id }, { S }) => viewL(S, findL(S, id), true),
  'lancamentos.historico': ({ id }, { S }) => { findL(S, id); return S.auditoria.filter((a) => a.entidade_id === id).sort((a, b) => (a.quando < b.quando ? 1 : -1)); },
  'lancamentos.atualizar': (p, { S }) => {
    const l = findL(S, p.id);
    checkVer(l, p.versao);
    if (['CANCELADO', 'ESTORNADO'].includes(l.status)) fail('Este lançamento não pode mais ser alterado.');
    const mud = {};
    const set = (k, v) => { if (v !== undefined && v !== l[k]) { mud[k] = [l[k], v]; l[k] = v; } };
    set('descricao', p.descricao); set('categoria_id', p.categoria_id);
    const futuro = ['PLANEJADO', 'PENDENTE'].includes(l.status);
    if (['data_evento', 'valor_bruto', 'descontos', 'acrescimos', 'encargos'].some((k) => p[k] !== undefined && p[k] !== l[k])) {
      if (!futuro || l.itens.length || l.parcelas.length) fail('Valor e data só mudam em lançamento futuro sem itens.');
      ['data_evento', 'valor_bruto', 'descontos', 'acrescimos', 'encargos'].forEach((k) => set(k, p[k] != null ? (k === 'data_evento' ? p[k] : r2(p[k])) : undefined));
      l.valor_total = r2(l.valor_bruto - l.descontos + l.acrescimos + l.encargos);
      l.movimentacoes.forEach((m) => { m.valor = l.valor_total; });
    }
    (p.itens || []).forEach((x) => { const it = l.itens.find((i) => i.id === x.id); if (it && x.categoria_id && x.categoria_id !== it.categoria_id) { mud['item:' + it.descricao] = [it.categoria_id, x.categoria_id]; it.categoria_id = x.categoria_id; } });
    l.versao++;
    audit(S, l.id, 'atualizado', mud);
    return viewL(S, l, true);
  },
  'lancamentos.efetivar': ({ id, data }, { S }) => {
    const l = findL(S, id);
    if (!['PLANEJADO', 'PENDENTE'].includes(l.status)) fail('Só lançamentos futuros podem ser efetivados.');
    const d = data || T;
    l.status = 'EFETIVADO'; l.data_efetivacao = d; l.data_evento = d; parcelar(S, l, true);
    l.movimentacoes.forEach((m) => { m.data_efetivacao = d; });
    l.versao++; audit(S, l.id, 'efetivado', { status: ['PENDENTE', 'EFETIVADO'] });
    return viewL(S, l, true);
  },
  'lancamentos.cancelar': ({ id }, { S }) => {
    const l = findL(S, id);
    if (!['PLANEJADO', 'PENDENTE'].includes(l.status)) fail('Só é possível cancelar o que ainda não aconteceu. Use estornar.');
    audit(S, l.id, 'cancelado', { status: [l.status, 'CANCELADO'] });
    l.status = 'CANCELADO'; l.versao++;
    return viewL(S, l, true);
  },
  'lancamentos.estornar': ({ id, motivo, data }, { S }) => viewL(S, estornar(S, findL(S, id), motivo, data), true),
  'cartoes.situacao': ({ recurso_id }, { S }) => { const k = recOf(S, recurso_id); if (!k || k.tipo !== 'CARTAO') fail('Cartão não encontrado.'); return situacaoCartao(S, recurso_id); },
  'faturas.listar': ({ recurso_id }, { S }) => S.recursos.filter((k) => k.tipo === 'CARTAO' && (!recurso_id || k.id === recurso_id)).flatMap((k) => faturasDe(S, k.id).map(resumoFat)),
  'faturas.detalhe': ({ id }, { S }) => faturasDe(S, id.split('~')[0]).find((f) => f.id === id) || fail('Fatura não encontrada.'),
  'faturas.pagar': ({ fatura_id, recurso_id, valor, data }, { S }) => {
    const kid = fatura_id.split('~')[0], f = faturasDe(S, kid).find((x) => x.id === fatura_id) || fail('Fatura não encontrada.');
    if (f.status === 'ABERTA') fail('A fatura ainda está aberta; pague depois do fechamento.');
    if (f.status === 'PAGA') fail('Esta fatura já está paga.');
    const d = data || T;
    if (d > T) fail('A data do pagamento não pode ser futura.');
    const v = r2(valor != null ? valor : f.valor_em_aberto);
    if (!(v > 0)) fail('Informe o valor.');
    if (v > f.valor_em_aberto + 0.004) fail('O valor é maior que o saldo em aberto da fatura.');
    const conta = recurso_id || recOf(S, kid).recurso_pagamento_id || fail('Escolha a conta de pagamento.');
    pagarFatura(S, f, conta, v, d);
    return faturasDe(S, kid).find((x) => x.id === fatura_id);
  },
  'recorrencias.listar': (p, { S }) => S.recorrencias.map(({ gerados, ...r }) => ({ ...r, proxima: (ocorrencias(r, addDays(T, 800)).find((d) => d >= T) || null) })),
  'recorrencias.salvar': (p, { S }) => {
    if (p.id) { const r = S.recorrencias.find((x) => x.id === p.id) || fail('Recorrência não encontrada.'); ['descricao', 'valor', 'data_final', 'status'].forEach((k) => { if (p[k] !== undefined) r[k] = p[k]; }); r.versao++; return r; }
    if (!String(p.descricao || '').trim()) fail('Informe a descrição.');
    if (!(r2(p.valor) > 0)) fail('Informe o valor.');
    if (!p.recurso_id) fail('Escolha a conta.');
    if (p.tipo_lancamento === 'TRANSFERENCIA' && (!p.recurso_destino_id || p.recurso_destino_id === p.recurso_id)) fail('Escolha um destino diferente da origem.');
    const r = { id: nid('rc'), tipo_lancamento: p.tipo_lancamento, descricao: p.descricao.trim(), valor: r2(p.valor), periodicidade: p.periodicidade || 'MENSAL', intervalo: p.intervalo || null, data_inicial: p.data_inicial || T, data_final: p.data_final || null, recurso_id: p.recurso_id, recurso_destino_id: p.recurso_destino_id || null, categoria_id: p.categoria_id || null, status: 'ATIVA', gerados: [], versao: 1 };
    S.recorrencias.push(r); return r;
  },
  'recorrencias.gerar': ({ ate }, { S }) => ({ criadas: gerarRec(S, ate || addDays(T, 35)) }),
  'planejamentos.salvar': (p, { S }) => {
    if (!String(p.nome || '').trim()) fail('Dê um nome ao planejamento.');
    if (!(r2(p.valor_limite) > 0)) fail('Informe o valor planejado.');
    if (!p.categorias || !p.categorias.length) fail('Escolha ao menos uma categoria.');
    let pl = p.id && S.planejamentos.find((x) => x.id === p.id);
    if (pl) checkVer(pl, p.versao);
    else { pl = { id: nid('pl'), versao: 0 }; S.planejamentos.push(pl); }
    Object.assign(pl, { nome: p.nome.trim(), data_inicio: p.data_inicio || monthStart(T), data_fim: p.data_fim || null, valor_limite: r2(p.valor_limite), prioridade: p.prioridade || 1, status: p.status || 'ATIVO', categorias: p.categorias.map((c) => ({ categoria_id: c.categoria_id, valor_limite: r2(c.valor_limite) || null, percentual_execucao: c.percentual_execucao || 100 })) });
    pl.versao++;
    return situacaoPlan(S, pl);
  },
  'planejamentos.listar': (p, { S }) => S.planejamentos.map((x) => situacaoPlan(S, x)),
  'planejamentos.situacao': ({ id }, { S }) => situacaoPlan(S, S.planejamentos.find((x) => x.id === id) || fail('Planejamento não encontrado.')),
  'relatorios.painel': ({ de, ate }, { S }) => painel(S, de || monthStart(T), ate || monthEnd(T)),
  'relatorios.saldos': ({ data }, { S }) => {
    const d = data || T, contas = S.recursos.filter((r) => r.tipo !== 'CARTAO' && r.status !== 'INATIVO').map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, instituicao: r.instituicao, saldo_atual: saldo(S, r.id, { ate: d }), saldo_projetado: saldo(S, r.id, { proj: true }) }));
    const cartoes = S.recursos.filter((r) => r.tipo === 'CARTAO' && r.status !== 'INATIVO').map((r) => ({ id: r.id, ...situacaoCartao(S, r.id) }));
    return { contas, cartoes, dinheiro_atual: r2(contas.reduce((s, c) => s + c.saldo_atual, 0)), patrimonio_liquido: r2(contas.reduce((s, c) => s + c.saldo_atual, 0) - cartoes.reduce((s, c) => s + c.limite_comprometido - c.credito_a_favor, 0)) };
  },
  'relatorios.resultado': ({ de, ate }, { S }) => {
    de ||= monthStart(T); ate ||= monthEnd(T);
    const pc = {}, rc = {}, lines = linhasConsumo(S, de, ate);
    lines.forEach((l) => { const k = rootCat(S, l.categoria_id) || '_'; pc[k] = (pc[k] || 0) + l.valor; });
    const rec = receitas(S, de, ate, rc), desp = r2(lines.reduce((s, l) => s + l.valor, 0)), enc = encargos(S, de, ate);
    const lst = (o) => Object.entries(o).map(([id, v]) => ({ categoria_id: id === '_' ? null : id, nome: id === '_' ? 'Sem categoria' : S.categorias.find((c) => c.id === id).nome, valor: r2(v) })).sort((a, b) => b.valor - a.valor);
    return { receitas: rec, despesas: desp, encargos_financeiros: enc, resultado: r2(rec - desp - enc), despesas_por_categoria: lst(pc), receitas_por_categoria: lst(rc) };
  },
  'relatorios.fluxo': ({ ate }, { S }) => fluxo(S, ate || addDays(T, 30)),
  'relatorios.serie': ({ meses = 6, ate }, { S }) => {
    const end = (ate || T).slice(0, 7), pontos = [];
    for (let i = Math.min(36, meses) - 1; i >= 0; i--) {
      const ym = ymAdd(end, -i), de = ym + '-01', a = monthEnd(de);
      const rec = receitas(S, de, a), desp = r2(linhasConsumo(S, de, a).reduce((s, l) => s + l.valor, 0)), enc = encargos(S, de, a);
      pontos.push({ mes: ym, receitas: rec, despesas: desp, encargos_financeiros: enc, resultado: r2(rec - desp - enc) });
    }
    const comD = pontos.filter((p) => p.despesas > 0);
    return { pontos, media_despesas: r2(comD.reduce((s, p) => s + p.despesas, 0) / (comD.length || 1)) };
  },
  'integridade.verificar': () => [],
  'produtos.listar': ({ texto, todos, offset = 0, limite = 50 }, { S }) => {
    const t = norm(texto);
    const f = S.produtos.filter((p) => (todos || p.status !== 'INATIVO') && (!t || norm(p.nome + ' ' + (p.marca || '') + ' ' + (p.gtin || '')).includes(t))).sort((a, b) => a.nome.localeCompare(b.nome));
    return { total: f.length, itens: f.slice(offset, offset + limite).map((p) => viewProd(S, p)) };
  },
  'produtos.salvar': (p, { S }) => {
    if (p.id) {
      const x = prodOf(S, p.id) || fail('Produto não encontrado.'); checkVer(x, p.versao);
      if (p.gtin && x.gtin && p.gtin !== x.gtin) fail('O código de barras não pode ser trocado.');
      ['nome', 'marca', 'unidade', 'categoria_id', 'status'].forEach((k) => { if (p[k] !== undefined) x[k] = p[k]; });
      if (p.tam_embalagem !== undefined) { if (p.tam_embalagem !== '' && p.tam_embalagem !== null && tamNum(p.tam_embalagem) === null) fail('Informe só o número do tamanho da embalagem (ex.: 500); a unidade é a escolhida no produto.'); x.tam_embalagem = tamNum(p.tam_embalagem) || 1; }
      if (p.gtin && !x.gtin) x.gtin = p.gtin;
      x.versao++; return viewProd(S, x);
    }
    if (!String(p.nome || '').trim()) fail('Dê um nome ao produto.');
    if (p.gtin && S.produtos.some((x) => x.gtin === p.gtin)) fail('Já existe um produto com este código de barras.');
    const x = { id: nid('p'), nome: p.nome.trim(), marca: p.marca || null, gtin: p.gtin || null, unidade: p.unidade || 'UN', tam_embalagem: tamNum(p.tam_embalagem) || 1, categoria_id: p.categoria_id || null, status: 'ATIVO', versao: 1, global_id: p.gtin ? nid('g') : null };
    S.produtos.push(x); return viewProd(S, x);
  },
  'produtos.porGtin': ({ gtin: g }, { S }) => {
    const p = S.produtos.find((x) => x.gtin === g);
    if (p) return { origem: 'ESPACO', produto: viewProd(S, p) };
    const c = DB.catalogo.find((x) => x.gtin === g);
    return c ? { origem: 'CATALOGO', sugestao: c } : { origem: 'NENHUMA' };
  },
  'produtos.imagem.salvar': ({ produto_id, dados }, { S }) => {
    const p = prodOf(S, produto_id) || fail('Produto não encontrado.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dados || '')) fail('Use uma foto JPEG, PNG ou WebP.');
    if (dados.length > 30000) fail('A foto ficou grande demais.');
    DB.imagens[p.id] = dados;
    const pub = !!(p.gtin && !DB.imagens['g:' + p.gtin]);
    if (pub) DB.imagens['g:' + p.gtin] = dados;
    return { ok: true, publicada_no_catalogo: pub };
  },
  'produtos.imagem.remover': ({ produto_id }) => { delete DB.imagens[produto_id]; return { ok: true }; },
  'produtos.imagens': ({ ids = [] }, { S }) => Object.fromEntries(ids.map((id) => { const p = prodOf(S, id); const own = DB.imagens[id], cat = p && p.gtin && DB.imagens['g:' + p.gtin]; return [id, own ? { dados: own, fonte: 'ESPACO' } : cat ? { dados: cat, fonte: 'CATALOGO' } : null]; })),
  'lojas.listar': (p, { S }) => S.lojas.filter((l) => l.status !== 'INATIVA'),
  'lojas.salvar': (p, { S }) => {
    if (p.id) { const l = S.lojas.find((x) => x.id === p.id) || fail('Loja não encontrada.'); ['nome', 'cnpj', 'cidade', 'uf', 'latitude', 'longitude'].forEach((k) => { if (p[k] !== undefined) l[k] = p[k]; }); l.versao++; return l; }
    if (!String(p.nome || '').trim()) fail('Dê um nome à loja.');
    const l = { id: nid('lj'), nome: p.nome.trim(), cnpj: (p.cnpj || '').replace(/\D/g, '') || null, cidade: p.cidade || null, uf: p.uf || null, latitude: p.latitude ?? null, longitude: p.longitude ?? null, status: 'ATIVA', versao: 1 };
    S.lojas.push(l); return l;
  },
  'lojas.proximas': ({ latitude, longitude, raio_km = 10 }, { S }) => S.lojas.concat(DB.lojasGlobais).filter((l) => l.latitude != null).map((l) => ({ ...l, distancia_km: r2(hav(latitude, longitude, l.latitude, l.longitude)) })).filter((l) => l.distancia_km <= raio_km).sort((a, b) => a.distancia_km - b.distancia_km),
  'precos.registrar': ({ produto_id, loja_id, preco, data, chave_nfce }, { S }) => {
    if (!prodOf(S, produto_id)) fail('Produto não encontrado.');
    if (!lojaOf(S, loja_id)) fail('Escolha a loja.');
    if (!(r2(preco) > 0)) fail('Informe o preço.');
    return registrarPreco(S, produto_id, loja_id, preco, data, 'manual', chave_nfce);
  },
  'precos.compartilhados': ({ produto_ids = [] }, { S }) => Object.fromEntries(produto_ids.map((id) => {
    const p = prodOf(S, id);
    const list = p && p.gtin ? DB.obs.filter((o) => o.gtin === p.gtin && !o.escondido && o.status !== 'rejeitado').sort((a, b) => (a.data < b.data ? 1 : -1)) : [];
    return [id, list.map((o) => ({ observacao_id: o.observacao_id, loja: o.loja, preco: o.preco, data: o.data, idade_dias: diffDays(T, o.data), verificado: o.status === 'validado', status: o.status, origem: o.origem, confirmacoes: o.confirmacoes, minha: o.minha, meu_voto: o.meu_voto }))];
  })),
  'precos.confirmar': ({ id, tipo }) => {
    const o = DB.obs.find((x) => x.observacao_id === id) || fail('Preço não encontrado.');
    if (o.minha) fail('Você não pode votar no próprio preço.');
    if (o.meu_voto) fail('Você já votou neste preço.');
    if (!['confirmo', 'discordo'].includes(tipo)) fail('Voto inválido.');
    o.meu_voto = tipo;
    if (tipo === 'confirmo') { o.confirmacoes++; if (o.confirmacoes >= 2 && o.status === 'observado') o.status = 'validado'; } else o.discordancias++;
    return { status: o.status, confirmacoes: o.confirmacoes, discordancias: o.discordancias };
  },
  'precos.historico': ({ produto_id, loja_id }, { S }) => S.precos.filter((x) => (!produto_id || x.produto_id === produto_id) && (!loja_id || x.loja_id === loja_id)).sort((a, b) => (a.data < b.data ? 1 : -1)).map((x) => ({ ...x, loja: (lojaOf(S, x.loja_id) || {}).nome || '', produto: (prodOf(S, x.produto_id) || {}).nome || '' })),
  'precos.evolucao': ({ produto_id, loja_id }, { S }) => {
    const pts = S.precos.filter((x) => x.produto_id === produto_id && (!loja_id || x.loja_id === loja_id)).sort((a, b) => (a.data < b.data ? -1 : 1)).map((x) => ({ data: x.data, preco: x.preco, loja: (lojaOf(S, x.loja_id) || {}).nome || '' }));
    if (!pts.length) return { pontos: [], resumo: null };
    const v = pts.map((p) => p.preco);
    return { pontos: pts, resumo: { minimo: Math.min(...v), maximo: Math.max(...v), media: r2(v.reduce((s, x) => s + x, 0) / v.length), variacao_pct: r2((v[v.length - 1] / v[0] - 1) * 100) } };
  },
  'alertas.precos': ({ dias = 30, pct = 10 }, { S }) => {
    const out = [];
    for (const p of S.produtos) {
      const u = ultimoPago(S, p.id);
      if (!u || !p.gtin) continue;
      const cands = DB.obs.filter((o) => o.gtin === p.gtin && !o.minha && !o.escondido && ['observado', 'validado'].includes(o.status) && diffDays(T, o.data) <= dias && o.preco <= u.preco * (1 - pct / 100)).sort((a, b) => a.preco - b.preco);
      if (cands[0]) out.push({ produto: { id: p.id, nome: p.nome, marca: p.marca }, ultimo_pago: u.preco, preco_encontrado: cands[0].preco, loja: cands[0].loja.nome, cidade: cands[0].loja.cidade, queda_pct: Math.round((1 - cands[0].preco / u.preco) * 100), verificado: cands[0].status === 'validado' });
    }
    return out.sort((a, b) => b.queda_pct - a.queda_pct);
  },
  'reputacao.minha': (p, { S }) => ({ ...DB.reputacao, compartilhando: !!S.config.compartilhar_precos }),
  'config.ler': (p, { S }) => S.config,
  'config.salvar': (p, { S }) => { ['compartilhar_precos', 'custo_km', 'fator_rota', 'casa_latitude', 'casa_longitude'].forEach((k) => { if (p[k] !== undefined) S.config[k] = p[k]; }); return S.config; },
  'denuncias.criar': ({ alvo_tipo, alvo_id, motivo }) => {
    if (!['preco', 'produto', 'imagem', 'loja'].includes(alvo_tipo)) fail('Tipo de denúncia inválido.');
    if (!String(motivo || '').trim()) fail('Conte rapidamente o motivo.');
    const o = alvo_tipo === 'preco' && DB.obs.find((x) => x.observacao_id === alvo_id);
    if (o && o.minha) fail('Você não pode denunciar o próprio preço.');
    let d = DB.admin.denuncias.find((x) => x.alvo_id === alvo_id);
    if (!d) { d = { alvo_tipo, alvo_id, resumo: o ? `Preço ${o.preco.toFixed(2).replace('.', ',')} · ${o.loja.nome}` : alvo_tipo + ' ' + alvo_id, pessoas: 0, motivos: [], status_atual: 'visivel' }; DB.admin.denuncias.push(d); }
    if (d._minha) fail('Você já denunciou este conteúdo.');
    d._minha = true; d.pessoas++; d.motivos.push(motivo.trim());
    const esc = d.pessoas >= 3;
    if (esc) { d.status_atual = 'em_revisao'; if (o) o.escondido = true; }
    return { registrada: true, conteudo_escondido: esc };
  },
  'listas.listar': (p, { S }) => S.listas.filter((l) => l.status !== 'ARQUIVADA').map((l) => listaView(S, l)),
  'listas.criar': ({ nome }, { S }) => { if (!String(nome || '').trim()) fail('Dê um nome à lista.'); const l = { id: nid('li'), nome: nome.trim(), status: 'ATIVA', criado_em: now(), atualizado_em: now() }; S.listas.push(l); return listaView(S, l); },
  'listas.arquivar': ({ id }, { S }) => { const l = S.listas.find((x) => x.id === id) || fail('Lista não encontrada.'); l.status = 'ARQUIVADA'; return listaView(S, l); },
  'listas.detalhe': ({ id, loja_id }, { S }) => {
    const l = S.listas.find((x) => x.id === id) || fail('Lista não encontrada.');
    let tot = 0, sem = 0;
    const itens = S.listaItens.filter((i) => i.lista_id === id).map((i) => {
      const x = loja_id && i.produto_id ? precoEm(S, i.produto_id, loja_id) : !loja_id && i.produto_id ? (() => { const u = ultimoPago(S, i.produto_id); return u ? { preco: u.preco, fonte: 'MEU' } : null; })() : null;
      if (!i.comprado) { if (x) tot += x.preco * i.quantidade; else sem++; }
      const p = i.produto_id && prodOf(S, i.produto_id);
      return { ...i, unidade: p ? p.unidade : 'UN', tem_imagem: p ? viewProd(S, p).tem_imagem : false, preco_estimado: x ? x.preco : null, preco_fonte: x ? x.fonte : null };
    });
    return { ...listaView(S, l), loja_id: loja_id || null, itens, total_estimado: r2(tot), itens_sem_preco: sem };
  },
  'listas.item.adicionar': ({ lista_id, produto_id, descricao, quantidade }, { S }) => {
    if (!S.listas.find((x) => x.id === lista_id)) fail('Lista não encontrada.');
    const p = produto_id && prodOf(S, produto_id);
    if (!p && !String(descricao || '').trim()) fail('Informe o item.');
    const ex = p && S.listaItens.find((i) => i.lista_id === lista_id && i.produto_id === p.id && !i.comprado);
    if (ex) { ex.quantidade = r2(ex.quantidade + (Number(quantidade) || 1)); return ex; }
    const it = { id: nid('lx'), lista_id, produto_id: p ? p.id : null, descricao: p ? p.nome : descricao.trim(), quantidade: Number(quantidade) || 1, comprado: false };
    S.listaItens.push(it); return it;
  },
  'listas.item.atualizar': ({ id, quantidade, remover, comprado }, { S }) => {
    const it = S.listaItens.find((i) => i.id === id) || fail('Item não encontrado.');
    if (remover) { S.listaItens = S.listaItens.filter((i) => i !== it); return { ...it, removido: true }; }
    if (quantidade != null) it.quantidade = Math.max(0.001, Number(quantidade));
    if (comprado != null) it.comprado = !!comprado;
    return it;
  },
  'sessoes.iniciar': ({ lista_id, loja_id, recurso_id }, { S }) => {
    const l = S.listas.find((x) => x.id === lista_id) || fail('Lista não encontrada.');
    if (!lojaOf(S, loja_id)) fail('Escolha a loja.');
    const ab = S.sessoes.find((s) => s.lista_id === l.id && s.status === 'ABERTA');
    if (ab) return sessaoView(S, ab);
    const s = { id: nid('se'), lista_id, loja_id, recurso_id: recurso_id || null, status: 'ABERTA', criado_em: now(),
      itens: S.listaItens.filter((i) => i.lista_id === lista_id && !i.comprado).map((i) => { const x = i.produto_id && precoEm(S, i.produto_id, loja_id); const p = i.produto_id && prodOf(S, i.produto_id); return { id: nid('si'), lista_item_id: i.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, unidade: p ? p.unidade : 'UN', preco_sugerido: x ? x.preco : null, preco_unitario: x ? x.preco : null, marcado: false, categoria_id: p ? p.categoria_id : 'c_merc' }; }) };
    S.sessoes.push(s); return sessaoView(S, s);
  },
  'sessoes.listar': ({ lista_id, status }, { S }) => S.sessoes.filter((s) => (!lista_id || s.lista_id === lista_id) && (!status || s.status === status)).map((s) => sessaoView(S, s)),
  'sessoes.detalhe': ({ id }, { S }) => sessaoView(S, S.sessoes.find((s) => s.id === id) || fail('Compra não encontrada.')),
  'sessoes.item.salvar': ({ id, preco_unitario, quantidade, marcado, categoria_id }, { S }) => {
    const s = S.sessoes.find((x) => x.itens.some((i) => i.id === id)) || fail('Item não encontrado.');
    if (s.status !== 'ABERTA') fail('Esta compra já foi encerrada.');
    const it = s.itens.find((i) => i.id === id);
    if (preco_unitario !== undefined) it.preco_unitario = preco_unitario == null ? null : r2(preco_unitario);
    if (quantidade !== undefined) it.quantidade = Math.max(0.001, Number(quantidade));
    if (marcado !== undefined) it.marcado = !!marcado;
    if (categoria_id !== undefined) it.categoria_id = categoria_id;
    return it;
  },
  'sessoes.item.adicionar': ({ sessao_id, produto_id, descricao, quantidade, preco_unitario }, { S }) => {
    const s = S.sessoes.find((x) => x.id === sessao_id) || fail('Compra não encontrada.');
    const p = produto_id && prodOf(S, produto_id);
    if (!p && !String(descricao || '').trim()) fail('Informe o item.');
    const it = { id: nid('si'), lista_item_id: null, produto_id: p ? p.id : null, descricao: p ? p.nome : descricao.trim(), quantidade: Number(quantidade) || 1, unidade: p ? p.unidade : 'UN', preco_sugerido: null, preco_unitario: preco_unitario != null ? r2(preco_unitario) : null, marcado: true, categoria_id: p ? p.categoria_id : 'c_merc' };
    s.itens.push(it); return it;
  },
  'sessoes.concluir': (p, { S }) => {
    const s = S.sessoes.find((x) => x.id === p.id) || fail('Compra não encontrada.');
    if (s.status !== 'ABERTA') fail('Esta compra já foi encerrada.');
    const its = s.itens.filter((i) => i.marcado);
    if (!its.length) fail('Marque ao menos um item.');
    if (its.some((i) => !(i.preco_unitario > 0))) fail('Informe o preço de todos os itens marcados.');
    const loja = lojaOf(S, s.loja_id), rid = p.recurso_id || s.recurso_id || fail('Escolha como pagou.');
    const itens = its.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.preco_unitario, valor_total: r2(i.quantidade * i.preco_unitario), categoria_id: i.categoria_id, produto_id: i.produto_id }));
    const l = criarLanc(S, { tipo: 'SAIDA', descricao: loja ? loja.nome : 'Compra', valor_bruto: r2(itens.reduce((x, i) => x + i.valor_total, 0)), descontos: p.descontos, acrescimos: p.acrescimos, encargos: p.encargos, parcelas: p.parcelas, data_evento: p.data || T, recurso_id: rid, categoria_id: 'c_merc', itens, status: 'EFETIVADO' });
    its.forEach((i) => { if (i.produto_id) registrarPreco(S, i.produto_id, s.loja_id, i.preco_unitario, p.data || T, 'sessao', p.chave_nfce); if (i.lista_item_id) { const li = S.listaItens.find((x) => x.id === i.lista_item_id); if (li) li.comprado = true; } });
    s.status = 'CONCLUIDA'; s.lancamento_id = l.id;
    return { sessao: sessaoView(S, s), lancamento: viewL(S, l, true) };
  },
  'sessoes.cancelar': ({ id }, { S }) => { const s = S.sessoes.find((x) => x.id === id) || fail('Compra não encontrada.'); if (s.status !== 'ABERTA') fail('Esta compra já foi encerrada.'); s.status = 'CANCELADA'; return { status: s.status }; },
  'comparacao.lista': (p, { S }) => comparar(S, p),
  'nfce.interpretar': ({ entrada, texto }, { S }) => interpretar(S, entrada, texto),
  'nfce.importar': (p, { S }) => {
    if (p.chave && S.notas.some((n) => n.chave === p.chave)) fail('Não é possível importar: esta nota já foi importada.');
    if (!p.itens || !p.itens.length) fail('A nota não tem itens.');
    let loja = p.loja_id && lojaOf(S, p.loja_id);
    if (!loja && p.loja) { const c = (p.loja.cnpj || '').replace(/\D/g, ''); loja = (c && S.lojas.find((l) => l.cnpj === c)) || R['lojas.salvar']({ nome: p.loja.nome || 'Loja', cnpj: c, cidade: p.loja.cidade, uf: p.loja.uf }, { S }); }
    if (!loja) fail('Informe a loja.');
    const itens = p.itens.map((i) => {
      let pid = i.produto_id && prodOf(S, i.produto_id) ? i.produto_id : null;
      if (!pid && i.criar) pid = R['produtos.salvar']({ nome: i.criar.nome || i.descricao, gtin: i.criar.gtin, categoria_id: i.criar.categoria_id, unidade: i.unidade }, { S }).id;
      const cnpj = loja.cnpj; if (pid && cnpj && i.codigo) S.apelidos[cnpj + ':' + i.codigo] = pid;
      const pr = prodOf(S, pid);
      return { descricao: pr ? pr.nome : i.descricao, quantidade: i.quantidade, valor_unitario: i.preco_unitario, valor_total: r2(i.total != null ? i.total : i.quantidade * i.preco_unitario), produto_id: pid, categoria_id: (pr && pr.categoria_id) || 'c_merc' };
    });
    const bruto = r2(itens.reduce((s, i) => s + i.valor_total, 0)), tot = p.total != null ? r2(p.total) : bruto;
    const l = criarLanc(S, { tipo: 'SAIDA', descricao: loja.nome, valor_bruto: bruto, descontos: tot < bruto ? r2(bruto - tot) : 0, acrescimos: tot > bruto ? r2(tot - bruto) : 0, data_evento: p.data || T, recurso_id: p.recurso_id, parcelas: p.parcelas, categoria_id: 'c_merc', itens, status: 'EFETIVADO' });
    itens.forEach((i) => { if (i.produto_id) registrarPreco(S, i.produto_id, loja.id, i.valor_unitario, p.data || T, p.chave ? 'nfce' : 'manual', p.chave); });
    const nota = { id: nid('nf'), chave: p.chave || null, lancamento_id: l.id }; S.notas.push(nota);
    return { lancamento: viewL(S, l, true), nota_id: nota.id, loja_id: loja.id };
  },
  'admin.painel': () => ({ usuarios: 1284, usuarios_ativos: 1201, espacos: 1517, produtos_globais: 18432, lojas_globais: 2210, precos_observados: 96410, precos_validados: 61877, precos_suspeitos: DB.obs.filter((o) => o.status === 'suspeito').length, denuncias_abertas: DB.admin.denuncias.length, cadastro_aberto: DB.admin.cadastro_aberto }),
  'admin.cadastro': ({ aberto }) => { DB.admin.cadastro_aberto = !!aberto; return { cadastro_aberto: DB.admin.cadastro_aberto }; },
  'admin.usuario.ativo': ({ email, ativo }) => { if (email === DB.usuario.email) fail('Você não pode desativar a si mesmo.'); const u = DB.admin.usuarios.find((x) => x.email === email) || fail('Usuário não encontrado.'); u.ativo = !!ativo; return { email, ativo: u.ativo }; },
  'admin.papel': ({ email, papel }) => { if (email === DB.usuario.email) fail('Você não pode mudar o próprio papel.'); const u = DB.admin.usuarios.find((x) => x.email === email) || fail('Usuário não encontrado.'); u.papel = papel; return { email, papel }; },
  'admin.catalogo': () => ({ suspeitos: DB.obs.filter((o) => o.status === 'suspeito').map((o) => { const vs = DB.obs.filter((x) => x.gtin === o.gtin && x !== o).map((x) => x.preco).sort((a, b) => a - b); const p = PRODUTOS.find((x) => x[2] && gtin(x[2]) === o.gtin); return { id: o.observacao_id, produto: p ? p[0] : o.gtin, gtin: o.gtin, loja: o.loja.nome, cidade: o.loja.cidade, preco: o.preco, mediana: vs.length ? vs[Math.floor(vs.length / 2)] : null, data: o.data }; }), repetidos: DB.admin.repetidos, imagens: DB.admin.imagens, totais: { produtos: 18432, lojas: 2210, precos: DB.obs.length, suspeitos: DB.obs.filter((o) => o.status === 'suspeito').length } }),
  'admin.preco.decidir': ({ id, decisao }) => { const o = DB.obs.find((x) => x.observacao_id === id) || fail('Preço não encontrado.'); o.status = decisao === 'validar' ? 'validado' : 'rejeitado'; return { id, status: o.status }; },
  'admin.produto.mesclar': ({ de, para }) => { DB.admin.repetidos = DB.admin.repetidos.filter((g) => !g.itens.some((i) => i.id === de)); return { de, para, mesclado: true }; },
  'admin.reputacao': ({ email, nivel }) => { const u = DB.admin.usuarios.find((x) => x.email === email) || fail('Usuário não encontrado.'); if (!['novo', 'confiavel', 'bloqueado'].includes(nivel)) fail('Nível inválido.'); u.nivel = nivel; return { email, nivel }; },
  'admin.imagem': ({ gtin: g, ativa }) => { const i = DB.admin.imagens.find((x) => x.gtin === g); if (i) i.ativa = !!ativa; return { gtin: g, ativa: !!ativa }; },
  'admin.denuncias': () => DB.admin.denuncias.map(({ _minha, ...d }) => d),
  'admin.denuncia.decidir': ({ alvo_tipo, alvo_id, decisao, bloquear_autor }) => {
    const d = DB.admin.denuncias.find((x) => x.alvo_id === alvo_id && x.alvo_tipo === alvo_tipo) || fail('Denúncia não encontrada.');
    DB.admin.denuncias = DB.admin.denuncias.filter((x) => x !== d);
    const o = alvo_tipo === 'preco' && DB.obs.find((x) => x.observacao_id === alvo_id);
    if (o) { if (decisao === 'procedente') o.status = 'rejeitado'; else o.escondido = false; }
    return { alvo_tipo, alvo_id, decisao, autor_bloqueado: !!(decisao === 'procedente' && bloquear_autor) };
  },
  'admin.renomear': ({ alvo_tipo, alvo_id, nome }) => { if (!String(nome || '').trim()) fail('Informe o nome.'); return { alvo_tipo, alvo_id, nome: nome.trim() }; },
};
function checkVer(rec, v) {
  if (v != null && flags.conflito) { flags.conflito = false; sset(FK, flags); rec.versao++; fail('Outra pessoa alterou este registro. Recarregue e tente de novo.', 'CONFLITO'); }
  if (v != null && Number(v) !== rec.versao) fail('Outra pessoa alterou este registro. Recarregue e tente de novo.', 'CONFLITO');
}
function estornar(S, l, motivo, data, seed) {
  if (l.status !== 'EFETIVADO') fail('Só lançamentos efetivados podem ser estornados.');
  if (['ESTORNO', 'SALDO_INICIAL', 'PAGAMENTO_FATURA'].includes(l.origem)) fail('Este lançamento não pode ser estornado.');
  if (!String(motivo || '').trim()) fail('Conte o motivo do estorno.');
  const inv = { ENTRADA: 'SAIDA', SAIDA: 'ENTRADA', TRANSFERENCIA: 'TRANSFERENCIA' }[l.tipo];
  const d = data || T;
  const e = criarLanc(S, { tipo: inv, descricao: 'Estorno · ' + l.descricao, valor_bruto: l.valor_total, data_evento: d, status: 'EFETIVADO', recurso_id: l.recurso_id, origem_id: l.destino_id, destino_id: l.origem_id, categoria_id: l.categoria_id }, { origem: 'ESTORNO', seed });
  const k = recOf(S, l.recurso_id);
  if (k && k.tipo === 'CARTAO' && l.parcelas.length) {
    let faturado = 0;
    const fs = faturasDe(S, k.id);
    l.parcelas.forEach((p) => { const f = fs.find((x) => x.id === p.fatura_id); if (!f || f.status === 'ABERTA') p.status = 'CANCELADA'; else faturado += p.valor; });
    if (faturado > 0) e.parcelas = [{ id: nid('pc'), numero: 1, total: 1, valor: -r2(faturado), fatura_id: `${k.id}~${faturaYm(k, T, true)}`, status: 'ATIVA' }];
  }
  e.estorno_de = l.id;
  l.status = 'ESTORNADO'; l.estornado_por = e.id; l.motivo_estorno = motivo.trim(); l.versao++;
  if (!seed) audit(S, l.id, 'estornado', { motivo: ['', motivo.trim()] });
  return e;
}

export async function handle(action, p) {
  if (!DB) seed();
  const [a, b] = flags.lento ? [1000, 3000] : (window.NEXORA_CONFIG || {}).latenciaDemo || [300, 1100];
  const write = !/listar|detalhe|historico|situacao|relatorios|bootstrap|porGtin|imagens|proximas|compartilhados|evolucao|alertas|minha|ler|interpretar|painel|catalogo|contar|recebidos|enviados|preferencias$|denuncias$/.test(action);
  await sleep(a + Math.random() * (b - a) * (write ? 1.6 : 1) + (flags.lento && write ? 2000 : 0));
  if (flags.offline || !navigator.onLine) throw new TypeError('offline');
  if (flags.falhar) { flags.falhar = false; sset(FK, flags); throw new TypeError('falha simulada'); }
  const pub = ['auth.pedir', 'auth.confirmar'].includes(action);
  if (!pub && (!p._tk || flags.expirar)) return { ok: false, error: 'Sua sessão terminou. Entre de novo.', codigo: 'LOGIN' };
  if (flags.semBanco && action !== 'sistema.iniciar' && !pub) return { ok: false, error: 'O banco de dados ainda não foi criado.', codigo: 'SEM_BANCO' };
  if (p._rid && DB.rids[p._rid]) return { ...clone(DB.rids[p._rid]), replay: true };
  let S = DB.spaces.find((s) => s.id === p._ws) || DB.spaces[0];
  if (flags.contaNova) S = null;
  const SEM_ESPACO_OK = ['ws.criar', 'ws.listar', 'perfil.salvar', 'convites.recebidos', 'convites.aceitar', 'convites.recusar', 'notificacoes.listar', 'notificacoes.contar', 'notificacoes.marcar_lida', 'notificacoes.preferencias', 'notificacoes.preferencias_salvar'];
  if (!S && !pub && !SEM_ESPACO_OK.includes(action)) return { ok: false, error: 'Você ainda não tem um espaço.', codigo: 'SEM_ESPACO' };
  const fn = R[action];
  if (!fn) return { ok: false, error: 'Ação desconhecida.', codigo: '' };
  if (action.startsWith('admin.') && DB.usuario.papel_plataforma !== 'admin') return { ok: false, error: 'Acesso restrito à administração.', codigo: '' };
  if (S && !pub) {
    const need = ADMIN_WS.has(action) ? 'admin' : write && !LEITURA_WRITES.has(action) && !action.startsWith('admin.') && action !== 'sistema.iniciar' ? 'editor' : 'leitura';
    if (RANK[S.papel] < RANK[need]) return { ok: false, error: need === 'admin' ? 'Só quem administra o espaço pode fazer isso.' : 'Seu papel neste espaço é só de leitura.', codigo: '' };
  }
  let res;
  const snap = write ? JSON.stringify(DB) : null;
  try { res = { ok: true, data: clone(fn(p, { S })) }; } catch (e) { if (snap) DB = JSON.parse(snap); res = { ok: false, error: e.message, codigo: e.codigo || '' }; }
  if (res.ok && p._rid) DB.rids[p._rid] = res;
  if (write) save();
  return res;
}
