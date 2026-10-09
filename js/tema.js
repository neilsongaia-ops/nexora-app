// Tema claro, escuro ou automático
import { ls } from './util.js';
const mq = matchMedia('(prefers-color-scheme: dark)');
export const getTema = () => ls.get('nx.tema', 'auto');
export function applyTema(t = getTema()) {
  ls.set('nx.tema', t);
  const dark = t === 'escuro' || (t === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? '#211c18' : '#f8f4ef';
}
mq.addEventListener('change', () => { if (getTema() === 'auto') applyTema('auto'); });
