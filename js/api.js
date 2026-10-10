// Cliente único da API: api(action, payload). Injeta _tk, _ws e _rid; cache de leitura em memória e offline.
import { ls, uuid, emit } from './util.js';

const q = new URLSearchParams(location.search);
export const DEMO = q.get('demo') === '1' || !window.NEXORA_API_URL;

export const session = { token: ls.get('nx.tk', ''), email: ls.get('nx.email', ''), ws: ls.get('nx.ws', '') };
export function setSession(p) {
  Object.assign(session, p);
  ls.set('nx.tk', session.token); ls.set('nx.email', session.email); ls.set('nx.ws', session.ws);
}
export function clearSession() { setSession({ token: '', ws: '' }); memo.clear(); }

const PUBLIC = new Set(['auth.pedir', 'auth.confirmar']);
export const READS = new Set(['bootstrap', 'ws.listar', 'membros.listar', 'recursos.listar', 'categorias.listar',
  'lancamentos.listar', 'lancamentos.detalhe', 'lancamentos.historico', 'cartoes.situacao', 'faturas.listar', 'faturas.detalhe',
  'recorrencias.listar', 'planejamentos.listar', 'planejamentos.situacao', 'relatorios.painel', 'relatorios.saldos',
  'relatorios.resultado', 'relatorios.fluxo', 'relatorios.serie', 'integridade.verificar', 'produtos.listar', 'produtos.porGtin',
  'produtos.imagens', 'lojas.listar', 'lojas.proximas', 'precos.compartilhados', 'precos.historico', 'precos.evolucao',
  'alertas.precos', 'reputacao.minha', 'config.ler', 'listas.listar', 'listas.detalhe', 'sessoes.listar', 'sessoes.detalhe',
  'comparacao.lista', 'nfce.interpretar', 'admin.painel', 'admin.catalogo', 'admin.denuncias', 'exportar.espaco', 'ws.resumo', 'ws.arquivados']);
const NO_OFFLINE = new Set(['ws.resumo', 'ws.arquivados', 'produtos.imagens', 'exportar.espaco', 'nfce.interpretar', 'integridade.verificar']);
// confirmar preço e denunciar exigem só "leitura", mas são escritas (não usar cache)
export const isWrite = (a) => !READS.has(a) && !PUBLIC.has(a);

const memo = new Map();
export const invalidate = () => memo.clear();
const keyOf = (a, p) => session.ws + '|' + a + '|' + JSON.stringify(p || {});

export async function api(action, payload = {}, opts = {}) {
  const body = { ...payload };
  if (session.token) body._tk = session.token;
  if (session.ws && !opts.semEspaco) body._ws = session.ws;
  if (isWrite(action)) body._rid = opts.rid || uuid();
  let res;
  try {
    if (DEMO) res = await (await import('./demo.js')).handle(action, body);
    else {
      const r = await fetch(window.NEXORA_API_URL, {
        method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload: body }),
      });
      res = await r.json();
    }
    if (res && res.ok && READS.has(action) && !NO_OFFLINE.has(action)) persist(keyOf(action, payload), res.data);
  } catch {
    res = { ok: false, error: 'Sem conexão com o servidor.', codigo: 'REDE' };
  }
  if (!res || typeof res !== 'object') res = { ok: false, error: 'Resposta inesperada do servidor.', codigo: '' };
  if (!res.ok && res.codigo === 'REDE' && READS.has(action)) {
    const c = ls.get('nx.off.' + keyOf(action, payload), null);
    if (c) { emit('offline-cache'); return { ok: true, data: c, stale: true }; }
  }
  if (!res.ok) emit('api-erro', { action, ...res });
  else if (isWrite(action)) { memo.clear(); emit('escrita', action); }
  return res;
}

function persist(k, data) {
  try {
    const s = JSON.stringify(data);
    if (s.length < 150000) localStorage.setItem('nx.off.' + k, s);
  } catch { /* sem espaço */ }
}

export class ApiError extends Error {
  constructor(r) { super(r.error || 'Algo deu errado.'); this.codigo = r.codigo || ''; }
}
export async function call(action, payload, opts) {
  const r = await api(action, payload, opts);
  if (!r.ok) throw new ApiError(r);
  return r.data;
}
// Leitura com cache em memória por sessão (limpo após qualquer escrita)
export function load(action, payload = {}) {
  const k = keyOf(action, payload);
  if (!memo.has(k)) memo.set(k, call(action, payload).catch((e) => { memo.delete(k); throw e; }));
  return memo.get(k);
}
