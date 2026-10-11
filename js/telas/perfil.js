// Meu perfil (só da própria pessoa): foto, nome, CPF mascarado ("Mostrar" busca o número sem cache), telefone e nascimento.
import { h, uuid, HOJE } from '../util.js';
import { icon } from '../icons.js';
import { call } from '../api.js';
import { openMenu, confirmSheet, pickDate } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { capturePhoto, chooseImage, imageToAvatar, encodeAvatar } from '../ui/media.js';
import { meuAvatar, setFoto } from '../ui/avatar.js';
import { btn, iconBtn, field, textField, formError, errorState, skel, sectionHead } from '../ui/components.js';

const AVATAR_MAX = 45000, REVELAR_MS = 15000;
const dig = (s) => String(s || '').replace(/\D/g, '');
export function cpfValido(c) {
  c = dig(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(c[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
const fmtCpf = (d) => { d = d.slice(0, 11); return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join('.') + (d.length > 9 ? '-' + d.slice(9) : ''); };
const fmtTel = (d) => {
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;
  const n = d.slice(2), cut = d.length === 11 ? 5 : 4;
  return '(' + d.slice(0, 2) + ') ' + (n.length > cut ? n.slice(0, cut) + '-' + n.slice(cut) : n);
};
const fmtData = (d) => { d = d.slice(0, 8); return d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2, 4) : '') + (d.length > 4 ? '/' + d.slice(4) : ''); };
const isoParaDig = (s) => (s ? s.slice(8, 10) + s.slice(5, 7) + s.slice(0, 4) : '');
function digParaIso(d) {
  if (!d) return '';
  if (d.length !== 8) return null;
  const iso = d.slice(4) + '-' + d.slice(2, 4) + '-' + d.slice(0, 2);
  const dt = new Date(iso + 'T12:00:00');
  if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso || iso < '1900-01-01' || iso > HOJE) return null;
  return iso;
}
// Máscara que mantém o cursor no mesmo dígito
function mascara(input, fmt, max, onChange) {
  input.addEventListener('input', () => {
    const v = input.value, at = input.selectionStart ?? v.length;
    const antes = dig(v.slice(0, at)).length, d = dig(v).slice(0, max);
    input.value = fmt(d);
    let k = 0, p = 0;
    while (p < input.value.length && k < antes) { if (/\d/.test(input.value[p])) k++; p++; }
    try { input.setSelectionRange(p, p); } catch { /* campo sem seleção */ }
    onChange(d);
  });
}

export default async function perfil(ctx) {
  ctx.setTitle('Meu perfil', { back: '/ajustes' });
  const root = h('div', { class: 'perfil' }, h('div', { class: 'perfil-head', 'aria-busy': 'true' }, skel('skel-circle perfil-skel'), skel('skel-line w-40'), skel('skel-line w-60 sm')));
  ctx.view.append(root);
  let P;
  try { P = await call('perfil.ler'); } catch (e) { root.replaceChildren(errorState(e.message, ctx.refresh)); return; }
  if (!ctx.alive()) return;
  setFoto(P.avatar);

  // ---------- foto ----------
  const avWrap = h('button', { class: 'perfil-av', type: 'button', tabindex: '-1', 'aria-label': 'Trocar foto', onclick: () => trocarFoto() }, meuAvatar(P.nome || P.email, 'avatar--xl'));
  const nomeEl = h('h2', { class: 'perfil-nome' }, P.nome || 'Seu nome');
  const fotoErr = h('span', { class: 'field-err perfil-foto-err', role: 'alert' });
  const bTroca = btn('Trocar foto', { kind: 'secondary', size: 'sm', icon: 'camera', onClick: () => trocarFoto() });
  const bRemFoto = btn('Remover', { kind: 'ghost', size: 'sm', icon: 'x', onClick: () => removerFoto() });
  bRemFoto.hidden = !P.avatar;
  const head = h('div', { class: 'perfil-head' }, avWrap, nomeEl, h('span', { class: 'perfil-mail' }, P.email), h('div', { class: 'perfil-foto-acts' }, bTroca, bRemFoto), fotoErr);

  const fotoBusy = (on) => { avWrap.classList.toggle('is-busy', on); avWrap.setAttribute('aria-busy', String(on)); bTroca.disabled = on; bRemFoto.disabled = on; };
  async function enviarFoto(dados) {
    fotoErr.textContent = '';
    if (!dados) return;
    if (dados.length > AVATAR_MAX) { fotoErr.textContent = 'A foto ficou grande demais. Tente outra.'; return; }
    fotoBusy(true);
    try {
      const r = await call('perfil.salvar', { avatar: dados }, { rid: uuid() });
      P.avatar = r.avatar; setFoto(r.avatar); bRemFoto.hidden = !r.avatar;
      toast('Foto atualizada.', { tone: 'success', duration: 2000 });
    } catch (e) { fotoErr.textContent = e.message; } finally { fotoBusy(false); }
  }
  function trocarFoto() {
    openMenu({ title: 'Foto do perfil', items: [
      { icon: 'camera', label: 'Tirar foto', onClick: async () => {
        const r = await capturePhoto({ title: 'Tirar foto', square: true, side: 256, facing: 'user', encode: encodeAvatar });
        if (!r) return;
        try { enviarFoto(r.dados || await imageToAvatar(r.file)); } catch (e) { fotoErr.textContent = e.message; }
      } },
      { icon: 'image', label: 'Escolher da galeria', onClick: async () => {
        const f = await chooseImage();
        if (!f) return;
        try { enviarFoto(await imageToAvatar(f)); } catch (e) { fotoErr.textContent = e.message; }
      } },
    ] });
  }
  async function removerFoto() {
    if (!(await confirmSheet({ title: 'Remover a foto?', confirm: 'Remover', tone: 'danger' }))) return;
    fotoErr.textContent = '';
    fotoBusy(true);
    try { const r = await call('perfil.salvar', { avatar: null }, { rid: uuid() }); P.avatar = r.avatar; setFoto(null); bRemFoto.hidden = true; toast('Foto removida.', { tone: 'success', duration: 2000 }); }
    catch (e) { fotoErr.textContent = e.message; } finally { fotoBusy(false); }
  }

  // ---------- dados ----------
  const st = { nome: P.nome || '', tel: P.telefone || '', nasc: isoParaDig(P.nascimento), cpf: '' };
  let cpfModo = P.tem_cpf ? 'ver' : 'editar', revelado = null, tRev = null;
  const err = formError();

  const nomeF = textField('Nome', { value: st.nome, autocomplete: 'name', maxlength: 60, enterkeyhint: 'next', onInput: (v) => { st.nome = v; nomeF.setError(''); sync(); } });

  const cpfSlot = h('div', { class: 'cpf-slot' });
  const cpfF = field('CPF', cpfSlot, { id: 'perfil-cpf' });
  cpfF.querySelector('.field-top').append(h('span', { class: 'cpf-priv' }, icon('lock'), 'Só você vê'));
  const cpfIn = h('input', { id: 'perfil-cpf', class: 'input num', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '000.000.000-00', maxlength: 14, enterkeyhint: 'next', spellcheck: 'false' });
  mascara(cpfIn, fmtCpf, 11, (d) => { st.cpf = d; cpfF.setError(d.length === 11 && !cpfValido(d) ? 'CPF inválido. Confira os números.' : ''); sync(); });
  cpfIn.addEventListener('blur', () => { if (st.cpf && !cpfValido(st.cpf)) cpfF.setError('CPF inválido. Confira os números.'); });

  const ocultar = () => { clearTimeout(tRev); tRev = null; revelado = null; if (cpfModo === 'ver') drawCpf(); };
  async function mostrar(b) {
    if (revelado) { ocultar(); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      const r = await call('perfil.cpf');
      if (!ctx.alive() || cpfModo !== 'ver') return;
      revelado = r && r.cpf ? fmtCpf(dig(r.cpf)) : null;
      drawCpf();
      clearTimeout(tRev); tRev = setTimeout(ocultar, REVELAR_MS);
    } catch (e) { cpfF.setError(e.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  }
  function drawCpf() {
    cpfF.setError('');
    if (cpfModo === 'editar') {
      cpfIn.value = fmtCpf(st.cpf);
      cpfSlot.replaceChildren(cpfIn, P.tem_cpf ? h('div', { class: 'cpf-acts' }, btn('Cancelar', { kind: 'ghost', size: 'sm', onClick: () => { st.cpf = ''; cpfModo = 'ver'; drawCpf(); sync(); } })) : null);
      return;
    }
    const v = h('span', { class: 'cpf-v num' + (cpfModo === 'remover' ? ' is-del' : ''), 'aria-label': revelado ? 'CPF ' + revelado : 'CPF mascarado' }, revelado || P.cpf_mascarado);
    if (cpfModo === 'remover') {
      cpfSlot.replaceChildren(h('div', { class: 'cpf-box' }, v, h('div', { class: 'cpf-acts' }, btn('Desfazer', { kind: 'secondary', size: 'sm', icon: 'undo', onClick: () => { cpfModo = 'ver'; drawCpf(); sync(); } }))));
      return;
    }
    const bVer = btn(revelado ? 'Ocultar' : 'Mostrar', { kind: 'ghost', size: 'sm', icon: revelado ? 'eyeOff' : 'eye', onClick: (e) => mostrar(e.currentTarget) });
    bVer.setAttribute('aria-pressed', String(!!revelado));
    cpfSlot.replaceChildren(h('div', { class: 'cpf-box' }, v, h('div', { class: 'cpf-acts' }, bVer,
      btn('Alterar', { kind: 'ghost', size: 'sm', icon: 'edit', onClick: () => { ocultar(); st.cpf = ''; cpfModo = 'editar'; drawCpf(); sync(); cpfIn.focus(); } }),
      btn('Remover CPF', { kind: 'ghost', size: 'sm', icon: 'ban', cls: 'tone-out', onClick: () => { ocultar(); cpfModo = 'remover'; drawCpf(); sync(); } }))));
  }

  const telF = textField('Telefone', { value: fmtTel(st.tel), type: 'tel', inputmode: 'tel', autocomplete: 'tel-national', placeholder: '(00) 00000-0000', maxlength: 15, enterkeyhint: 'next' });
  mascara(telF.input, fmtTel, 11, (d) => { st.tel = d; telF.setError(''); sync(); });

  const nascF = textField('Data de nascimento', { value: fmtData(st.nasc), inputmode: 'numeric', autocomplete: 'bday', placeholder: 'dd/mm/aaaa', maxlength: 10, enterkeyhint: 'done' });
  mascara(nascF.input, fmtData, 8, (d) => { st.nasc = d; nascF.setError(''); sync(); });
  const bCal = iconBtn('calendar', 'Escolher no calendário', async () => {
    const v = await pickDate({ title: 'Data de nascimento', value: digParaIso(st.nasc) || '', min: '1900-01-01', max: HOJE });
    if (!v) return;
    st.nasc = isoParaDig(v); nascF.input.value = fmtData(st.nasc); nascF.setError(''); sync();
  }, { cls: 'in-act' });
  nascF.input.parentNode.insertBefore(h('div', { class: 'in-wrap in-wrap--btn' }, nascF.input, bCal), nascF.querySelector('.field-err'));

  const mailF = field('E-mail', h('input', { id: 'perfil-mail', class: 'input', type: 'email', value: P.email, readonly: true, 'aria-readonly': 'true' }), { id: 'perfil-mail' });

  // Só o que mudou vai para o servidor
  function mudancas() {
    const o = {};
    if (st.nome.trim() !== (P.nome || '')) o.nome = st.nome.trim();
    if (cpfModo === 'remover') o.cpf = '';
    else if (cpfModo === 'editar' && st.cpf) o.cpf = st.cpf;
    if (st.tel !== (P.telefone || '')) o.telefone = st.tel;
    if (st.nasc !== isoParaDig(P.nascimento)) o.nascimento = st.nasc;
    return o;
  }
  const bSalvar = btn('Salvar', { size: 'lg', full: true, onClick: () => salvar() });
  function sync() { bSalvar.disabled = !Object.keys(mudancas()).length; }
  const campoDoErro = (m) => (/cpf/i.test(m) ? cpfF : /telefone/i.test(m) ? telF : /nascimento/i.test(m) ? nascF : /nome/i.test(m) ? nomeF : null);

  async function salvar() {
    const o = mudancas();
    if (!Object.keys(o).length) return;
    err.show('');
    let primeiro = null;
    const erro = (f, m) => { f.setError(m); primeiro ||= f; };
    if ('nome' in o && !o.nome) erro(nomeF, 'Informe seu nome');
    if ('cpf' in o && o.cpf && !cpfValido(o.cpf)) erro(cpfF, 'CPF inválido. Confira os números.');
    if ('telefone' in o && o.telefone && !/^\d{10,11}$/.test(o.telefone)) erro(telF, 'Telefone inválido. Informe o DDD e o número.');
    if ('nascimento' in o) { const iso = digParaIso(o.nascimento); if (iso === null) erro(nascF, 'Data de nascimento inválida.'); else o.nascimento = iso; }
    if (primeiro) { const i = primeiro.querySelector('input'); i && i.focus(); return; }
    bSalvar.disabled = true; bSalvar.setAttribute('aria-busy', 'true');
    try {
      const r = await call('perfil.salvar', o, { rid: uuid() });
      if (!ctx.alive()) return;
      P = { ...r };
      st.nome = P.nome || ''; st.tel = P.telefone || ''; st.nasc = isoParaDig(P.nascimento); st.cpf = '';
      cpfModo = P.tem_cpf ? 'ver' : 'editar'; revelado = null;
      nomeF.input.value = st.nome; telF.input.value = fmtTel(st.tel); nascF.input.value = fmtData(st.nasc);
      nomeEl.textContent = P.nome || 'Seu nome';
      drawCpf();
      toast('Perfil salvo.', { tone: 'success', duration: 2000 });
    } catch (e) {
      const f = campoDoErro(e.message);
      if (f) { f.setError(e.message); const i = f.querySelector('input'); i && i.focus(); } else err.show(e.message);
    } finally { bSalvar.removeAttribute('aria-busy'); sync(); }
  }

  drawCpf(); sync();
  const vis = () => { if (document.hidden) ocultar(); };
  document.addEventListener('visibilitychange', vis);
  ctx.onCleanup(() => { clearTimeout(tRev); revelado = null; cpfSlot.replaceChildren(); document.removeEventListener('visibilitychange', vis); });

  root.replaceChildren(head,
    h('div', { class: 'sec' }, sectionHead('Dados pessoais'), err, h('div', { class: 'set-group' }, nomeF, cpfF, telF, nascF)),
    h('div', { class: 'sec' }, sectionHead('Acesso'), h('div', { class: 'set-group' }, mailF)),
    bSalvar);
}
