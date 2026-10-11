// Mapa para escolher um local (OpenStreetMap + Leaflet) e busca de endereço (Nominatim). Tudo carregado só quando usado.
import { h, sleep, num } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from './sheet.js';
import { btn, row } from './components.js';
import { geolocate } from './media.js';

const BELEM = [-1.4558, -48.4902];
const DEF = {
  leaflet: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  leafletSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  leafletCss: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  leafletCssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
  mapaTiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  nominatim: 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&accept-language=pt-BR&q=',
};
const cfg = (k) => (window.NEXORA_CONFIG || {})[k] || DEF[k];
export const coordTxt = (lat, lng) => num(lat, 5) + ', ' + num(lng, 5);

let leafP = null;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (!navigator.onLine) return Promise.reject(new Error('Sem internet para abrir o mapa.'));
  leafP ||= new Promise((ok, fail) => {
    const css = h('link', { rel: 'stylesheet', href: cfg('leafletCss'), integrity: cfg('leafletCssSri'), crossorigin: 'anonymous' });
    const sc = h('script', { src: cfg('leaflet'), integrity: cfg('leafletSri'), crossorigin: 'anonymous' });
    let n = 0;
    const done = () => { if (++n === 2) ok(window.L); };
    const bad = () => { leafP = null; css.remove(); sc.remove(); fail(new Error('Não foi possível abrir o mapa agora.')); };
    css.onload = done; css.onerror = bad; sc.onload = done; sc.onerror = bad;
    document.head.append(css, sc);
  });
  return leafP;
}

// Busca leve: uma por vez, no mínimo 1,1 s entre buscas, só quando a pessoa pede.
let ultima = 0, emCurso = null;
export function buscarEndereco(q) {
  if (emCurso) return emCurso;
  emCurso = (async () => {
    const espera = ultima + 1100 - Date.now();
    if (espera > 0) await sleep(espera);
    ultima = Date.now();
    if (!navigator.onLine) throw new Error('Sem internet para buscar. Use onde você está ou digite o endereço.');
    let r;
    try { r = await fetch(cfg('nominatim') + encodeURIComponent(q), { credentials: 'omit' }); }
    catch { throw new Error('Sem internet para buscar. Use onde você está ou digite o endereço.'); }
    if (!r.ok) throw new Error('A busca de endereços não respondeu. Tente de novo em instantes.');
    const js = await r.json();
    return (Array.isArray(js) ? js : []).map((x) => {
      const parts = String(x.display_name || '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'Brasil');
      return { latitude: Number(x.lat), longitude: Number(x.lon), titulo: parts.slice(0, 2).join(', '), sub: parts.slice(2, 5).join(', '), endereco: parts.slice(0, 3).join(', ') };
    }).filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
  })().finally(() => { emCurso = null; });
  return emCurso;
}
export const osmAttr = () => h('p', { class: 'osm-attr' }, h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '© OpenStreetMap'));
export function resultadosEl(lista, onPick) {
  if (!lista.length) return h('div', { class: 'map-res' }, h('p', { class: 'pick-empty' }, 'Nenhum endereço encontrado'), osmAttr());
  return h('div', { class: 'map-res' }, h('div', { class: 'list' }, lista.map((r) => row({ lead: h('span', { class: 'tipo-ico' }, icon('pin')), title: r.titulo || coordTxt(r.latitude, r.longitude), sub: r.sub || null, onClick: () => onPick(r) }))), osmAttr());
}
// Resultados da busca numa folha própria (usado no formulário, sem precisar do mapa)
export function escolherResultado(lista) {
  return new Promise((res) => {
    let out = null;
    const s = openSheet({ title: 'Endereços encontrados', content: resultadosEl(lista, (r) => { out = r; s.close(); }), onClose: () => res(out) });
  });
}

const pinHtml = () => { const e = icon('pin'); return '<span class="map-pin-in">' + e.innerHTML + '</span>'; };

/** Abre o mapa. Resolve { latitude, longitude, endereco? } ou null. */
export function escolherNoMapa({ latitude, longitude, busca = '', title = 'Escolher no mapa' } = {}) {
  return new Promise((res) => {
    let out = null, map = null, mk = null, L = null, ro = null, nomeBusca = null;
    let pos = latitude != null && longitude != null ? [Number(latitude), Number(longitude)] : null;
    const stage = h('div', { class: 'map-stage', tabindex: '-1' }, h('div', { class: 'map-load', 'aria-hidden': 'true' }, h('span', { class: 'ptr-spin' })));
    ['touchstart', 'touchmove', 'touchend'].forEach((ev) => stage.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
    const coords = h('span', { class: 'map-coords num', 'aria-live': 'polite' });
    const q = h('input', { type: 'search', placeholder: 'Buscar endereço', 'aria-label': 'Buscar endereço', value: busca, enterkeyhint: 'search' });
    const resEl = h('div');
    const bBusca = btn('Buscar', { kind: 'secondary', size: 'sm', onClick: () => buscar() });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
    const bGps = btn('Onde estou', { kind: 'secondary', size: 'sm', icon: 'locate', onClick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const p = await geolocate(); set([p.latitude, p.longitude], true); } catch (x) { coords.textContent = x.message; } finally { b.disabled = false; }
    } });
    const bCentro = btn('Marcar o centro', { kind: 'secondary', size: 'sm', icon: 'target', onClick: () => { if (map) { const c = map.getCenter(); set([c.lat, c.lng]); } } });
    bCentro.disabled = true;
    const usar = btn('Usar este local', { icon: 'check', size: 'lg', full: true, onClick: () => { if (!pos) return; out = { latitude: pos[0], longitude: pos[1], endereco: nomeBusca }; s.close(); } });
    usar.disabled = !pos;
    function drawCoords() { coords.textContent = pos ? coordTxt(pos[0], pos[1]) : 'Toque no mapa para marcar'; }
    function set(p, centrar) {
      pos = p; usar.disabled = false; nomeBusca = null; drawCoords();
      if (!map) return;
      if (!mk) {
        mk = L.marker(p, { draggable: true, keyboard: true, title: 'Local escolhido', alt: 'Local escolhido', icon: L.divIcon({ className: 'map-pin', html: pinHtml(), iconSize: [40, 48], iconAnchor: [20, 46] }) }).addTo(map);
        mk.on('dragend', () => { const ll = mk.getLatLng(); pos = [ll.lat, ll.lng]; nomeBusca = null; drawCoords(); });
      } else mk.setLatLng(p);
      if (centrar) map.setView(p, Math.max(map.getZoom(), 16));
    }
    async function buscar() {
      const t = q.value.trim();
      if (!t) { q.focus(); return; }
      bBusca.disabled = true; bBusca.setAttribute('aria-busy', 'true');
      try {
        const ls = await buscarEndereco(t);
        resEl.replaceChildren(resultadosEl(ls, (r) => { set([r.latitude, r.longitude], true); nomeBusca = r.endereco; resEl.replaceChildren(); }));
      } catch (e) { resEl.replaceChildren(h('p', { class: 'map-msg', role: 'alert' }, e.message)); }
      finally { bBusca.disabled = false; bBusca.removeAttribute('aria-busy'); }
    }
    const s = openSheet({
      title, size: 'full', className: 'sheet--map',
      content: [h('div', { class: 'map-search' }, h('label', { class: 'search' }, icon('search'), q), bBusca), resEl, stage,
        h('div', { class: 'map-bar' }, h('span', { class: 'map-where' }, icon('pin'), coords), h('div', { class: 'map-tools' }, bGps, bCentro))],
      footer: usar,
      onClose: () => { ro && ro.disconnect(); if (map) map.remove(); res(out); },
    });
    drawCoords();
    (async () => {
      try {
        L = await loadLeaflet();
        if (s.closing) return;
        await sleep(260);
        if (s.closing) return;
        let centro = pos, zoom = 16;
        if (!centro) { try { const g = await Promise.race([geolocate(), sleep(4000).then(() => null)]); centro = g ? [g.latitude, g.longitude] : null; } catch { centro = null; } }
        if (s.closing) return;
        if (!centro) { centro = BELEM; zoom = 13; }
        stage.replaceChildren();
        stage.setAttribute('aria-label', 'Mapa');
        map = L.map(stage, { zoomControl: true, attributionControl: true }).setView(centro, zoom);
        L.tileLayer(cfg('mapaTiles'), { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
        map.attributionControl.setPrefix(false);
        map.on('click', (e) => set([e.latlng.lat, e.latlng.lng]));
        if (pos) set(pos);
        bCentro.disabled = false;
        ro = new ResizeObserver(() => map && map.invalidateSize());
        ro.observe(stage);
        setTimeout(() => map && map.invalidateSize(), 120);
      } catch (e) {
        stage.classList.add('is-off');
        stage.replaceChildren(h('div', { class: 'map-off' }, icon('wifiOff'), h('p', {}, e.message)));
      }
    })();
  });
}
