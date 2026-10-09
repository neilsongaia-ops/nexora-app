// Acesso: pedir código por e-mail → digitar 6 dígitos
import { h, ls, haptic } from '../util.js';
import { icon } from '../icons.js';
import { DEMO, call, setSession, session } from '../api.js';
import { btn, formError } from '../ui/components.js';

export default function login(root, done) {
  let email = ls.get('nx.email', '') || '', timer = null;
  const err = formError();
  const card = h('div', { class: 'auth-card' });
  root.replaceChildren(h('div', { class: 'auth-bg', 'aria-hidden': 'true' }), card);

  function stepEmail() {
    clearInterval(timer);
    const input = h('input', { class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com', value: email, 'aria-label': 'E-mail', enterkeyhint: 'send', autofocus: true });
    const b = btn('Receber código', { full: true, size: 'lg', type: 'submit' });
    const form = h('form', { class: 'auth-form', novalidate: true }, h('label', { class: 'field-label', for: 'auth-email' }, 'E-mail'), input, err, b);
    input.id = 'auth-email';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = input.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.show('Confira o e-mail.'); input.focus(); return; }
      err.show('');
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { await call('auth.pedir', { email }); ls.set('nx.email', email); stepCode(); } catch (x) { err.show(x.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    });
    card.replaceChildren(brand(), h('h1', { class: 'auth-title' }, 'Suas contas e compras, em família.'), form,
      DEMO ? h('span', { class: 'badge tone-xfer auth-demo' }, icon('settings'), 'Demonstração') : h('a', { class: 'auth-link', href: '?demo=1' }, 'Explorar a demonstração'));
    setTimeout(() => input.focus(), 50);
  }

  function stepCode() {
    const boxes = Array.from({ length: 6 }, () => h('span', { class: 'otp-box', 'aria-hidden': 'true' }));
    const input = h('input', { class: 'otp-input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', 'aria-label': 'Código de 6 dígitos', enterkeyhint: 'done' });
    const otp = h('label', { class: 'otp' }, input, h('span', { class: 'otp-boxes' }, boxes));
    const draw = () => { const v = input.value; boxes.forEach((b, i) => { b.textContent = v[i] || ''; b.classList.toggle('is-cur', i === Math.min(v.length, 5) && document.activeElement === input); b.classList.toggle('is-fill', !!v[i]); }); };
    let sending = false;
    const confirm = async () => {
      if (sending || input.value.length !== 6) return;
      sending = true; otp.classList.add('is-busy'); err.show('');
      try {
        const r = await call('auth.confirmar', { email, codigo: input.value });
        setSession({ token: r.token, email: r.email });
        haptic([10, 40, 10]);
        done();
      } catch (x) { err.show(x.message); input.value = ''; draw(); otp.classList.add('is-shake'); setTimeout(() => otp.classList.remove('is-shake'), 400); input.focus(); }
      finally { sending = false; otp.classList.remove('is-busy'); }
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); draw(); if (input.value.length === 6) confirm(); });
    input.addEventListener('focus', draw); input.addEventListener('blur', draw);
    const resend = h('button', { class: 'btn btn--ghost', type: 'button', disabled: true });
    let left = 30;
    const tick = () => { resend.textContent = left > 0 ? `Reenviar em ${left}s` : 'Reenviar código'; resend.disabled = left > 0; left--; };
    tick(); timer = setInterval(tick, 1000);
    resend.onclick = async () => { resend.disabled = true; try { await call('auth.pedir', { email }); left = 30; err.show(''); } catch (x) { err.show(x.message); resend.disabled = false; } };
    card.replaceChildren(brand(), h('h1', { class: 'auth-title' }, 'Digite o código'), h('p', { class: 'auth-sub' }, 'Enviado para ', h('strong', {}, email)), otp, err,
      h('div', { class: 'auth-row' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: stepEmail }, icon('chevL'), 'Trocar e-mail'), resend));
    setTimeout(() => { input.focus(); draw(); }, 50);
  }
  const brand = () => h('div', { class: 'auth-brand' }, h('span', { class: 'logo logo--lg', 'aria-hidden': 'true' }, h('span', { class: 'logo-dot' })), h('span', { class: 'auth-name' }, 'nexora'));
  if (session.email && !session.token && ls.get('nx.retorno', '')) stepEmail(); else stepEmail();
}
