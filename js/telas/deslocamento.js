// Deslocamento (de cada pessoa): endereços, veículos, preço dos combustíveis e transportes usados na comparação de lojas.
import { h, money, num, uuid } from '../util.js';
import { icon } from '../icons.js';
import { call, invalidate } from '../api.js';
import { openSheet, openMenu, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { geolocate } from '../ui/media.js';
import { escolherNoMapa, buscarEndereco, escolherResultado, coordTxt } from '../ui/mapa.js';
import { row, badge, empty, errorState, skelRows, sectionHead, btn, textField, moneyField, pickField, toggle, formError, segmented } from '../ui/components.js';

export const TIPO_MODO = {
  A_PE: { label: 'A pé', icon: 'walk' }, ONIBUS: { label: 'Ônibus', icon: 'bus' }, VEICULO: { label: 'Veículo', icon: 'car' },
  APP: { label: 'App ou táxi', icon: 'phone' }, OUTRO: { label: 'Outro', icon: 'route' },
};
export const TIPO_VEIC = { CARRO: { label: 'Carro', icon: 'car' }, MOTO: { label: 'Moto', icon: 'moto' }, OUTRO: { label: 'Outro', icon: 'route' } };
const DO_COMB = { GASOLINA: 'da gasolina', ETANOL: 'do etanol', DIESEL: 'do diesel', GNV: 'do GNV', ELETRICO: 'da energia elétrica' };
const UN_TXT = { litro: 'litro', 'm³': 'm³', kWh: 'kWh' };
const ativo = (x) => x && x.status !== 'INATIVO';
const combDe = (d, c) => (d.combustiveis || []).find((x) => x.combustivel === c) || { combustivel: c, nome: c, unidade: c === 'GNV' ? 'm³' : c === 'ELETRICO' ? 'kWh' : 'litro', preco: null };
export const consumoUn = (d, c) => 'km/' + ({ litro: 'l', 'm³': 'm³', kWh: 'kWh' }[combDe(d, c).unidade] || 'l');
export const kmTxt = (v) => 'R$\u00a0' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 }) + '/km';
const cpk = (d, v) => { const p = combDe(d, v.combustivel).preco; return v.consumo > 0 && p > 0 ? p / v.consumo : null; };

/** O que falta para calcular (texto curto) ou null. */
export function faltaModo(m, d) {
  if (!m || !m.incompleto) return null;
  if (m.tipo === 'VEICULO' && d) {
    const v = (d.veiculos || []).find((x) => x.id === m.veiculo_id);
    if (!v) return 'Escolha o veículo para calcular';
    if (!(v.consumo > 0)) return 'Informe o consumo do veículo para calcular';
    if (combDe(d, v.combustivel).preco == null) return 'Informe o preço ' + (DO_COMB[v.combustivel] || 'do combustível') + ' para calcular';
  }
  return 'Complete este transporte para calcular';
}
/** Custo do transporte em uma linha (sem fórmula). */
export function custoModo(m) {
  if (m.tipo === 'A_PE') return 'Sem custo';
  if (m.incompleto) return null;
  if (m.tipo === 'ONIBUS') return money(m.tarifa) + ' por viagem';
  if (m.tipo === 'VEICULO') return kmTxt(m.custo_km);
  return [m.tarifa > 0 ? money(m.tarifa) + ' por viagem' : null, m.custo_km > 0 ? kmTxt(m.custo_km) : null].filter(Boolean).join(' + ') || 'Sem custo';
}
export const modoIcon = (m) => (m.tipo === 'VEICULO' && m._veic ? TIPO_VEIC[m._veic.tipo] || TIPO_MODO.VEICULO : TIPO_MODO[m.tipo] || TIPO_MODO.OUTRO).icon;

export default async function deslocamento(ctx) {
  const de = ctx.query.get('de');
  ctx.setTitle('Deslocamento', { back: de && de.startsWith('/') ? de : '/ajustes' });
  const endEl = h('div', { class: 'sec' }, sectionHead('Endereços'), skelRows(2));
  const modEl = h('div', { class: 'sec' }, sectionHead('Transportes'), skelRows(3));
  const veicEl = h('div', { class: 'sec' }, sectionHead('Veículos'), skelRows(1));
  const combEl = h('div', { class: 'sec' }, sectionHead('Preço dos combustíveis'), skelRows(2));
  const root = h('div', { class: 'cols desl' }, h('div', { class: 'sec' }, endEl, modEl), h('div', { class: 'sec' }, veicEl, combEl));
  ctx.view.append(root);
  let d = null;

  async function reload({ semComb } = {}) {
    try { d = await call('deslocamento.ler', {}); } catch (e) { root.replaceChildren(errorState(e.message, ctx.refresh)); return; }
    if (!ctx.alive()) return;
    d.modos.forEach((m) => { m._veic = d.veiculos.find((v) => v.id === m.veiculo_id) || null; });
    drawEnd(); drawModos(); drawVeic();
    if (!semComb) drawComb();
  }
  const salvo = (msg) => { invalidate(); toast(msg, { tone: 'success', duration: 2200 }); };
  const head = (t, label, onClick) => sectionHead(t, btn(label, { kind: 'ghost', size: 'sm', icon: 'plus', onClick }));

  // ---------- endereços ----------
  function drawEnd() {
    const ls = d.enderecos.filter(ativo);
    endEl.replaceChildren(head('Endereços', 'Novo', () => enderecoForm()),
      ls.length ? h('div', { class: 'list' }, ls.map((e) => row({
        lead: h('span', { class: 'tipo-ico' + (e.padrao ? ' tone-in' : '') }, icon(e.padrao ? 'home' : 'pin')),
        title: e.nome, sub: e.endereco || coordTxt(e.latitude, e.longitude), badges: e.padrao ? [badge('Padrão', 'in', 'check')] : null,
        trail: icon('dots', 'muted'), aria: e.nome + (e.padrao ? ', padrão' : ''),
        onClick: () => openMenu({ title: e.nome, subtitle: e.endereco || null, items: [
          { icon: 'edit', label: 'Editar', onClick: () => enderecoForm(e) },
          !e.padrao && { icon: 'check', label: 'Tornar padrão', onClick: () => salvarEnd({ ...base(e), padrao: true }, 'Endereço padrão alterado.') },
          { icon: 'ban', label: 'Remover', tone: 'out', onClick: async () => { if (await confirmSheet({ title: `Remover “${e.nome}”?`, confirm: 'Remover', tone: 'danger' })) salvarEnd({ ...base(e), status: 'INATIVO' }, 'Endereço removido.'); } },
        ] }),
      }))) : empty({ ic: 'home', title: 'Cadastre onde você mora para ver o custo de ir às lojas', action: btn('Cadastrar endereço', { icon: 'plus', onClick: () => enderecoForm() }) }));
  }
  const base = (e) => ({ id: e.id, nome: e.nome, endereco: e.endereco || undefined, latitude: e.latitude, longitude: e.longitude });
  async function salvarEnd(p, msg) { try { await call('enderecos.salvar', p, { rid: uuid() }); salvo(msg); reload({ semComb: true }); } catch (e) { toast(e.message, { tone: 'danger' }); } }

  function enderecoForm(edit) {
    const st = { nome: '', endereco: '', latitude: null, longitude: null, padrao: false, ...(edit || {}) };
    st.endereco = st.endereco || '';
    const err = formError(), rid = uuid();
    const temOutros = d.enderecos.filter(ativo).some((x) => !edit || x.id !== edit.id);
    const fn = textField('Nome', { value: st.nome, placeholder: 'Ex.: Casa, Trabalho', autofocus: !edit, onInput: (v) => { st.nome = v; fn.setError(''); } });
    const fe = textField('Endereço', { value: st.endereco, placeholder: 'Rua, número, bairro', autocomplete: 'street-address', onInput: (v) => { st.endereco = v; fe.setError(''); } });
    const locTxt = h('span', { class: 'loc-txt' }), locIco = h('span', { class: 'tipo-ico' });
    const locErr = h('span', { class: 'field-err', role: 'alert' });
    const drawLoc = () => {
      const ok = st.latitude != null;
      locIco.className = 'tipo-ico' + (ok ? ' tone-in' : '');
      locIco.replaceChildren(icon(ok ? 'check' : 'pin'));
      locTxt.replaceChildren(h('span', { class: 'loc-k' }, ok ? 'Local marcado' : 'Sem local'), ok ? h('span', { class: 'loc-sub num' }, coordTxt(st.latitude, st.longitude)) : '');
      if (ok) locErr.textContent = '';
    };
    const setLoc = (p) => { st.latitude = p.latitude; st.longitude = p.longitude; if (p.endereco && !st.endereco.trim()) { st.endereco = p.endereco; fe.input.value = p.endereco; } drawLoc(); };
    const wrap = async (b, fn2) => { b.disabled = true; b.setAttribute('aria-busy', 'true'); try { await fn2(); } catch (x) { locErr.textContent = x.message; } finally { b.disabled = false; b.removeAttribute('aria-busy'); } };
    const bGps = btn('Onde estou', { kind: 'secondary', size: 'sm', icon: 'locate', onClick: (e) => wrap(e.currentTarget, async () => setLoc(await geolocate())) });
    const bBusca = btn('Buscar', { kind: 'secondary', size: 'sm', icon: 'search', onClick: (e) => wrap(e.currentTarget, async () => {
      const q = st.endereco.trim();
      if (!q) { fe.setError('Digite o endereço para buscar'); fe.input.focus(); return; }
      const r = await escolherResultado(await buscarEndereco(q));
      if (r) setLoc(r);
    }) });
    const bMapa = btn('No mapa', { kind: 'secondary', size: 'sm', icon: 'map', onClick: async () => { const r = await escolherNoMapa({ latitude: st.latitude, longitude: st.longitude, busca: st.endereco.trim() }); if (r) setLoc(r); } });
    drawLoc();
    const pad = temOutros ? toggle('Endereço padrão', { checked: !!st.padrao, disabled: !!(edit && edit.padrao), onChange: (v) => { st.padrao = v; } }) : null;
    const b = btn(edit ? 'Salvar' : 'Cadastrar endereço', { size: 'lg', full: true });
    b.onclick = async () => {
      if (!st.nome.trim()) { fn.setError('Dê um nome'); fn.input.focus(); return; }
      if (st.latitude == null) { locErr.textContent = 'Marque o local'; bGps.focus(); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        await call('enderecos.salvar', { ...(edit ? { id: edit.id } : {}), nome: st.nome.trim(), endereco: st.endereco.trim() || undefined, latitude: st.latitude, longitude: st.longitude, padrao: st.padrao || undefined }, { rid });
        await s.close(); salvo(edit ? 'Endereço salvo.' : 'Endereço cadastrado.'); reload({ semComb: true });
      } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const s = openSheet({ title: edit ? 'Editar endereço' : 'Novo endereço', footer: b, content: [err, fn, fe,
      h('div', { class: 'field loc-field' }, h('span', { class: 'field-label' }, 'Local'),
        h('div', { class: 'loc-box' }, h('div', { class: 'loc-now' }, locIco, locTxt), h('div', { class: 'loc-acts' }, bGps, bBusca, bMapa)), locErr),
      pad ? h('div', { class: 'set-group' }, pad) : null] });
  }

  // ---------- transportes ----------
  function drawModos() {
    const ls = d.modos.filter(ativo);
    modEl.replaceChildren(head('Transportes', 'Novo', () => modoForm()),
      ls.length ? h('div', { class: 'list' }, ls.map((m) => {
        const falta = faltaModo(m, d);
        return row({
          lead: h('span', { class: 'tipo-ico' + (falta ? ' tone-warn' : m.padrao ? ' tone-in' : '') }, icon(modoIcon(m))),
          title: m.nome, sub: falta || custoModo(m),
          badges: [m.padrao ? badge('Padrão', 'in', 'check') : null, falta ? badge('Incompleto', 'warn', 'alert') : null].filter(Boolean),
          trail: icon('dots', 'muted'), aria: [m.nome, m.padrao ? 'padrão' : null, falta].filter(Boolean).join(', '),
          onClick: () => openMenu({ title: m.nome, items: [
            { icon: 'edit', label: 'Editar', onClick: () => modoForm(m) },
            m.tipo === 'VEICULO' && m._veic && { icon: 'car', label: 'Editar veículo', onClick: () => veiculoForm(m._veic) },
            !m.padrao && { icon: 'check', label: 'Tornar padrão', onClick: () => salvarModo({ ...baseM(m), padrao: true }, 'Transporte padrão alterado.') },
            { icon: 'ban', label: 'Remover', tone: 'out', onClick: async () => { if (await confirmSheet({ title: `Remover “${m.nome}”?`, confirm: 'Remover', tone: 'danger' })) salvarModo({ ...baseM(m), status: 'INATIVO' }, 'Transporte removido.'); } },
          ] }),
        });
      })) : empty({ ic: 'route', title: 'Cadastre como você vai às lojas', action: btn('Cadastrar transporte', { icon: 'plus', onClick: () => modoForm() }) }));
  }
  const baseM = (m) => ({ id: m.id, nome: m.nome, tipo: m.tipo, veiculo_id: m.tipo === 'VEICULO' ? m.veiculo_id : undefined, tarifa: ['ONIBUS', 'APP', 'OUTRO'].includes(m.tipo) ? m.tarifa : undefined, custo_km: ['APP', 'OUTRO'].includes(m.tipo) ? m.custo_km : undefined });
  async function salvarModo(p, msg) { try { await call('modos.salvar', p, { rid: uuid() }); salvo(msg); reload({ semComb: true }); } catch (e) { toast(e.message, { tone: 'danger' }); } }

  function modoForm(edit) {
    const st = { nome: '', tipo: 'ONIBUS', veiculo_id: null, tarifa: 0, custo_km: 0, padrao: false, ...(edit || {}) };
    let nomeTocado = !!edit;
    const err = formError(), rid = uuid();
    const veics = () => d.veiculos.filter(ativo).map((v) => ({ value: v.id, label: v.nome, icon: (TIPO_VEIC[v.tipo] || TIPO_VEIC.OUTRO).icon, sub: [combDe(d, v.combustivel).nome, v.consumo > 0 ? num(v.consumo, 1) + ' ' + consumoUn(d, v.combustivel) : null].filter(Boolean).join(' · ') }));
    const autoNome = () => { if (nomeTocado) return; const v = d.veiculos.find((x) => x.id === st.veiculo_id); st.nome = st.tipo === 'VEICULO' && v ? v.nome : TIPO_MODO[st.tipo].label; fn.input.value = st.nome; };
    const fn = textField('Nome', { value: st.nome, onInput: (v) => { st.nome = v; nomeTocado = true; fn.setError(''); } });
    const ft = pickField('Tipo', { value: st.tipo, items: Object.entries(TIPO_MODO).map(([value, o]) => ({ value, label: o.label, icon: o.icon })), onChange: (v) => { st.tipo = v; autoNome(); drawCampos(); } });
    const campos = h('div', { class: 'desl-campos' });
    const fv = pickField('Veículo', { value: st.veiculo_id, items: veics, placeholder: 'Escolher veículo', action: { label: 'Cadastrar veículo', icon: 'plus', onClick: () => veiculoForm(null, (v) => { st.veiculo_id = v.id; fv.set(v.id); autoNome(); }) }, onChange: (v) => { st.veiculo_id = v; fv.setError(''); autoNome(); } });
    const ftar = moneyField('Tarifa por viagem', { value: st.tarifa, onChange: (v) => { st.tarifa = v; } });
    const fkm = moneyField('Valor por km', { value: st.custo_km, onChange: (v) => { st.custo_km = v; } });
    const drawCampos = () => {
      const t = st.tipo;
      campos.replaceChildren(...(t === 'VEICULO' ? [fv] : t === 'ONIBUS' ? [ftar] : t === 'APP' || t === 'OUTRO' ? [h('div', { class: 'grid-2' }, ftar, fkm)] : []));
    };
    drawCampos();
    autoNome();
    const temOutros = d.modos.filter(ativo).some((x) => !edit || x.id !== edit.id);
    const pad = temOutros ? toggle('Transporte padrão', { checked: !!st.padrao, disabled: !!(edit && edit.padrao), onChange: (v) => { st.padrao = v; } }) : null;
    const b = btn(edit ? 'Salvar' : 'Cadastrar transporte', { size: 'lg', full: true });
    b.onclick = async () => {
      if (!st.nome.trim()) { fn.setError('Dê um nome'); return; }
      if (st.tipo === 'VEICULO' && !st.veiculo_id) { fv.setError('Escolha o veículo'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        const t = st.tipo;
        await call('modos.salvar', { ...(edit ? { id: edit.id } : {}), nome: st.nome.trim(), tipo: t, veiculo_id: t === 'VEICULO' ? st.veiculo_id : undefined,
          tarifa: ['ONIBUS', 'APP', 'OUTRO'].includes(t) ? st.tarifa : undefined, custo_km: ['APP', 'OUTRO'].includes(t) ? st.custo_km : undefined, padrao: st.padrao || undefined }, { rid });
        await s.close(); salvo(edit ? 'Transporte salvo.' : 'Transporte cadastrado.'); reload({ semComb: true });
      } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const s = openSheet({ title: edit ? 'Editar transporte' : 'Novo transporte', footer: b, content: [err, ft, fn, campos, pad ? h('div', { class: 'set-group' }, pad) : null] });
  }

  // ---------- veículos ----------
  function drawVeic() {
    const ls = d.veiculos.filter(ativo);
    veicEl.replaceChildren(head('Veículos', 'Novo', () => veiculoForm()),
      ls.length ? h('div', { class: 'list' }, ls.map((v) => {
        const k = cpk(d, v), c = combDe(d, v.combustivel);
        const falta = !(v.consumo > 0) ? 'Sem consumo' : c.preco == null ? 'Sem preço ' + (DO_COMB[v.combustivel] || '') : null;
        return row({
          lead: h('span', { class: 'tipo-ico' + (falta ? ' tone-warn' : '') }, icon((TIPO_VEIC[v.tipo] || TIPO_VEIC.OUTRO).icon)),
          title: v.nome, sub: [c.nome, v.consumo > 0 ? num(v.consumo, 1) + ' ' + consumoUn(d, v.combustivel) : null].filter(Boolean).join(' · '),
          badges: falta ? [badge(falta, 'warn', 'alert')] : null,
          trail: h('span', { class: 'num' }, k != null ? kmTxt(k) : '—'), aria: [v.nome, falta, k != null ? kmTxt(k) : null].filter(Boolean).join(', '),
          onClick: () => openMenu({ title: v.nome, items: [
            { icon: 'edit', label: 'Editar', onClick: () => veiculoForm(v) },
            { icon: 'ban', label: 'Remover', tone: 'out', onClick: async () => {
              if (!(await confirmSheet({ title: `Remover “${v.nome}”?`, content: h('p', { class: 'muted' }, 'O transporte deste veículo também sai da lista.'), confirm: 'Remover', tone: 'danger' }))) return;
              try { await call('veiculos.salvar', { id: v.id, nome: v.nome, tipo: v.tipo, combustivel: v.combustivel, consumo: v.consumo, status: 'INATIVO' }, { rid: uuid() }); salvo('Veículo removido.'); reload({ semComb: true }); } catch (e) { toast(e.message, { tone: 'danger' }); }
            } },
          ] }),
        });
      })) : empty({ ic: 'car', title: 'Nenhum veículo', action: btn('Cadastrar veículo', { kind: 'secondary', icon: 'plus', onClick: () => veiculoForm() }) }));
  }

  function veiculoForm(edit, after) {
    const st = { nome: '', tipo: 'CARRO', combustivel: 'GASOLINA', consumo: null, ...(edit || {}) };
    const err = formError(), rid = uuid();
    let preco = null;
    const fn = textField('Nome', { value: st.nome, placeholder: 'Ex.: Carro da família', autofocus: !edit, onInput: (v) => { st.nome = v; fn.setError(''); } });
    const fTipo = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tipo'),
      segmented(Object.entries(TIPO_VEIC).map(([value, o]) => ({ value, label: o.label, icon: o.icon })), { value: st.tipo, aria: 'Tipo de veículo', onChange: (v) => { st.tipo = v; } }));
    const fc = pickField('Combustível', { value: st.combustivel, items: () => d.combustiveis.map((c) => ({ value: c.combustivel, label: c.nome, icon: 'fuel', right: c.preco != null ? money(c.preco) : null, sub: c.preco == null ? 'Não informado' : 'por ' + (UN_TXT[c.unidade] || c.unidade) })), onChange: (v) => { st.combustivel = v; drawUn(); } });
    const fcons = textField('Consumo', { value: st.consumo ? String(st.consumo).replace('.', ',') : '', inputmode: 'decimal', placeholder: 'Ex.: 11,5', onInput: (v) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); st.consumo = v.trim() && n > 0 ? n : null; fcons.setError(''); drawPrev(); } });
    const unEl = h('span', { class: 'in-suffix', 'aria-hidden': 'true' });
    fcons.input.parentNode.insertBefore(h('div', { class: 'in-wrap' }, fcons.input, unEl), fcons.querySelector('.field-err'));
    const precoSlot = h('div');
    const prev = h('div', { class: 'desl-prev', 'aria-live': 'polite' });
    const drawPrev = () => {
      const c = combDe(d, st.combustivel), p = c.preco ?? preco;
      if (st.consumo > 0 && p > 0) prev.replaceChildren(h('span', { class: 'desl-prev-k' }, 'Custo por km'), h('span', { class: 'desl-prev-v num' }, kmTxt(p / st.consumo)));
      else prev.replaceChildren(h('div', { class: 'warn-item' }, icon('alert'), h('span', {}, !(st.consumo > 0) ? 'Informe o consumo para calcular' : 'Informe o preço ' + (DO_COMB[st.combustivel] || 'do combustível') + ' para calcular')));
    };
    const drawUn = () => {
      const c = combDe(d, st.combustivel);
      unEl.textContent = consumoUn(d, st.combustivel);
      fcons.querySelector('.field-label').textContent = 'Consumo (' + consumoUn(d, st.combustivel) + ')';
      preco = null;
      precoSlot.replaceChildren(c.preco == null ? moneyField('Preço ' + (DO_COMB[st.combustivel] || '') + ' (por ' + (UN_TXT[c.unidade] || c.unidade) + ')', { value: 0, onChange: (v) => { preco = v > 0 ? v : null; drawPrev(); } }) : '');
      drawPrev();
    };
    drawUn();
    const b = btn(edit ? 'Salvar' : 'Cadastrar veículo', { size: 'lg', full: true });
    b.onclick = async () => {
      if (!st.nome.trim()) { fn.setError('Dê um nome'); fn.input.focus(); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        if (preco > 0) { const cs = await call('combustiveis.salvar', { combustivel: st.combustivel, preco }, { rid: uuid() }); if (Array.isArray(cs)) d.combustiveis = cs; }
        const v = await call('veiculos.salvar', { ...(edit ? { id: edit.id } : {}), nome: st.nome.trim(), tipo: st.tipo, combustivel: st.combustivel, consumo: st.consumo }, { rid });
        await s.close(); salvo(edit ? 'Veículo salvo.' : 'Veículo cadastrado. Ele já aparece em Transportes.');
        await reload({ semComb: !(preco > 0) });
        after && v && after(v);
      } catch (e) { err.show(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    const s = openSheet({ title: edit ? 'Editar veículo' : 'Novo veículo', footer: b, content: [err, fn, fTipo, h('div', { class: 'grid-2' }, fc, fcons), precoSlot, prev] });
  }

  // ---------- combustíveis ----------
  function drawComb() {
    const timers = {};
    combEl.replaceChildren(sectionHead('Preço dos combustíveis'), h('div', { class: 'set-group comb-list' }, d.combustiveis.map((c) => {
      const st = h('span', { class: 'comb-st', 'aria-live': 'polite' });
      const f = moneyField(c.nome, { value: c.preco || 0, onChange: (v) => {
        st.textContent = '';
        clearTimeout(timers[c.combustivel]);
        timers[c.combustivel] = setTimeout(async () => {
          try {
            const cs = await call('combustiveis.salvar', { combustivel: c.combustivel, preco: v > 0 ? v : null }, { rid: uuid() });
            if (Array.isArray(cs)) d.combustiveis = cs;
            st.textContent = 'Salvo';
            setTimeout(() => { st.textContent = ''; }, 2000);
            invalidate();
            reload({ semComb: true });
          } catch (e) { toast(e.message, { tone: 'danger' }); }
        }, 800);
      } });
      f.input.placeholder = 'Não informado';
      f.input.setAttribute('aria-label', 'Preço ' + (DO_COMB[c.combustivel] || c.nome) + ' por ' + (UN_TXT[c.unidade] || c.unidade));
      f.querySelector('.field-top').append(h('span', { class: 'comb-un' }, 'por ' + (UN_TXT[c.unidade] || c.unidade)), st);
      return f;
    })));
  }

  reload();
}
