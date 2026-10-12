// Índice local de produtos (produtos.indice): a busca da lista roda no aparelho, a cada tecla, sem esperar a rede.
// Carga completa uma vez por espaço; depois só o que mudou (desde = "ate" anterior). INATIVO sai do índice.
import { call, session } from './api.js';
import { on } from './util.js';
import { store } from './store.js';

const MAX_LS = 150000;   // acima disso o índice fica só em memória
const idx = { ws: null, map: new Map(), hay: new Map(), ate: null, pronto: false, carga: null, upd: null, sujo: false };
const subs = new Set();

/** Mesma regra do servidor: sem maiúsculas e sem acentos. */
export const normTxt = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const chave = () => 'nx.idx.' + session.ws;
const avisar = () => subs.forEach((f) => { try { f(); } catch { /* tela já fechada */ } });

function aplicar(itens) {
  for (const p of itens || []) {
    if (!p || !p.id) continue;
    if (p.status === 'INATIVO') { idx.map.delete(p.id); idx.hay.delete(p.id); continue; }
    idx.map.set(p.id, p);
    idx.hay.set(p.id, normTxt((p.nome || '') + ' ' + (p.marca || '')));
    store.produtos.set(p.id, p);
  }
}
function reset() {
  Object.assign(idx, { ws: session.ws, map: new Map(), hay: new Map(), ate: null, pronto: false, carga: null, upd: null, sujo: false });
  try {
    const c = JSON.parse(localStorage.getItem(chave()) || 'null');
    if (c && c.ate && Array.isArray(c.itens)) { aplicar(c.itens); idx.ate = c.ate; idx.pronto = true; }
  } catch { /* cópia corrompida: carrega de novo */ }
}
function salvar() {
  try {
    const s = JSON.stringify({ ate: idx.ate, itens: [...idx.map.values()] });
    if (s.length < MAX_LS) localStorage.setItem(chave(), s); else localStorage.removeItem(chave());
  } catch { /* sem espaço: fica só em memória */ }
}
async function cargaCompleta() {
  const ws = session.ws;
  try {
    const r = await call('produtos.indice', {});
    if (ws !== session.ws) return;
    idx.map = new Map(); idx.hay = new Map();
    aplicar(r.itens); idx.ate = r.ate; idx.pronto = true;
    salvar(); avisar();
  } catch { if (ws === session.ws) idx.carga = null; }   // tenta de novo na próxima abertura
}

/** Carrega o índice (uma vez por espaço). Seguro chamar sempre ao abrir uma tela. */
export function garantir() {
  if (idx.ws !== session.ws) reset();
  if (!idx.carga) idx.carga = idx.pronto ? atualizar() : cargaCompleta();
  return idx.carga;
}
/** Atualização incremental em segundo plano (desde o último "ate"). */
export function atualizar() {
  if (idx.ws !== session.ws || !idx.pronto) return garantir();
  if (idx.upd) { idx.sujo = true; return idx.upd; }
  const ws = session.ws;
  idx.upd = (async () => {
    try {
      const r = await call('produtos.indice', { desde: idx.ate });
      if (ws !== session.ws) return;
      aplicar(r.itens);
      if (r.ate) idx.ate = r.ate;
      salvar(); avisar();
    } catch { /* sem rede: segue com o que tem */ }
    finally {
      if (ws === session.ws) { idx.upd = null; if (idx.sujo) { idx.sujo = false; atualizar(); } }
    }
  })();
  return idx.upd;
}
export const indicePronto = () => idx.ws === session.ws && idx.pronto;
/** Aplica na hora um produto que acabou de ser salvo (o incremental confirma depois). */
export function aplicarLocal(p) { if (indicePronto() && p) { aplicar([p]); salvar(); avisar(); } }
export const onIndice = (fn) => { subs.add(fn); return () => subs.delete(fn); };

/** Busca local: todas as palavras em nome + marca (qualquer ordem) ou código de barras contendo os dígitos. Ordena por nome. */
export function buscarLocal(texto, { limite = 8, filtro } = {}) {
  const t = normTxt(texto).trim();
  const ws = t.split(/\s+/).filter(Boolean);
  const dig = /^[\d\s]+$/.test(t) ? t.replace(/\s/g, '') : '';
  const out = [];
  for (const [id, p] of idx.map) {
    const hay = idx.hay.get(id) || '';
    const ok = !ws.length || ws.every((w) => hay.includes(w)) || (dig && String(p.gtin || '').includes(dig));
    if (ok && (!filtro || filtro(p))) out.push(p);
  }
  out.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { total: out.length, itens: out.slice(0, limite) };
}

// Depois de salvar/editar/inativar produto, concluir compra ou importar nota: refaz com "desde"
on('dados', () => { if (idx.pronto) atualizar(); });
on('escrita', (a) => { if (/^(produtos\.|sessoes\.concluir|nfce\.importar|precos\.|admin\.produto)/.test(a) && idx.pronto) atualizar(); });
