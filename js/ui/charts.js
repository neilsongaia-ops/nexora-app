// Gráficos SVG leves e interativos: rosca, barras mensais, medidor, linha, barras horizontais.
import { h, svg, money, moneyShort, reduced } from '../util.js';

function shell(cls, aria) {
  const tipEl = h('div', { class: 'chart-tip', role: 'status', 'aria-live': 'polite' });
  const wrap = h('div', { class: 'chart ' + cls, role: 'group', 'aria-label': aria }, tipEl);
  wrap.tip = (x, y, title, lines) => {
    tipEl.replaceChildren(h('strong', {}, title), ...lines.map((l) => h('span', { class: 'chart-tip-line' }, l.dot ? h('i', { class: 'chart-dot', style: { '--c': l.dot } }) : null, l.text)));
    tipEl.classList.add('is-on');
    const w = tipEl.offsetWidth, W = wrap.clientWidth;
    tipEl.style.setProperty('--x', Math.max(0, Math.min(W - w, x - w / 2)) + 'px');
    tipEl.style.setProperty('--y', Math.max(0, y - tipEl.offsetHeight - 10) + 'px');
  };
  wrap.untip = () => tipEl.classList.remove('is-on');
  wrap.addEventListener('pointerleave', () => wrap.untip());
  return wrap;
}
function responsive(wrap, draw) {
  let last = 0;
  const ro = new ResizeObserver(() => requestAnimationFrame(() => { const w = Math.round(wrap.clientWidth); if (w && Math.abs(w - last) > 4) { last = w; draw(w); } }));
  ro.observe(wrap);
  return wrap;
}

export const PALETA = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

// Rosca por categoria
export function donut(data, { center, centerSub, onSelect } = {}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const wrap = shell('chart--donut', 'Gastos por categoria');
  const S = 200, R = 78, SW = 26, C = 2 * Math.PI * R;
  let acc = 0, sel = -1;
  const centerV = svg('text', { x: S / 2, y: S / 2 + 2, class: 'donut-v', 'text-anchor': 'middle', text: center || '' });
  const centerS = svg('text', { x: S / 2, y: S / 2 + 22, class: 'donut-s', 'text-anchor': 'middle', text: centerSub || '' });
  const segs = data.map((d, i) => {
    const len = (d.value / total) * C, gap = data.length > 1 ? Math.min(3, len / 3) : 0;
    const c = svg('circle', {
      cx: S / 2, cy: S / 2, r: R, class: 'donut-seg', fill: 'none', stroke: d.color || PALETA[i % 8], 'stroke-width': SW,
      'stroke-dasharray': `${Math.max(0.01, len - gap)} ${C}`, transform: `rotate(${(acc / C) * 360 - 90} ${S / 2} ${S / 2})`,
      tabindex: '0', role: 'img', 'aria-label': `${d.label}: ${money(d.value)}, ${Math.round((d.value / total) * 100)}%`,
    });
    acc += len;
    const show = () => {
      sel = i;
      segs.forEach((s, k) => s.classList.toggle('is-dim', k !== i));
      centerV.textContent = moneyShort(d.value);
      centerS.textContent = d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label;
      onSelect && onSelect(i);
    };
    c.addEventListener('pointerenter', show);
    c.addEventListener('click', (e) => { e.stopPropagation(); sel === i ? reset() : show(); });
    c.addEventListener('focus', show);
    return c;
  });
  const reset = () => { sel = -1; segs.forEach((s) => s.classList.remove('is-dim')); centerV.textContent = center || ''; centerS.textContent = centerSub || ''; onSelect && onSelect(-1); };
  const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'donut-svg' + (reduced() ? '' : ' is-anim') },
    svg('circle', { cx: S / 2, cy: S / 2, r: R, fill: 'none', class: 'donut-track', 'stroke-width': SW }),
    svg('g', { class: 'donut-g' }, segs), centerV, centerS);
  root.addEventListener('pointerleave', reset);
  wrap.append(root);
  wrap.select = (i) => (i < 0 ? reset() : segs[i] && segs[i].dispatchEvent(new Event('pointerenter')));
  return wrap;
}

// Barras mensais: receitas × despesas, com média
export function monthBars(points, { media, labels } = {}) {
  const wrap = shell('chart--bars', 'Receitas e despesas por mês');
  return responsive(wrap, (W) => {
    const H = 200, padL = 44, padB = 26, padT = 10;
    const max = Math.max(1, ...points.flatMap((p) => [p.receitas, p.despesas])) * 1.1;
    const cw = (W - padL) / points.length, bw = Math.min(18, cw / 3.2);
    const y = (v) => padT + (H - padB - padT) * (1 - v / max);
    const grid = [0, 0.5, 1].map((k) => svg('g', {}, svg('line', { x1: padL, x2: W, y1: y(max / 1.1 * k), y2: y(max / 1.1 * k), class: 'grid' }), svg('text', { x: padL - 6, y: y(max / 1.1 * k) + 4, class: 'axis', 'text-anchor': 'end', text: moneyShort(max / 1.1 * k) })));
    const groups = points.map((p, i) => {
      const cx = padL + cw * i + cw / 2;
      const g = svg('g', { class: 'bar-g', tabindex: '0', role: 'img', 'aria-label': `${labels[i]}: receitas ${money(p.receitas)}, despesas ${money(p.despesas)}` },
        svg('rect', { x: padL + cw * i, y: padT, width: cw, height: H - padB - padT, class: 'bar-hit' }),
        svg('rect', { x: cx - bw - 1.5, y: y(p.receitas), width: bw, height: Math.max(0, H - padB - y(p.receitas)), rx: 4, class: 'bar bar--in', style: `--d:${i * 35}ms` }),
        svg('rect', { x: cx + 1.5, y: y(p.despesas), width: bw, height: Math.max(0, H - padB - y(p.despesas)), rx: 4, class: 'bar bar--out', style: `--d:${i * 35 + 15}ms` }),
        svg('text', { x: cx, y: H - 8, class: 'axis' + (i === points.length - 1 ? ' is-cur' : ''), 'text-anchor': 'middle', text: labels[i] }));
      const show = () => {
        [...root.querySelectorAll('.bar-g')].forEach((x) => x.classList.toggle('is-dim', x !== g));
        wrap.tip(cx, y(Math.max(p.receitas, p.despesas)), labels[i], [
          { dot: 'var(--in)', text: 'Receitas ' + money(p.receitas) }, { dot: 'var(--out)', text: 'Despesas ' + money(p.despesas) },
          { text: 'Resultado ' + money(p.resultado ?? p.receitas - p.despesas) }]);
      };
      g.addEventListener('pointerenter', show); g.addEventListener('click', show); g.addEventListener('focus', show);
      return g;
    });
    const avg = media ? svg('g', {}, svg('line', { x1: padL, x2: W, y1: y(media), y2: y(media), class: 'avg' })) : null;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: reduced() ? '' : 'is-anim' }, grid, groups, avg);
    root.addEventListener('pointerleave', () => root.querySelectorAll('.bar-g').forEach((x) => x.classList.remove('is-dim')));
    wrap.querySelector('svg')?.remove();
    wrap.prepend(root);
  });
}

// Medidor de limite do cartão (semicírculo)
export function gauge({ limite, usado, label = 'Limite' }) {
  const L = Math.max(0, limite || 0), u = Math.max(0, usado || 0);
  const p = L ? Math.min(1, u / L) : u ? 1 : 0, over = L ? u > L : u > 0;
  const R = 80, cx = 100, cy = 96;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const wrap = h('div', { class: 'gauge' + (over ? ' is-over' : p > 0.85 ? ' is-near' : ''), role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(L), 'aria-valuenow': String(u) });
  wrap.append(svg('svg', { viewBox: '0 0 200 110', class: 'gauge-svg' + (reduced() ? '' : ' is-anim') },
    svg('path', { d: arc, class: 'gauge-track', fill: 'none', 'stroke-width': 16, 'stroke-linecap': 'round' }),
    svg('path', { d: arc, class: 'gauge-val', fill: 'none', 'stroke-width': 16, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': `${p * 100} 100` })));
  return wrap;
}

// Linha (evolução de preço)
export function line(points, { fmt = money } = {}) {
  const wrap = shell('chart--line', 'Evolução do preço');
  return responsive(wrap, (W) => {
    const H = 170, pad = { l: 46, r: 12, t: 14, b: 24 };
    if (!points.length) return;
    const vs = points.map((p) => p.y), mn = Math.min(...vs), mx = Math.max(...vs), span = mx - mn || mx * 0.2 || 1;
    const lo = mn - span * 0.25, hi = mx + span * 0.25;
    const x = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
    const area = d + ` L${x(points.length - 1)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`;
    const dot = svg('circle', { r: 5, class: 'line-focus', cx: -20, cy: -20 });
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: reduced() ? '' : 'is-anim', tabindex: '0', 'aria-label': 'Evolução do preço; use as setas para navegar' },
      [mn, mx].map((v) => svg('g', {}, svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end', text: moneyShort(v) }))),
      svg('path', { d: area, class: 'line-area' }), svg('path', { d, class: 'line-path', fill: 'none' }),
      points.map((p, i) => svg('circle', { cx: x(i), cy: y(p.y), r: 3, class: 'line-dot' })),
      [0, points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i ? 'end' : 'start', text: points[i].label })), dot);
    let cur = -1;
    const show = (i) => { cur = i; const p = points[i]; dot.classList.add('is-on'); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.y)); wrap.tip(x(i), y(p.y), p.label, [{ text: fmt(p.y) }, p.sub ? { text: p.sub } : null].filter(Boolean)); };
    root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); const px = (e.clientX - r.left) * (W / r.width); let b = 0; points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(b) - px)) b = i; }); show(b); });
    root.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(Math.min(points.length - 1, cur + 1)); if (e.key === 'ArrowLeft') show(Math.max(0, cur - 1)); });
    root.addEventListener('focus', () => show(points.length - 1));
    wrap.querySelector('svg')?.remove();
    wrap.prepend(root);
  });
}

// Barras horizontais empilhadas (comparação de lojas)
export function hbars(rows, { max } = {}) {
  const M = max || Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  const wrap = shell('chart--hbars', 'Comparação');
  const list = h('div', { class: 'hb-list' + (reduced() ? '' : ' is-anim') }, rows.map((r, i) => {
    const tot = r.parts.reduce((s, p) => s + p.value, 0);
    const bar = h('div', { class: 'hb-track' }, r.parts.map((p) => h('span', { class: 'hb-part ' + (p.cls || ''), style: { '--w': String(p.value / M) } })));
    const el = h('div', { class: 'hb-row' + (r.best ? ' is-best' : ''), tabindex: '0', role: 'img', style: { '--d': i * 50 + 'ms' }, 'aria-label': `${r.label}: ${money(tot)}` },
      h('div', { class: 'hb-head' }, h('span', { class: 'hb-label' }, r.label), h('span', { class: 'hb-val num' }, money(tot))), bar);
    const show = () => { const b = el.getBoundingClientRect(), w = wrap.getBoundingClientRect(); wrap.tip(b.left - w.left + b.width / 2, b.top - w.top, r.label, r.parts.map((p) => ({ text: `${p.label} ${money(p.value)}` }))); };
    el.addEventListener('pointerenter', show); el.addEventListener('focus', show); el.addEventListener('click', show);
    return el;
  }));
  wrap.append(list);
  return wrap;
}
