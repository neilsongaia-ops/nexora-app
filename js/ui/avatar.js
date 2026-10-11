// Avatar da própria pessoa: iniciais na hora; a foto chega depois por perfil.ler (sob demanda, nunca no bootstrap).
// Outras pessoas continuam com avatar() de components.js (só iniciais).
import { h, initials } from '../util.js';
import { call } from '../api.js';

let foto, pend = null;
const vivos = new Set();
const valida = (d) => (typeof d === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(d) ? d : null);

function pintar(el) {
  el.classList.toggle('has-img', !!foto);
  if (foto) { const img = h('img', { alt: '', decoding: 'async' }); img.src = foto; el.replaceChildren(img); }
  else el.replaceChildren(initials(el._nome));
}
export function setFoto(d) {
  foto = valida(d);
  for (const el of vivos) { if (!el.isConnected && el._montado) vivos.delete(el); else pintar(el); }
}
export const fotoAtual = () => foto || null;
function carregar() {
  if (foto !== undefined || pend) return;
  pend = call('perfil.ler').then((p) => setFoto(p && p.avatar)).catch(() => {}).finally(() => { pend = null; });
}
export function meuAvatar(nome, cls = '') {
  const el = h('span', { class: 'avatar ' + cls, 'aria-hidden': 'true' });
  el._nome = nome || '';
  if (foto !== undefined) pintar(el); else el.textContent = initials(el._nome);
  vivos.add(el);
  requestAnimationFrame(() => { el._montado = true; });
  setTimeout(carregar, 0);
  return el;
}
