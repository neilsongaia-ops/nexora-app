// Nota fiscal (NFC-e): QR/chave + texto colado ou PDF (lido no navegador) → conferir itens e produtos → importar
import { h, money, dmy, uuid, emit, num, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { DEMO, call } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { pick } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { scanCode, pdfText, pickFile } from '../ui/media.js';
import { card, row, badge, empty, errorState, btn, textField, pickField, stepper, formError, sectionHead, chip, kv, tip } from '../ui/components.js';
import { recursoItems } from './lancForm.js';

export default async function nota(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Nota fiscal');
  if (!can('editor')) { view.append(empty({ ic: 'lock', title: 'Seu papel neste espaço é só de leitura.' })); return; }
  let entrada = '', texto = '', pdfNome = '', res = null, map = [], rec = (recursosAtivos(['CARTAO'])[0] || recursosAtivos()[0] || {}).id, parc = 1;
  const root = h('div', { class: 'sec' });
  view.append(root);
  const steps = (n) => h('div', { class: 'steps', 'aria-label': `Etapa ${n} de 2` }, h('span', { class: 'step is-on' }), h('span', { class: 'step' + (n > 1 ? ' is-on' : '') }));

  function passo1() {
    const err = formError();
    const ent = textField('Link do QR ou chave de acesso', { value: entrada, placeholder: 'Cole aqui', inputmode: 'text', onInput: (v) => { entrada = v.trim(); drawSrc(); } });
    const txt = textField('Texto da nota', { value: texto, multiline: true, rows: 6, placeholder: 'Abra a nota no site da Sefaz, selecione tudo, copie e cole aqui', onInput: (v) => { texto = v; drawSrc(); } });
    const src = h('div', { class: 'src-grid' });
    const drawSrc = () => src.replaceChildren(
      h('button', { class: 'src-btn' + (entrada ? ' is-done' : ''), type: 'button', onclick: async () => { const c = await scanCode({ title: 'Ler QR da nota', formats: ['qr_code'], manualLabel: 'Link ou chave', inputmode: 'text' }); if (c) { entrada = c; ent.input.value = c; drawSrc(); } } }, icon(entrada ? 'check' : 'camera'), 'Ler QR da nota'),
      h('button', { class: 'src-btn' + (pdfNome ? ' is-done' : ''), type: 'button', onclick: async (e) => {
        const f = await pickFile('application/pdf'); if (!f) return;
        const b = e.currentTarget; b.disabled = true;
        try { texto = await pdfText(f); pdfNome = f.name; txt.input.value = texto; toast('Texto lido do PDF.', { tone: 'success' }); } catch (x) { err.show(x.message); } finally { b.disabled = false; drawSrc(); }
      } }, icon(pdfNome ? 'check' : 'file'), pdfNome ? h('span', { class: 'truncate' }, pdfNome) : 'Enviar PDF'),
      h('button', { class: 'src-btn' + (texto && !pdfNome ? ' is-done' : ''), type: 'button', onclick: async () => { try { const t = await navigator.clipboard.readText(); if (t) { if (/\d{44}/.test(t) && t.length < 200) { entrada = t.trim(); ent.input.value = entrada; } else { texto = t; txt.input.value = t; } drawSrc(); } } catch { txt.input.focus(); } } }, icon(texto && !pdfNome ? 'check' : 'copy'), 'Colar da área de transferência'));
    drawSrc();
    const b = btn('Ler nota', { size: 'lg', full: true, icon: 'receipt' });
    b.onclick = async () => {
      if (!entrada && !texto.trim()) { err.show('Leia o QR, cole o texto ou envie o PDF.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try { res = await call('nfce.interpretar', { entrada: entrada || 'manual', texto: texto || undefined }); map = res.itens.map((i) => (i.produto_sugerido_id ? { produto_id: i.produto_sugerido_id } : { criar: true })); passo2(); }
      catch (x) { err.show(x.message); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
    root.replaceChildren(steps(1), err, src, ent, txt,
      DEMO ? chip('Usar nota de exemplo', { ic: 'receipt', onClick: async () => { const a = (await import('../demo.js')).amostraNota(); entrada = a.entrada; texto = a.texto; ent.input.value = entrada; txt.input.value = texto; drawSrc(); } }) : null, b);
  }

  async function passo2() {
    const err = formError();
    const prods = (await call('produtos.listar', { todos: true, limite: 200 }).catch(() => ({ itens: [] }))).itens;
    prods.forEach((p) => store.produtos.set(p.id, p));
    const pname = (id) => (prods.find((p) => p.id === id) || {}).nome;
    const info = res.chave_info;
    const warns = [];
    if (res.duplicada) warns.push(h('div', { class: 'warn-item is-danger', role: 'alert' }, icon('alert'), h('span', {}, 'Não é possível importar: esta nota já foi importada' + (res.importada_em ? ' em ' + dmy(res.importada_em) : '') + '.')));
    res.avisos.filter((a) => !(res.duplicada && /já foi importada/.test(a))).forEach((a) => warns.push(h('div', { class: 'warn-item' }, icon('alert'), h('span', {}, a))));
    const soma = res.itens.reduce((s, i) => s + i.total, 0), desc = Math.max(0, soma - res.total);
    const itens = h('div', { class: 'list' }, res.itens.map((it, k) => {
      const m = map[k];
      return row({
        title: it.descricao, sub: `${num(it.quantidade, 3)} ${it.unidade.toLowerCase()} × ${money(it.preco_unitario)}`,
        badges: [m.produto_id ? h('span', { class: 'match is-ok' }, icon('check'), pname(m.produto_id) || 'Produto', it.motivo_sugestao === 'codigo' && m.produto_id === it.produto_sugerido_id ? ' · pelo código' : '') : h('span', { class: 'match is-new' }, icon('plus'), 'Novo produto')],
        trail: h('span', { class: 'num' }, money(it.total)),
        onClick: async () => {
          const v = await pick({ title: it.descricao, value: m.produto_id || '__novo', items: [{ value: '__novo', label: 'Criar novo produto', sub: it.descricao, icon: 'plus' }, ...prods.map((p) => ({ value: p.id, label: p.nome, sub: [p.marca, embalagem(p)].filter(Boolean).join(' · '), icon: 'tag' }))] });
          if (v === undefined) return;
          map[k] = v === '__novo' ? { criar: true } : { produto_id: v };
          passo2();
        },
      });
    }));
    const isCard = () => (store.recs.get(rec) || {}).tipo === 'CARTAO';
    const parcWrap = h('div', { class: 'field', hidden: !isCard() }, h('span', { class: 'field-label' }, 'Parcelas'), stepper({ value: parc, min: 1, max: 12, format: (v) => v + '×', label: 'Parcelas', onChange: (v) => { parc = v; } }));
    const b = btn('Importar ' + money(res.total), { size: 'lg', full: true, icon: 'download', disabled: res.duplicada || !res.itens.length });
    b.onclick = async () => {
      if (!rec) { err.show('Escolha como pagou.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        const p = { chave: res.chave || undefined, data: res.data, total: res.total, recurso_id: rec, parcelas: isCard() && parc > 1 ? parc : undefined,
          itens: res.itens.map((i, k) => ({ descricao: i.descricao, codigo: i.codigo, quantidade: i.quantidade, unidade: i.unidade, preco_unitario: i.preco_unitario, total: i.total, ...(map[k].produto_id ? { produto_id: map[k].produto_id } : { criar: { nome: titulo(i.descricao) } }) })) };
        if (res.loja_id) p.loja_id = res.loja_id; else p.loja = { nome: titulo(res.emitente || 'Loja'), cnpj: res.cnpj || undefined, cidade: res.endereco && res.endereco.cidade, uf: res.endereco && res.endereco.uf };
        const r = await call('nfce.importar', p, { rid: uuid() });
        await successBurst(root, 'Nota importada');
        toast('Nota importada: lançamento, produtos e preços.', { tone: 'success', action: { label: 'Ver lançamento', onClick: async () => (await import('./lancAcoes.js')).openLancDetail(r.lancamento.id) } });
        entrada = texto = pdfNome = ''; res = null; emit('dados');
      } catch (x) { err.show(x.message); b.disabled = false; } finally { b.removeAttribute('aria-busy'); }
    };
    root.replaceChildren(steps(2), err, ...warns,
      card('note-head', h('span', { class: 'note-em' }, res.emitente ? titulo(res.emitente) : 'Nota sem emitente'),
        h('div', { class: 'note-meta' }, res.data ? h('span', {}, dmy(res.data)) : null, res.endereco ? h('span', {}, `${res.endereco.cidade}/${res.endereco.uf}`) : null,
          info ? (info.dv_ok ? badge('Chave válida', 'in', 'verified') : badge('Chave com erro', 'out', 'alert')) : badge('Sem chave', 'neutral'), tip('Nota com chave válida registra os preços como verificados.')),
        h('div', { class: 'kv-list' }, kv('Itens', String(res.itens.length)), desc > 0.009 ? kv('Descontos', money(-desc)) : null, kv('Total', money(res.total), 'is-total'))),
      sectionHead('Itens'), itens,
      pickField('Pagou com', { value: rec, items: () => recursoItems(), onChange: (v) => { rec = v; parcWrap.hidden = !isCard(); } }), parcWrap,
      h('div', { class: 'btn-col' }, b, btn('Voltar', { kind: 'ghost', icon: 'chevL', onClick: passo1 })));
  }
  passo1();
}
const titulo = (s) => String(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E|Em|Com)\b/g, (w) => w.toLowerCase());
