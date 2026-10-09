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

// Lê arquivo de imagem e reduz para miniatura (data URL ≤ limite da API)
export async function imageToThumb(file) {
  const cfg = window.NEXORA_CONFIG || {};
  const side = cfg.imagemLado || 200, maxc = cfg.imagemMaxChars || 30000;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.8, 0.65, 0.5, 0.35]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= maxc) return d; }
  throw new Error('A foto ficou grande demais. Tente outra.');
}
export function chooseImage({ camera } = {}) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : null });
    i.addEventListener('change', () => res(i.files[0] || null), { once: true });
    i.click();
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
