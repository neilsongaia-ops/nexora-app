// Ajustes: perfil, aparência, notificações, espaço e pessoas, categorias, preços e deslocamento, reputação, exportar, sair
import { h, money, uuid, emit, ls, dmy } from '../util.js';
import { icon } from '../icons.js';
import { DEMO, call, load, clearSession, invalidate, session } from '../api.js';
import { store, can, loadBoot, catNome } from '../store.js';
import { openSheet, openMenu, pick, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { refreshNotif, prefsLista } from '../ui/notificacoes.js';
import { abrirConvitesEnviados } from './convites.js';
import { geolocate } from '../ui/media.js';
import { segmented, card, row, badge, empty, errorState, skelRows, sectionHead, btn, textField, moneyField, toggle, formError, avatar, kv, tip } from '../ui/components.js';
import { applyTema, getTema } from '../tema.js';

const PAPEL = { leitura: 'Leitura', editor: 'Editor', admin: 'Admin' };

export default async function ajustes(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Ajustes');
  const b = store.boot, u = b.usuario, admin = can('admin');
  const nav = (ic, label, sub, onClick, tone) => row({ lead: h('span', { class: 'tipo-ico' + (tone ? ' tone-' + tone : '') }, icon(ic)), title: label, sub, trail: icon('chevR', 'muted'), onClick });
  const cfgEl = h('div', { class: 'set-group' }, skelRows(2));
  view.append(h('div', { class: 'cols' },
    h('div', { class: 'sec' },
      h('div', { class: 'set-group' }, row({ lead: avatar(u.nome || u.email), title: u.nome || 'Seu nome', sub: u.email, trail: icon('edit', 'muted'), onClick: perfil })),
      sectionHead('Aparência'),
      h('div', { class: 'set-group' }, h('div', { class: 'set-row' }, segmented([{ value: 'claro', label: 'Claro', icon: 'sun' }, { value: 'escuro', label: 'Escuro', icon: 'moon' }, { value: 'auto', label: 'Automático', icon: 'auto' }], { value: getTema(), aria: 'Tema', cls: 'theme-pick', onChange: (v) => applyTema(v) }))),
      sectionHead('Notificações'), prefsLista(),
      sectionHead('Espaço: ' + b.espaco.nome),
      h('div', { class: 'set-group' },
        admin ? nav('edit', 'Renomear espaço', null, renomearEspaco) : null,
        admin ? nav('users', 'Pessoas e papéis', null, pessoas) : row({ lead: h('span', { class: 'tipo-ico' }, icon('users')), title: 'Seu papel', trail: badge(PAPEL[b.espaco.papel], b.espaco.papel === 'leitura' ? 'neutral' : 'in') }),
        nav('tag', 'Categorias', `${b.categorias.length} categorias`, categorias),
        admin ? nav('download', 'Exportar dados do espaço', 'Arquivo JSON', exportar) : null,
        admin ? nav('shield', 'Verificar integridade', null, integridade) : null,
        admin ? nav('x', 'Arquivar ou excluir este espaço', null, arquivarEspaco, 'out') : null)),
    h('div', { class: 'sec' },
      sectionHead('Preços e deslocamento'), cfgEl,
      sectionHead('Minha reputação'), repEl(),
      sectionHead('Outros'),
      h('div', { class: 'set-group' },
        matchMedia('(pointer:fine)').matches ? nav('keyboard', 'Atalhos de teclado', null, () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))) : null,
        nav('spaces', 'Espaços arquivados', null, arquivados),
        DEMO ? nav('settings', 'Modo demonstração', 'Simular estados', openDemoPanel, 'xfer') : null,
        nav('logout', 'Sair', null, sair, 'out')))));

  try {
    const c = await load('config.ler');
    const dis = !admin;
    const share = toggle('Compartilhar meus preços', { checked: c.compartilhar_precos, disabled: dis, sub: 'Sem identificar você. Ajuda toda a comunidade.', onChange: (v) => salvar({ compartilhar_precos: v }) });
    const km = moneyField('Custo por km rodado', { value: c.custo_km, tipText: 'Usado para somar o custo de ida e volta na comparação de lojas.', onChange: debounceSave((v) => salvar({ custo_km: v })) });
    if (dis) km.input.disabled = true;
    const casa = h('div', { class: 'set-row' }, h('div', { class: 'set-row-k' }, h('span', { class: 'toggle-label' }, 'Local de casa'), h('span', { class: 'set-row-sub' }, c.casa_latitude != null ? 'Definido' : 'Não definido')),
      btn('Usar onde estou', { kind: 'secondary', size: 'sm', icon: 'pin', disabled: dis, onClick: async (e) => { const bb = e.currentTarget; bb.disabled = true; try { const p = await geolocate(); await salvar({ casa_latitude: p.latitude, casa_longitude: p.longitude }); casa.querySelector('.set-row-sub').textContent = 'Definido'; } catch (x) { toast(x.message, { tone: 'danger' }); } finally { bb.disabled = false; } } }));
    cfgEl.replaceChildren(share, h('div', { class: 'field' }, km), casa);
  } catch (e) { cfgEl.replaceChildren(errorState(e.message, ctx.refresh)); }

  function debounceSave(fn) { let t; return (v) => { clearTimeout(t); t = setTimeout(() => fn(v), 700); }; }
  async function salvar(p) { try { await call('config.salvar', p, { rid: uuid() }); toast('Salvo.', { tone: 'success', duration: 1500 }); } catch (e) { toast(e.message, { tone: 'danger' }); } }
  function repEl() {
    const el = h('div', { class: 'set-group' }, skelRows(1));
    load('reputacao.minha').then((r) => el.replaceChildren(h('div', { class: 'set-row' }, h('div', { class: 'rep' }, h('span', { class: 'rep-v num' }, String(r.pontos)), h('div', { class: 'set-row-k' }, h('span', { class: 'toggle-label' }, 'pontos'), h('span', { class: 'set-row-sub' }, `${r.observacoes} preços · ${r.validadas} verificados`))),
      badge({ novo: 'Novo', confiavel: 'Confiável', bloqueado: 'Bloqueado' }[r.nivel] || r.nivel, r.nivel === 'bloqueado' ? 'out' : r.nivel === 'confiavel' ? 'in' : 'neutral', r.nivel === 'confiavel' ? 'verified' : null)))).catch((e) => el.replaceChildren(errorState(e.message)));
    return el;
  }
  function perfil() {
    let nome = u.nome || '';
    const err = formError();
    const f = textField('Seu nome', { value: nome, autofocus: true, autocomplete: 'name', onInput: (v) => { nome = v; } });
    const bt = btn('Salvar', { size: 'lg', full: true });
    bt.onclick = async () => { if (!nome.trim()) { f.setError('Informe seu nome'); return; } bt.disabled = true; try { await call('perfil.salvar', { nome: nome.trim() }, { rid: uuid() }); await s.close(); toast('Perfil salvo.', { tone: 'success' }); await loadBoot(); ctx.refresh(); } catch (e) { err.show(e.message); } finally { bt.disabled = false; } };
    const s = openSheet({ title: 'Perfil', content: [err, f], footer: bt });
  }
  function renomearEspaco() {
    let nome = b.espaco.nome;
    const err = formError();
    const f = textField('Nome do espaço', { value: nome, autofocus: true, onInput: (v) => { nome = v; } });
    const bt = btn('Salvar', { size: 'lg', full: true });
    bt.onclick = async () => { bt.disabled = true; try { await call('ws.renomear', { nome: nome.trim() }, { rid: uuid() }); await s.close(); toast('Espaço renomeado.', { tone: 'success' }); await loadBoot(); ctx.refresh(); } catch (e) { err.show(e.message); } finally { bt.disabled = false; } };
    const s = openSheet({ title: 'Renomear espaço', content: [err, f], footer: bt });
  }
  async function arquivarEspaco() {
    let r;
    try { r = await call('ws.resumo'); } catch (e) { toast(e.message, { tone: 'danger' }); return; }
    if (!r.outros_espacos) { toast('Este é o seu único espaço. Crie outro antes de arquivar ou excluir este.', { tone: 'danger' }); return; }
    const outras = r.membros - 1, quem = outras > 0 ? ` e para as outras ${outras} ${outras === 1 ? 'pessoa' : 'pessoas'}` : '';
    const ok = await confirmSheet({
      title: (r.vazio ? 'Excluir “' : 'Arquivar “') + b.espaco.nome + '”?', confirm: r.vazio ? 'Excluir espaço' : 'Arquivar espaço', tone: 'danger',
      content: h('p', { class: 'muted' }, r.vazio
        ? `Este espaço está vazio (sem lançamentos, contas ou produtos). Ele será excluído e deixará de aparecer para você${quem}.`
        : `Este espaço tem ${r.lancamentos} ${r.lancamentos === 1 ? 'lançamento' : 'lançamentos'} e outros dados. Ele será arquivado: deixa de aparecer para você${quem}, mas os dados continuam guardados e nada é apagado.`),
    });
    if (!ok) return;
    try {
      const x = await call('ws.arquivar', {}, { rid: uuid() });
      toast(x.acao === 'EXCLUIDO' ? 'Espaço excluído.' : 'Espaço arquivado.', { tone: 'success' });
      (await import('../app.js')).changeSpace(x.proximo_espaco_id);
    } catch (e) { toast(e.message, { tone: 'danger' }); }
  }
  async function arquivados() {
    const s = openSheet({ title: 'Espaços arquivados', content: skelRows(2) });
    const draw = async () => {
      try {
        const ls = await call('ws.arquivados');
        if (!ls.length) { s.setContent(empty({ ic: 'spaces', title: 'Nenhum espaço arquivado' })); return; }
        s.setContent(h('div', { class: 'list' }, ls.map((e) => row({ lead: avatar(e.nome), title: e.nome, sub: 'Arquivado', trail: btn('Desarquivar', { kind: 'secondary', size: 'sm', onClick: async (ev) => {
          ev.stopPropagation();
          if (!(await confirmSheet({ title: 'Desarquivar “' + e.nome + '”?', confirm: 'Desarquivar', content: h('p', { class: 'muted' }, 'O espaço volta para a sua lista com todos os dados e as pessoas que tinham acesso.') }))) return;
          try { await call('ws.desarquivar', { espaco_id: e.id }, { rid: uuid() }); await s.close(); toast('Espaço reativado.', { tone: 'success' }); (await import('../app.js')).changeSpace(e.id); }
          catch (er) { toast(er.message, { tone: 'danger' }); }
        } }) }))));
      } catch (e) { s.setContent(errorState(e.message, draw)); }
    };
    draw();
  }
  async function pessoas() {
    const s = openSheet({ title: 'Pessoas e papéis', size: 'tall', content: skelRows(3) });
    const draw = async () => {
      try {
        const ms = await call('membros.listar');
        s.setContent([h('div', { class: 'list' }, ms.map((m) => row({ lead: avatar(m.nome || m.email), title: m.nome || m.email, sub: m.nome ? m.email : null, trail: badge(PAPEL[m.papel], m.papel === 'admin' ? 'in' : 'neutral'),
          onClick: m.email === u.email ? null : () => openMenu({ title: m.nome || m.email, items: [
            ...['leitura', 'editor', 'admin'].filter((p) => p !== m.papel).map((p) => ({ icon: 'users', label: 'Mudar para ' + PAPEL[p], onClick: async () => { try { await call('membros.convidar', { email: m.email, papel: p }, { rid: uuid() }); toast('Papel alterado.', { tone: 'success' }); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } } })),
            { icon: 'x', label: 'Remover do espaço', tone: 'out', onClick: async () => { if (!(await confirmSheet({ title: 'Remover ' + (m.nome || m.email) + '?', confirm: 'Remover', tone: 'danger' }))) return; try { await call('membros.remover', { usuario_id: m.usuario_id }, { rid: uuid() }); toast('Removido.', { tone: 'success' }); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } } },
          ] }) })))]);
        s.setFooter(h('div', { class: 'btn-col' },
          btn('Convites enviados', { kind: 'secondary', icon: 'mail', full: true, onClick: () => abrirConvitesEnviados(draw) }),
          btn('Convidar pessoa', { icon: 'plus', full: true, size: 'lg', onClick: convidar })));
      } catch (e) { s.setContent(errorState(e.message, draw)); }
    };
    const convidar = () => {
      let email = '', papel = 'editor';
      const err = formError(), rid = uuid();
      const f = textField('E-mail', { type: 'email', inputmode: 'email', autofocus: true, placeholder: 'pessoa@exemplo.com', onInput: (v) => { email = v.trim().toLowerCase(); f.setError(''); } });
      const bt = btn('Convidar', { size: 'lg', full: true });
      bt.onclick = async () => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { f.setError('Confira o e-mail'); return; }
        bt.disabled = true;
        try {
          const r = await call('membros.convidar', { email, papel }, { rid });
          await c.close();
          if (r.status === 'MEMBRO') { toast('Papel alterado.', { tone: 'success' }); }
          else {
            let msg = 'Convite enviado a ' + r.email + '. Vale até ' + dmy(r.expira_em) + '.';
            if (r.email_enviado === false) msg += ' O e-mail não pôde ser enviado agora; a pessoa verá o convite ao entrar no app.';
            else if (r.conta_existe === false) msg += ' ' + r.email + ' ainda não tem conta; o e-mail traz o link para criar.';
            toast(msg, { tone: 'success', ico: 'mail', duration: 6000 });
          }
          refreshNotif();
          draw();
        } catch (e) { err.show(e.message); } finally { bt.disabled = false; }
      };
      const c = openSheet({ title: 'Convidar pessoa', footer: bt, content: [err, f, h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('span', { class: 'field-label' }, 'Papel'), tip('Leitura só vê. Editor lança e edita. Admin também gerencia pessoas e configurações.')),
        segmented([{ value: 'leitura', label: 'Leitura' }, { value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }], { value: papel, aria: 'Papel', onChange: (v) => { papel = v; } }))] });
    };
    draw();
  }
  function categorias() {
    const s = openSheet({ title: 'Categorias', size: 'full', content: [] });
    let tipo = 'DESPESA';
    const draw = () => {
      const cs = [...store.cats.values()].filter((c) => c.tipo === tipo);
      const pais = cs.filter((c) => !c.pai_id).sort((a, b) => a.nome.localeCompare(b.nome));
      s.setContent([segmented([{ value: 'DESPESA', label: 'Despesas' }, { value: 'RECEITA', label: 'Receitas' }], { value: tipo, aria: 'Tipo', onChange: (v) => { tipo = v; draw(); } }),
        h('div', { class: 'list' }, pais.flatMap((p) => [p, ...cs.filter((c) => c.pai_id === p.id).sort((a, b) => a.nome.localeCompare(b.nome))]).map((c) => row({
          cls: (c.pai_id ? 'is-indent' : '') + (c.status === 'INATIVA' ? ' is-dead' : ''), lead: c.pai_id ? h('span', { class: 'parc-n' }) : h('span', { class: 'tipo-ico' }, icon('tag')), title: c.nome, sub: c.pai_id ? catNome(c.pai_id).split(' › ')[0] : null,
          badges: c.status === 'INATIVA' ? [badge('Inativa', 'muted')] : null,
          onClick: can('editor') ? () => openMenu({ title: c.nome, items: [
            { icon: 'edit', label: 'Renomear', onClick: () => catForm({ id: c.id, nome: c.nome }) },
            !c.pai_id && { icon: 'plus', label: 'Nova subcategoria', onClick: () => catForm({ tipo, pai_id: c.id }) },
            { icon: c.status === 'INATIVA' ? 'refresh' : 'ban', label: c.status === 'INATIVA' ? 'Reativar' : 'Inativar', tone: c.status === 'INATIVA' ? null : 'out', onClick: () => saveCat({ id: c.id, status: c.status === 'INATIVA' ? 'ATIVA' : 'INATIVA' }) },
          ] }) : null })))]);
      s.setFooter(can('editor') ? btn('Nova categoria', { icon: 'plus', full: true, onClick: () => catForm({ tipo }) }) : null);
    };
    const saveCat = async (p) => { try { await call('categorias.salvar', p, { rid: uuid() }); await loadBoot(); toast('Categoria salva.', { tone: 'success' }); draw(); } catch (e) { toast(e.message, { tone: 'danger' }); } };
    const catForm = (p) => {
      let nome = p.nome || '';
      const f = textField('Nome', { value: nome, autofocus: true, onInput: (v) => { nome = v; } });
      const bt = btn('Salvar', { full: true, size: 'lg', onClick: async () => { if (!nome.trim()) { f.setError('Dê um nome'); return; } await c.close(); saveCat({ ...p, nome: nome.trim() }); } });
      const c = openSheet({ title: p.id ? 'Renomear' : p.pai_id ? 'Nova subcategoria de ' + catNome(p.pai_id) : 'Nova categoria', content: f, footer: bt });
    };
    draw();
  }
  async function exportar() {
    const t = toast('Preparando arquivo…', { ico: 'download', duration: 10000 });
    try {
      const d = await call('exportar.espaco');
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `nexora-${b.espaco.nome.toLowerCase().replace(/\W+/g, '-')}-${b.hoje}.json` });
      document.body.append(a); a.click(); a.remove();
      t(); toast('Arquivo baixado.', { tone: 'success' });
    } catch (e) { t(); toast(e.message, { tone: 'danger' }); }
  }
  async function integridade() {
    const s = openSheet({ title: 'Integridade', content: skelRows(2) });
    try { const v = await call('integridade.verificar'); s.setContent(v.length ? h('div', { class: 'list' }, v.map((x) => row({ lead: h('span', { class: 'tipo-ico tone-out' }, icon('alert')), title: x.regra || 'Violação', sub: x.descricao || JSON.stringify(x) }))) : empty({ ic: 'check', title: 'Tudo certo com as regras financeiras' })); }
    catch (e) { s.setContent(errorState(e.message)); }
  }
  async function sair() {
    if (!(await confirmSheet({ title: 'Sair do Nexora?', confirm: 'Sair', tone: 'danger' }))) return;
    clearSession(); location.hash = ''; location.reload();
  }
}

// Painel do modo demonstração: percorrer estados (vazio, carregando, erro, conflito, sessão expirada, leitura, offline)
export async function openDemoPanel() {
  const demo = await import('../demo.js');
  const f = demo.getFlags();
  const set = (k) => (v) => { demo.setFlag(k, v); };
  const s = openSheet({ title: 'Modo demonstração', size: 'tall', content: [
    h('div', { class: 'set-group' },
      toggle('Latência realista (1–6 s)', { checked: f.lento, onChange: set('lento') }),
      toggle('Simular sem conexão', { checked: f.offline, onChange: (v) => { set('offline')(v); emit('dados'); } }),
      toggle('Falhar a próxima chamada', { checked: f.falhar, onChange: set('falhar') }),
      toggle('Conflito na próxima edição', { checked: f.conflito, onChange: set('conflito') })),
    h('div', { class: 'btn-col' },
      btn('Expirar sessão agora', { kind: 'secondary', icon: 'lock', onClick: async () => { demo.setFlag('expirar', true); await s.close(); emit('dados'); } }),
      btn('Trocar para espaço só leitura', { kind: 'secondary', icon: 'users', onClick: async () => { await s.close(); (await import('../app.js')).changeSpace('ws_praia'); } }),
      btn('Primeiro acesso (espaço vazio)', { kind: 'secondary', icon: 'plus', onClick: async () => { await s.close(); const w = await call('ws.criar', { nome: 'Espaço novo' }, { rid: uuid() }); (await import('../app.js')).changeSpace(w.id); } }),
      btn('Conta nova com convite pendente', { kind: 'secondary', icon: 'mail', onClick: () => { demo.setFlag('contaNova', true); ls.del('nx.ws'); location.reload(); } }),
      btn('Banco ainda não criado', { kind: 'secondary', icon: 'refresh', onClick: () => { demo.setFlag('semBanco', true); location.reload(); } }),
      btn('Recomeçar demonstração', { kind: 'danger', icon: 'refresh', onClick: () => { demo.resetDemo(); ls.del('nx.ws'); location.reload(); } })),
  ] });
}
