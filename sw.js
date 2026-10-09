// Service worker simples: abre o shell offline. Dados sempre vêm da API (POST, não cacheado).
const V = 'nexora-shell-v2';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './css/tokens.css', './css/base.css', './css/components.css', './css/telas.css',
  './js/app.js', './js/api.js', './js/util.js', './js/icons.js', './js/store.js', './js/tema.js', './js/demo.js',
  './js/ui/sheet.js', './js/ui/components.js', './js/ui/toast.js', './js/ui/gestures.js', './js/ui/charts.js', './js/ui/media.js',
  './js/telas/login.js', './js/telas/inicio.js', './js/telas/lancamentos.js', './js/telas/lancForm.js', './js/telas/lancAcoes.js',
  './js/telas/contas.js', './js/telas/agenda.js', './js/telas/planejamentos.js', './js/telas/compras.js', './js/telas/lista.js',
  './js/telas/sessao.js', './js/telas/comparar.js', './js/telas/produto.js', './js/telas/nota.js', './js/telas/admin.js', './js/telas/ajustes.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('./index.html'))));
});
