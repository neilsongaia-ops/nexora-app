// Convites: convite recebido (aceitar/recusar), tela de boas-vindas (sem espaço) e convites enviados (admin).
import { h, dmy, uuid, initials } from '../util.js';
import { icon } from '../icons.js';
import { call, invalidate } from '../api.js';
import { openSheet, confirmSheet, openMenu } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { btn, badge, tip, row, empty, errorState, skelRows } from '../ui/components.js';
import { refreshNotif } from '../ui/notificacoes.js';

const PAPEL = { leitura: 'Leitura', editor: 'Editor', admin: 'Administrador' };
const PAPEL_CURTO = { leitura: 'Leitura', editor: 'Editor', admin: 'Admin' };
const DICA = { leitura: 'Leitura só vê os dados do espaço.', editor: 'Editor lança e edita o dia a dia.', admin: 'Admin também gerencia pessoas e configurações.' };
const papelTone = (p) => (p === 'admin' ? 'in' : p === 'editor' ? 'xfer' : 'neutral');
const expirado = (e) => /não está mais disponível|expirou/i.test(e.message || '');

// Sheet de um convite recebido, com Aceitar (principal) e Recusar (confirmação rápida).
export function openConviteRecebido(cv, { onResolvido } = {}) {
  const aceitar = btn('Aceitar convite', { size: 'lg', full: true, icon: 'check' });
  const recusar = btn('Recusar', { kind: 'ghost', full: true });
  const content = h('div', { class: 'convite' },
    h('span', { class: 'convite-ico' }, icon('spaces')),
    h('h3', { class: 'convite-space' }, cv.espaco_nome),
    h('p', { class: 'convite-by' }, cv.convidado_por_nome + ' convidou você'),
    h('div', { class: 'convite-meta' },
      h('span', { class: 'field-label' }, 'Seu papel'),
      badge(PAPEL[cv.papel] || cv.papel, papelTone(cv.papel), 'users'),
      tip(DICA[cv.papel] || '')),
    h('p', { class: 'convite-exp muted' }, 'Vale até ' + dmy(cv.expira_em)));
  const s = openSheet({ title: 'Convite', content, footer: h('div', { class: 'btn-col' }, aceitar, recusar) });

  aceitar.onclick = async () => {
    aceitar.disabled = recusar.disabled = true;
    try {
      const r = await call('convites.aceitar', { id: cv.id }, { semEspaco: true });
      invalidate(); refreshNotif();
      await s.close();
      toast('Você entrou em ' + r.espaco_nome + '.', { tone: 'success', ico: 'spaces' });
      (await import('../app.js')).changeSpace(r.espaco_id);
      onResolvido && onResolvido('aceito', r);
    } catch (e) {
      aceitar.disabled = recusar.disabled = false;
      toast(e.message, { tone: 'danger' });
      if (expirado(e)) { await s.close(); refreshNotif(); onResolvido && onResolvido('sumiu'); }
    }
  };
  recusar.onclick = async () => {
    if (!(await confirmSheet({ title: 'Recusar o convite?', content: h('p', { class: 'muted' }, 'Você pode pedir um novo convite depois.'), confirm: 'Recusar convite', tone: 'danger' }))) return;
    aceitar.disabled = recusar.disabled = true;
    try {
      await call('convites.recusar', { id: cv.id }, { semEspaco: true });
      invalidate(); refreshNotif();
      await s.close();
      toast('Convite recusado.');
      onResolvido && onResolvido('recusado');
    } catch (e) {
      aceitar.disabled = recusar.disabled = false;
      toast(e.message, { tone: 'danger' });
      if (expirado(e)) { await s.close(); refreshNotif(); onResolvido && onResolvido('sumiu'); }
    }
  };
  return s;
}

// Tela de boas-vindas de quem ainda não tem espaço, mas tem convites pendentes.
export function renderBoasVindas(container, convites, { onEntrar, onCriarEspaco, onVazio }) {
  const restantes = convites.slice();
  const cards = h('div', { class: 'welcome-cards' });
  const criar = btn('Criar meu próprio espaço', { kind: 'secondary', full: true, icon: 'plus', onClick: onCriarEspaco });
  const card = h('div', { class: 'auth-card welcome-card' },
    h('div', { class: 'auth-brand' }, h('span', { class: 'logo' }, h('span', { class: 'logo-dot' })), h('span', { class: 'auth-name' }, 'nexora')),
    h('h1', { class: 'auth-title' }, restantes.length > 1 ? 'Você tem convites' : 'Você tem um convite'),
    h('p', { class: 'auth-sub' }, 'Entre num espaço para começar.'),
    cards,
    h('div', { class: 'welcome-foot' }, h('span', { class: 'welcome-or' }, 'ou'), criar));

  const remover = (cv) => { const i = restantes.indexOf(cv); if (i >= 0) restantes.splice(i, 1); if (!restantes.length) { onVazio(); return; } desenhar(); };

  const conviteCard = (cv) => {
    const aceitar = btn('Aceitar', { size: 'lg', icon: 'check' });
    const recusar = btn('Recusar', { kind: 'ghost' });
    aceitar.onclick = async () => {
      aceitar.disabled = recusar.disabled = true;
      try { const r = await call('convites.aceitar', { id: cv.id }, { semEspaco: true }); invalidate(); refreshNotif(); onEntrar(r.espaco_id); }
      catch (e) { aceitar.disabled = recusar.disabled = false; toast(e.message, { tone: 'danger' }); if (expirado(e)) remover(cv); }
    };
    recusar.onclick = async () => {
      if (!(await confirmSheet({ title: 'Recusar o convite?', content: h('p', { class: 'muted' }, 'Você pode pedir um novo convite depois.'), confirm: 'Recusar', tone: 'danger' }))) return;
      aceitar.disabled = recusar.disabled = true;
      try { await call('convites.recusar', { id: cv.id }, { semEspaco: true }); invalidate(); refreshNotif(); toast('Convite recusado.'); remover(cv); }
      catch (e) { aceitar.disabled = recusar.disabled = false; toast(e.message, { tone: 'danger' }); if (expirado(e)) remover(cv); }
    };
    return h('div', { class: 'invite-card' },
      h('div', { class: 'invite-head' },
        h('span', { class: 'avatar avatar--space' }, initials(cv.espaco_nome)),
        h('div', { class: 'invite-head-txt' },
          h('span', { class: 'invite-space truncate' }, cv.espaco_nome),
          h('span', { class: 'invite-by muted truncate' }, cv.convidado_por_nome + ' convidou você'))),
      h('div', { class: 'invite-row' },
        h('span', { class: 'invite-papel' }, h('span', { class: 'field-label' }, 'Papel'), badge(PAPEL[cv.papel] || cv.papel, papelTone(cv.papel), 'users')),
        tip(DICA[cv.papel] || '')),
      h('p', { class: 'invite-exp muted' }, icon('clock'), 'Vale até ' + dmy(cv.expira_em)),
      h('div', { class: 'invite-actions' }, recusar, aceitar));
  };

  const desenhar = () => cards.replaceChildren(...restantes.map(conviteCard));
  desenhar();
  container.replaceChildren(h('div', { class: 'auth-bg', 'aria-hidden': 'true' }), card);
}

// Convites enviados do espaço (só admin): situação, cancelar e reenviar.
export function abrirConvitesEnviados(onMudou) {
  const SIT = { PENDENTE: ['Pendente', 'warn', 'clock'], ACEITO: ['Aceito', 'in', 'check'], RECUSADO: ['Recusado', 'out', 'x'], CANCELADO: ['Cancelado', 'muted', 'ban'], EXPIRADO: ['Expirado', 'muted', 'clock'] };
  const s = openSheet({ title: 'Convites enviados', size: 'tall', content: skelRows(3) });

  const reenviar = async (c) => {
    try {
      const r = await call('membros.convidar', { email: c.email, papel: c.papel }, { rid: uuid() });
      invalidate(); refreshNotif();
      toast(r.status === 'MEMBRO' ? 'Papel alterado.' : 'Convite reenviado. Vale até ' + dmy(r.expira_em) + '.', { tone: 'success', ico: 'mail' });
      onMudou && onMudou(); draw();
    } catch (e) { toast(e.message, { tone: 'danger' }); }
  };
  const cancelar = async (c) => {
    if (!(await confirmSheet({ title: 'Cancelar o convite de ' + c.email + '?', confirm: 'Cancelar convite', tone: 'danger' }))) return;
    try { await call('convites.cancelar', { id: c.id }, { rid: uuid() }); invalidate(); toast('Convite cancelado.'); onMudou && onMudou(); draw(); }
    catch (e) { toast(e.message, { tone: 'danger' }); }
  };

  const draw = async () => {
    try {
      const cs = await call('convites.enviados');
      if (!cs.length) { s.setContent(empty({ ic: 'mail', title: 'Nenhum convite enviado' })); return; }
      s.setContent(h('div', { class: 'list' }, cs.map((c) => {
        const [lbl, tone, ic] = SIT[c.status] || ['—', 'muted'];
        const acoes = c.status === 'PENDENTE' ? ['reenviar', 'cancelar'] : c.status === 'EXPIRADO' ? ['reenviar'] : [];
        const sub = c.status === 'PENDENTE' ? PAPEL_CURTO[c.papel] + ' · vale até ' + dmy(c.expira_em)
          : c.respondido_em ? PAPEL_CURTO[c.papel] + ' · ' + dmy(c.respondido_em) : PAPEL_CURTO[c.papel];
        return row({
          lead: h('span', { class: 'tipo-ico' }, icon('mail')),
          title: c.email, sub, badges: [badge(lbl, tone, ic)],
          trail: acoes.length ? icon('dots', 'muted') : null,
          onClick: acoes.length ? () => openMenu({ title: c.email, items: [
            acoes.includes('reenviar') && { icon: 'refresh', label: 'Reenviar convite', onClick: () => reenviar(c) },
            acoes.includes('cancelar') && { icon: 'x', label: 'Cancelar convite', tone: 'out', onClick: () => cancelar(c) },
          ] }) : null,
        });
      })));
    } catch (e) { s.setContent(errorState(e.message, draw)); }
  };
  draw();
  return s;
}
