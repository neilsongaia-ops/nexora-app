// Administração da plataforma (só papel_plataforma = admin)
import { h, money, dmy, uuid, num } from '../util.js';
import { icon } from '../icons.js';
import { call } from '../api.js';
import { store } from '../store.js';
import { openSheet, pick, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { segmented, card, row, badge, empty, errorState, skelRows, skelCards, sectionHead, btn, textField, toggle, formError, kv } from '../ui/components.js';

export default async function admin(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Administração');
  if (!store.admin) { view.append(empty({ ic: 'lock', title: 'Acesso restrito.' })); return; }
  let aba = ctx.query.get('aba') || 'painel';
  const tabs = segmented([{ value: 'painel', label: 'Painel' }, { value: 'precos', label: 'Preços' }, { value: 'catalogo', label: 'Catálogo' }, { value: 'denuncias', label: 'Denúncias' }, { value: 'usuarios', label: 'Usuários' }], { value: aba, aria: 'Seção', cls: 'seg--sm', onChange: (v) => { aba = v; draw(); } });
  const body = h('div', { class: 'sec' });
  view.append(h('div', { class: 'sticky-tools' }, tabs), body);
  const draw = () => ({ painel, precos, catalogo, denuncias, usuarios })[aba](body);
  draw();
}
const stat = (k, v, tone) => h('div', { class: 'tile' }, h('span', { class: 'tile-k' }, k), h('span', { class: 'tile-v num' + (tone ? ' tone-' + tone : '') }, v));
const act = async (action, p, msg, after) => { try { await call(action, p, { rid: uuid() }); toast(msg, { tone: 'success' }); after && after(); } catch (e) { toast(e.message, { tone: 'danger' }); } };

async function painel(body) {
  body.replaceChildren(skelCards(4));
  try {
    const p = await call('admin.painel');
    const tg = toggle('Cadastro aberto', { checked: p.cadastro_aberto, sub: 'Sem cadastro aberto, só entra quem for convidado.', onChange: (v) => act('admin.cadastro', { aberto: v }, v ? 'Cadastro aberto.' : 'Cadastro fechado.') });
    body.replaceChildren(h('div', { class: 'stat-grid' }, stat('Usuários', num(p.usuarios)), stat('Ativos', num(p.usuarios_ativos)), stat('Espaços', num(p.espacos)), stat('Produtos no catálogo', num(p.produtos_globais)), stat('Lojas', num(p.lojas_globais)),
      stat('Preços observados', num(p.precos_observados)), stat('Preços verificados', num(p.precos_validados), 'in'), stat('Suspeitos', num(p.precos_suspeitos || 0), p.precos_suspeitos ? 'warn' : ''), stat('Denúncias abertas', num(p.denuncias_abertas), p.denuncias_abertas ? 'out' : '')),
      h('div', { class: 'set-group' }, tg));
  } catch (e) { body.replaceChildren(errorState(e.message, () => painel(body))); }
}
async function precos(body) {
  body.replaceChildren(skelRows(4));
  try {
    const c = await call('admin.catalogo');
    body.replaceChildren(sectionHead('Preços suspeitos'), c.suspeitos.length ? h('div', { class: 'list' }, c.suspeitos.map((s) => {
      const el = row({ title: s.produto, sub: `${s.loja} · ${s.cidade || ''} · ${dmy(s.data)}${s.mediana ? ' · mediana ' + money(s.mediana) : ''}`, trail: h('span', { class: 'num tone-out' }, money(s.preco)) });
      el.querySelector('.row-main').append(h('div', { class: 'vote' }, btn('Validar', { kind: 'secondary', size: 'sm', icon: 'check', onClick: () => act('admin.preco.decidir', { id: s.id, decisao: 'validar' }, 'Preço validado.', () => precos(body)) }), btn('Rejeitar', { kind: 'secondary', size: 'sm', icon: 'x', onClick: () => act('admin.preco.decidir', { id: s.id, decisao: 'rejeitar' }, 'Preço rejeitado.', () => precos(body)) })));
      return el;
    })) : empty({ ic: 'check', title: 'Nenhum preço suspeito' }));
  } catch (e) { body.replaceChildren(errorState(e.message, () => precos(body))); }
}
async function catalogo(body) {
  body.replaceChildren(skelRows(4));
  try {
    const c = await call('admin.catalogo');
    body.replaceChildren(
      h('div', { class: 'stat-grid' }, stat('Produtos', num(c.totais.produtos)), stat('Lojas', num(c.totais.lojas)), stat('Preços', num(c.totais.precos)), stat('Suspeitos', num(c.totais.suspeitos), 'warn')),
      sectionHead('Produtos repetidos'), c.repetidos.length ? h('div', { class: 'sec' }, c.repetidos.map((g) => card('sec-card', h('strong', {}, g.chave), h('div', { class: 'list' }, g.itens.map((i) => row({ title: i.nome, sub: [i.marca, i.gtin].filter(Boolean).join(' · '), onClick: () => renomear('produto', i.id, i.nome, () => catalogo(body)) }))),
        btn('Unir em um só', { kind: 'secondary', icon: 'split', onClick: async () => { const para = await pick({ title: 'Manter qual?', items: g.itens.map((i) => ({ value: i.id, label: i.nome, sub: i.gtin })) }); if (!para) return; for (const i of g.itens.filter((x) => x.id !== para)) await act('admin.produto.mesclar', { de: i.id, para }, 'Produtos unidos.'); catalogo(body); } })))) : empty({ ic: 'check', title: 'Nenhum repetido' }),
      sectionHead('Fotos do catálogo'), c.imagens && c.imagens.length ? h('div', { class: 'set-group' }, c.imagens.map((i) => toggle(i.produto, { checked: i.ativa, sub: i.gtin, onChange: (v) => act('admin.imagem', { gtin: i.gtin, ativa: v }, v ? 'Foto reativada.' : 'Foto escondida.') }))) : empty({ ic: 'image', title: 'Sem fotos para revisar' }));
  } catch (e) { body.replaceChildren(errorState(e.message, () => catalogo(body))); }
}
function renomear(alvo_tipo, alvo_id, atual, after) {
  let nome = atual;
  const f = textField('Novo nome', { value: atual, autofocus: true, onInput: (v) => { nome = v; } });
  const b = btn('Renomear', { full: true, size: 'lg', onClick: async () => { await s.close(); act('admin.renomear', { alvo_tipo, alvo_id, nome }, 'Renomeado.', after); } });
  const s = openSheet({ title: 'Renomear', content: f, footer: b });
}
async function denuncias(body) {
  body.replaceChildren(skelRows(4));
  try {
    const ds = await call('admin.denuncias');
    if (!ds.length) { body.replaceChildren(empty({ ic: 'check', title: 'Nenhuma denúncia aberta' })); return; }
    body.replaceChildren(h('div', { class: 'sec' }, ds.map((d) => {
      let bloquear = false;
      return card('sec-card', h('div', { class: 'plan-top' }, h('strong', { class: 'truncate' }, d.resumo || `${d.alvo_tipo} ${d.alvo_id}`), badge(d.status_atual === 'em_revisao' ? 'Escondido' : 'Visível', d.status_atual === 'em_revisao' ? 'warn' : 'neutral')),
        h('span', { class: 'muted' }, `${d.pessoas} ${d.pessoas > 1 ? 'pessoas' : 'pessoa'} · ${{ preco: 'preço', produto: 'produto', imagem: 'foto', loja: 'loja' }[d.alvo_tipo]}`),
        d.motivos && d.motivos.length ? h('div', { class: 'chip-row' }, d.motivos.map((m) => badge(m, 'neutral'))) : null,
        toggle('Bloquear quem publicou', { onChange: (v) => { bloquear = v; } }),
        h('div', { class: 'btn-row' }, btn('Improcedente', { kind: 'secondary', onClick: () => act('admin.denuncia.decidir', { alvo_tipo: d.alvo_tipo, alvo_id: d.alvo_id, decisao: 'improcedente' }, 'Conteúdo mantido.', () => denuncias(body)) }),
          btn('Procedente', { kind: 'danger', onClick: () => act('admin.denuncia.decidir', { alvo_tipo: d.alvo_tipo, alvo_id: d.alvo_id, decisao: 'procedente', bloquear_autor: bloquear }, 'Conteúdo removido.', () => denuncias(body)) })));
    })));
  } catch (e) { body.replaceChildren(errorState(e.message, () => denuncias(body))); }
}
function usuarios(body) {
  let email = '';
  const err = formError();
  const f = textField('E-mail da pessoa', { type: 'email', inputmode: 'email', placeholder: 'pessoa@exemplo.com', onInput: (v) => { email = v.trim().toLowerCase(); err.show(''); } });
  const need = () => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.show('Informe um e-mail válido.'); return false; } return true; };
  const go = (action, p, msg) => need() && act(action, { email, ...p }, msg);
  body.replaceChildren(card('sec-card', err, f,
    sectionHead('Acesso'), h('div', { class: 'btn-row' }, btn('Desativar', { kind: 'secondary', icon: 'ban', onClick: async () => need() && (await confirmSheet({ title: 'Desativar ' + email + '?', confirm: 'Desativar', tone: 'danger' })) && go('admin.usuario.ativo', { ativo: false }, 'Usuário desativado.') }), btn('Reativar', { kind: 'secondary', icon: 'check', onClick: () => go('admin.usuario.ativo', { ativo: true }, 'Usuário reativado.') })),
    sectionHead('Papel na plataforma'), h('div', { class: 'btn-row' }, btn('Usuário', { kind: 'secondary', onClick: () => go('admin.papel', { papel: 'usuario' }, 'Papel alterado.') }), btn('Admin', { kind: 'secondary', icon: 'shield', onClick: () => go('admin.papel', { papel: 'admin' }, 'Agora é admin.') })),
    sectionHead('Reputação'), h('div', { class: 'btn-row' }, ['novo', 'confiavel', 'bloqueado'].map((n) => btn({ novo: 'Novo', confiavel: 'Confiável', bloqueado: 'Bloqueado' }[n], { kind: n === 'bloqueado' ? 'danger' : 'secondary', onClick: () => go('admin.reputacao', { nivel: n }, 'Reputação alterada.') })))));
}
