// Câmera (código de barras/QR), redução de foto, leitura de PDF (pdf.js) e geolocalização sob demanda.
import { h, haptic } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from './sheet.js';
import { btn } from './components.js';

// Detector nativo quando existe; senão ZXing (iOS/Safari, Firefox), carregado sob demanda
let zxingP = null;
function loadZxing() {
  const cfg = window.NEXORA_CONFIG || {};
  zxingP ||= new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = cfg.zxing; sc.crossOrigin = 'anonymous';
    sc.onload = () => ok(window.ZXing);
    sc.onerror = () => { zxingP = null; fail(new Error('zxing')); };
    document.head.append(sc);
  });
  return zxingP;
}
const ZX_FORMATS = { ean_13: 'EAN_13', ean_8: 'EAN_8', upc_a: 'UPC_A', upc_e: 'UPC_E', code_128: 'CODE_128', qr_code: 'QR_CODE' };
async function makeDetector(formats) {
  if ('BarcodeDetector' in window) {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const fm = formats.filter((f) => supported.includes(f));
    if (fm.length) {
      const det = new window.BarcodeDetector({ formats: fm });
      return async (video) => { const c = await det.detect(video); return c[0] ? c[0].rawValue : null; };
    }
  }
  const Z = await loadZxing();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, formats.map((f) => Z.BarcodeFormat[ZX_FORMATS[f]]).filter((x) => x !== undefined));
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    if (!canvas.width) return null;
    cx.drawImage(video, 0, 0);
    try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); }
    catch { return null; }
  };
}

export function scanCode({ title = 'Ler código', formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'], manualLabel = 'Código de barras', inputmode = 'numeric' } = {}) {
  return new Promise((res) => {
    let result, stream = null, timer = null;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Câmera' });
    const frame = h('div', { class: 'scan-frame', 'aria-hidden': 'true' }, h('span', { class: 'scan-line' }));
    const stage = h('div', { class: 'scan-stage' }, video, frame);
    const status = h('p', { class: 'scan-status', 'aria-live': 'polite' });
    const input = h('input', { class: 'input', inputmode, autocomplete: 'off', placeholder: manualLabel, 'aria-label': manualLabel, enterkeyhint: 'done' });
    const done = (v) => { if (!v) return; result = v.trim(); haptic([10, 30, 10]); s.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    const s = openSheet({
      title, size: 'tall',
      content: [stage, status, h('div', { class: 'scan-manual' }, input, btn('Usar', { kind: 'secondary', onClick: () => done(input.value) }))],
      onClose: () => { clearInterval(timer); stream && stream.getTracks().forEach((t) => t.stop()); res(result); },
    });
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { stage.classList.add('is-off'); status.textContent = 'Câmera indisponível neste navegador. Digite o código.'; input.focus(); return; }
      try {
        const detect = await makeDetector(formats);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (s.closing) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        stage.classList.add('is-live');
        timer = setInterval(async () => {
          if (video.readyState < 2) return;
          try { const v = await detect(video); if (v) { clearInterval(timer); done(v); } } catch { /* quadro inválido */ }
        }, 220);
      } catch {
        stage.classList.add('is-off');
        status.textContent = 'Sem acesso à câmera. Digite o código.';
      }
    })();
  });
}

// Miniatura: JPEG com qualidade decrescente até caber no limite da API (data URL)
function encodeThumb(c) {
  const cfg = window.NEXORA_CONFIG || {}, maxc = cfg.imagemMaxChars || 30000;
  for (const q of [0.8, 0.65, 0.5, 0.35]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= maxc) return d; }
  throw new Error('A foto ficou grande demais. Tente outra.');
}
// Lê arquivo de imagem e reduz para miniatura. A redução acontece na decodificação (sem carregar os megapixels
// inteiros da foto na memória), o que importa em celulares com pouca RAM.
export async function imageToThumb(file) {
  const cfg = window.NEXORA_CONFIG || {};
  const side = cfg.imagemLado || 200;
  let bmp;
  try { bmp = await createImageBitmap(file, { resizeWidth: side * 2, resizeQuality: 'medium' }); }
  catch { bmp = await createImageBitmap(file); }
  const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return encodeThumb(c);
}
export function chooseImage({ camera } = {}) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : null });
    i.addEventListener('change', () => res(i.files[0] || null), { once: true });
    i.click();
  });
}

// Foto tirada DENTRO do app (como o leitor de código): a câmera abre numa folha, sem passar para o aplicativo de câmera do
// sistema. Isso evita que celulares com pouca memória encerrem a página enquanto a câmera externa está aberta (a página recarregava
// e a foto se perdia). O quadro já é reduzido ao capturar.
// Resolve: { dados } (miniatura pronta) | { file } (usuário preferiu a câmera do aparelho; o chamador reduz com imageToThumb) | null (cancelou).
export function capturePhoto({ title = 'Tirar foto' } = {}) {
  return new Promise((res) => {
    const cfg = window.NEXORA_CONFIG || {}, side = cfg.imagemLado || 200;
    let result = null, stream = null, taken = null;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Câmera' });
    const preview = h('img', { class: 'scan-video cap-preview', alt: 'Foto tirada', hidden: true });
    const stage = h('div', { class: 'scan-stage' }, video, preview);
    const status = h('p', { class: 'scan-status', 'aria-live': 'polite' });
    const stop = () => { stream && stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const shoot = btn('Tirar foto', { icon: 'camera', size: 'lg', full: true, onClick: () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const vw = video.videoWidth, vh = video.videoHeight, ar = 4 / 3;          // mesmo recorte 4:3 que a tela mostra
      let sw = vw, sh = vh, sx = 0, sy = 0;
      if (vw / vh > ar) { sw = Math.round(vh * ar); sx = Math.round((vw - sw) / 2); } else { sh = Math.round(vw / ar); sy = Math.round((vh - sh) / 2); }
      const c = document.createElement('canvas'), k = Math.min(1, side / Math.max(sw, sh));
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
      try { taken = encodeThumb(c); } catch (e) { status.textContent = e.message; return; }
      haptic(15); stop(); video.hidden = true; preview.src = taken; preview.hidden = false;
      shoot.hidden = true; ok.hidden = false; again.hidden = false; status.textContent = '';
    } });
    const ok = btn('Usar esta foto', { icon: 'check', size: 'lg', full: true, onClick: () => { result = { dados: taken }; s.close(); } });
    const again = btn('Refazer', { kind: 'secondary', full: true, onClick: () => { taken = null; preview.hidden = true; ok.hidden = true; again.hidden = true; start(); } });
    const device = btn('Usar a câmera do aparelho', { kind: 'secondary', full: true, icon: 'camera', onClick: async () => { const f = await chooseImage({ camera: true }); if (f) { result = { file: f }; s.close(); } } });
    ok.hidden = again.hidden = device.hidden = true; shoot.disabled = true;
    const s = openSheet({
      title, size: 'tall',
      content: [stage, status],
      footer: h('div', { class: 'cap-actions' }, shoot, ok, again, device),
      onClose: () => { stop(); res(result); },
    });
    async function start() {
      video.hidden = false; shoot.hidden = false; shoot.disabled = true; status.textContent = '';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail('Câmera interna indisponível neste navegador.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (s.closing) { stop(); return; }
        video.srcObject = stream; await video.play();
        shoot.disabled = false; stage.classList.add('is-live');
      } catch { fail('Sem acesso à câmera. Permita o uso da câmera ou use a câmera do aparelho.'); }
    }
    function fail(msg) { stage.classList.add('is-off'); status.textContent = msg; shoot.hidden = true; device.hidden = false; }
    start();
  });
}

// PDF da nota: texto extraído no navegador (nada vai a terceiros)
let pdfjsP = null;
function loadPdfjs() {
  const cfg = window.NEXORA_CONFIG || {};
  pdfjsP ||= new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = cfg.pdfjs; sc.crossOrigin = 'anonymous';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = cfg.pdfjsWorker; ok(window.pdfjsLib); };
    sc.onerror = () => { pdfjsP = null; fail(new Error('Não foi possível carregar o leitor de PDF.')); };
    document.head.append(sc);
  });
  return pdfjsP;
}
export async function pdfText(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null, line = [];
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line.join(' ')); line = []; }
      line.push(it.str); lastY = y;
    }
    if (line.length) out.push(line.join(' '));
  }
  return out.join('\n');
}
export function pickFile(accept) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept });
    i.addEventListener('change', () => res(i.files[0] || null), { once: true });
    i.click();
  });
}

export function geolocate() {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) return fail(new Error('Localização indisponível neste aparelho.'));
    navigator.geolocation.getCurrentPosition((p) => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => fail(new Error('Não foi possível obter sua localização.')), { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  });
}
export const iconEl = icon;
