// Estado do app: bootstrap, papéis, mapas de categorias e recursos.
import { call, session, setSession } from './api.js';
import { setHoje, emit } from './util.js';

export const store = { boot: null, cats: new Map(), recs: new Map(), role: 'leitura', admin: false, produtos: new Map() };
const RANK = { leitura: 1, editor: 2, admin: 3 };

export async function loadBoot() {
  const b = await call('bootstrap');
  store.boot = b;
  setHoje(b.hoje);
  store.cats = new Map((b.categorias || []).map((c) => [c.id, c]));
  store.recs = new Map((b.recursos || []).map((r) => [r.id, r]));
  store.role = (b.espaco && b.espaco.papel) || 'leitura';
  store.admin = !!(b.usuario && b.usuario.papel_plataforma === 'admin');
  if (b.espaco && b.espaco.id !== session.ws) setSession({ ws: b.espaco.id });
  emit('boot', b);
  return b;
}
export const can = (min) => (RANK[store.role] || 0) >= RANK[min];
export const cat = (id) => store.cats.get(id);
export const rec = (id) => store.recs.get(id);
export function catNome(id) {
  const c = cat(id);
  if (!c) return '';
  const p = c.pai_id && cat(c.pai_id);
  return p ? `${p.nome} › ${c.nome}` : c.nome;
}
export const recursosAtivos = (tipos) => [...store.recs.values()].filter((r) => r.status !== 'INATIVO' && (!tipos || tipos.includes(r.tipo)));
export const categoriasDe = (tipo) => [...store.cats.values()].filter((c) => c.tipo === tipo && c.status !== 'INATIVA');
export const saldoDe = (id) => {
  const s = store.boot && store.boot.saldos;
  if (!s) return null;
  return (s.contas || []).find((c) => c.id === id) || s[id] || null;
};
