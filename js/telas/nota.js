// Nota fiscal (NFC-e): ler o QR (no app Android a nota é lida sozinha; colar o texto ou enviar o PDF só se a leitura falhar) → conferir itens e produtos → importar
import { h, money, dmy, uuid, emit, num, embalagem } from '../util.js';
import { icon } from '../icons.js';
import { DEMO, call } from '../api.js';
import { store, can, recursosAtivos } from '../store.js';
import { pick, openSheet } from '../ui/sheet.js';
import { toast, successBurst } from '../ui/toast.js';
import { scanCode, pdfText, pickFile } from '../ui/media.js';
import { card, row, badge, empty, errorState, btn, textField, pickField, stepper, formError, sectionHead, chip, kv, tip, moneyField } from '../ui/components.js';
import { recursoItems, categoriaItems } from './lancForm.js';

// No app Android (Capacitor) o celular consulta o portal da SEFAZ por um WebView do próprio aparelho: o servidor do Apps Script é bloqueado, o celular não.
// Com a interface carregada de um site remoto o Capacitor injeta um objeto enxuto (sem registerPlugin): tenta os 3 caminhos possíveis.
/** Depois de importar: o que ficou de fora (ex.: preço de item vendido em KG num produto medido em UN). Não é erro: o lançamento foi salvo. */
function avisosImportacao(avisos, verLanc) {
  const cap = (t) => { const x = String(t || '').trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
  const um = avisos.length === 1;
  const s = openSheet({ title: 'Nota importada', content: [
    h('div', { class: 'warn-item is-ok' }, icon('check'), h('span', {}, 'O lançamento e os produtos foram salvos.')),
    h('p', { class: 'sheet-lead' }, um ? 'Só o preço deste item não entrou no histórico de preços:' : 'Só o preço destes ' + avisos.length + ' itens não entrou no histórico de preços:'),
    h('ul', { class: 'warn-list' }, avisos.map((a) => h('li', { class: 'warn-item' }, icon('tag'), h('span', {}, cap(a))))),
    h('p', { class: 'sheet-note' }, 'Isso acontece quando a nota vende numa unidade (por exemplo, quilo) e o produto está cadastrado em outra (por exemplo, unidade). Se for o caso, ajuste a unidade no produto: as próximas notas registram o preço.')],
    footer: h('div', { class: 'btn-row' }, btn('Ver lançamento', { kind: 'secondary', onClick: async () => { await s.close(); verLanc(); } }), btn('Entendi', { onClick: () => s.close() })) });
}

const leitorNativo = () => {
  const C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform() && C.isPluginAvailable && C.isPluginAvailable('NfceReader'))) return null;
  if (typeof C.registerPlugin === 'function') return C.registerPlugin('NfceReader');
  if (C.Plugins && C.Plugins.NfceReader) return C.Plugins.NfceReader;
  if (typeof C.nativePromise === 'function') return { ler: (o) => C.nativePromise('NfceReader', 'ler', o) };
  return null;
};
const urlApiSefa = (c) => {
  const m = String(c || '').match(/[?&]p=([^&#\s]+)/i);
  if (!m) return '';
  let p = m[1];
  try { p = decodeURIComponent(p); } catch { p = m[1]; }
  return p.split('|')[1] === '2' ? 'https://app.sefa.pa.gov.br/consulta-nfce-api/api/extranet/qrcode?p=' + encodeURIComponent(p) : '';
};

export default async function nota(ctx) {
  const { view, setTitle } = ctx;
  setTitle('Nota fiscal');
  if (!can('editor')) { view.append(empty({ ic: 'lock', title: 'Seu papel neste espaço é só de leitura.' })); return; }
  let entrada = '', texto = '', pdfNome = '', res = null, map = [], rec = (recursosAtivos(['CARTAO'])[0] || recursosAtivos()[0] || {}).id, parc = 1, cat = null;
  const completar = ctx.query && ctx.query.get('completar');      // veio de "Completar com a nota" (lançamento feito só pelo valor)
  const verLancId = async (id) => (await import('./lancAcoes.js')).openLancDetail(id);
  const aviso1 = (cls, ic, txt, ...extra) => h('div', { class: 'warn-item' + (cls ? ' ' + cls : ''), role: cls === 'is-danger' ? 'alert' : 'status' }, icon(ic), extra.length ? h('div', { class: 'warn-body' }, h('span', {}, txt), ...extra) : h('span', {}, txt));
  // Lançamentos manuais de mesmo valor perto da data: mesmo aviso nos dois caminhos (nota completa ou só pelo valor)
  const avisoDuplicadas = () => (res.possiveis_duplicadas || []).length ? aviso1('', 'alert', 'Talvez esta compra já esteja lançada:', h('ul', { class: 'warn-list' }, res.possiveis_duplicadas.map((x) => h('li', {}, [x.descricao, x.data_evento ? dmy(x.data_evento) : null, money(x.valor_total != null ? x.valor_total : x.valor)].filter(Boolean).join(', '))))) : null;
  const root = h('div', { class: 'sec' });
  view.append(root);
  const steps = (n) => h('div', { class: 'steps', 'aria-label': `Etapa ${n} de 2` }, h('span', { class: 'step is-on' }), h('span', { class: 'step' + (n > 1 ? ' is-on' : '') }));

  // Passo 1: no app Android basta ler o QR (a nota é lida no portal e os itens já aparecem). Colar o texto e enviar o PDF
  // só aparecem se a leitura automática falhar, ou fora do app (onde não há leitura automática).
  function passo1() {
    const err = formError();
    const nat = leitorNativo();
    const aviso = h('div', { class: 'warn-item', role: 'status', hidden: true }, icon('alert'), h('span', {}));
    const dizer = (m) => { aviso.hidden = !m; aviso.lastElementChild.textContent = m || ''; };
    const txt = textField('Texto da nota', { value: texto, multiline: true, rows: 6, placeholder: 'Abra a nota no site da Sefaz, selecione tudo, copie e cole aqui', onInput: (v) => { texto = v; } });

    // Lê o texto (da leitura automática, colado ou do PDF) no servidor. auto: veio da leitura do QR; sem itens = a leitura falhou.
    async function interpretar(auto) {
      err.show('');
      try {
        res = await call('nfce.interpretar', { entrada: entrada || 'manual', texto: texto || undefined });
        if (res.parcial && !(res.itens || []).length) { passoParcial(); return true; }
        if (auto && !(res.itens || []).length) return false;
        map = res.itens.map((i) => (i.produto_sugerido_id ? { produto_id: i.produto_sugerido_id } : { criar: true, catalogo: i.catalogo || null }));
        passo2();
        return true;
      } catch (x) { err.show(x.message); return false; }
    }
    const revelar = (m) => { manualBox.hidden = false; dizer(m); };

    async function lerQr() {
      const c = await scanCode({ title: 'Ler QR da nota', formats: ['qr_code'], manualLabel: 'Link ou chave', inputmode: 'text' });
      if (!c) return;
      entrada = c; err.show(''); dizer('');
      const url = nat ? urlApiSefa(c) : '';
      if (!url) { texto = ''; if (!(await interpretar(true))) revelar('Cole o texto da nota ou envie o PDF.'); return; }
      ler.disabled = true; ler.setAttribute('aria-busy', 'true');
      const fim = toast('Lendo a nota no portal da SEFAZ…', { ico: 'receipt', duration: 45000 });
      try {
        const r = await nat.ler({ url });
        texto = r.texto; txt.input.value = texto; fim();
        if (!(await interpretar(true))) revelar('Não consegui reconhecer os itens da nota. Cole o texto ou envie o PDF.');
      } catch (x) {
        fim();
        texto = ''; if (await interpretar(true)) return;          // nota em contingência: o QR já basta para lançar só pelo valor
        revelar(x && x.code === 'CAPTCHA' ? 'O portal pediu verificação. Abra a nota no navegador e cole o texto aqui, ou envie o PDF.' : 'Não consegui ler a nota automaticamente. Cole o texto ou envie o PDF.');
      } finally { ler.disabled = false; ler.removeAttribute('aria-busy'); }
    }

    const ler = btn('Ler QR da nota', { size: 'lg', full: true, icon: 'camera', onClick: lerQr });
    const colar = h('button', { class: 'src-btn', type: 'button', onclick: async () => {
      try { const t = await navigator.clipboard.readText(); if (t) { if (/\d{44}/.test(t) && t.length < 200) entrada = t.trim(); else { texto = t; txt.input.value = t; } } } catch { txt.input.focus(); }
    } }, icon('copy'), 'Colar da área de transferência');
    const pdf = h('button', { class: 'src-btn', type: 'button', onclick: async (e) => {
      const f = await pickFile('application/pdf'); if (!f) return;
      const b = e.currentTarget; b.disabled = true;
      try { texto = await pdfText(f); txt.input.value = texto; toast('Texto lido do PDF.', { tone: 'success' }); } catch (x) { err.show(x.message); } finally { b.disabled = false; }
    } }, icon('file'), 'Enviar PDF');
    const lerTexto = btn('Ler nota', { size: 'lg', full: true, icon: 'receipt' });
    lerTexto.onclick = async () => {
      if (!entrada && !texto.trim()) { err.show('Leia o QR, cole o texto ou envie o PDF.'); return; }
      lerTexto.disabled = true; lerTexto.setAttribute('aria-busy', 'true');
      try { await interpretar(false); } finally { lerTexto.disabled = false; lerTexto.removeAttribute('aria-busy'); }
    };
    const manualBox = h('div', { class: 'sec', hidden: !!nat }, txt, h('div', { class: 'src-grid' }, colar, pdf), lerTexto);

    root.replaceChildren(steps(1), completar ? aviso1('', 'receipt', 'Para completar a compra com os itens, leia de novo o QR da mesma nota.') : '', err, ler, aviso, manualBox,
      DEMO ? h('div', { class: 'chip-row' }, chip('Usar nota de exemplo', { ic: 'receipt', onClick: async () => { const a = (await import('../demo.js')).amostraNota(); entrada = a.entrada; texto = a.texto; txt.input.value = texto; manualBox.hidden = false; } }),
        chip('Nota em contingência', { ic: 'clock', onClick: async () => { entrada = (await import('../demo.js')).amostraContingencia(new URLSearchParams(location.search).has('centavos')); texto = ''; await interpretar(true); } })) : '');
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
    if (res.provisoria) warns.push(aviso1('', 'swap', 'Ao importar, o lançamento feito só pelo valor (' + money(res.provisoria.total) + ', ' + dmy(res.provisoria.data) + ') será estornado e trocado por este, com os itens.'));
    else if (avisoDuplicadas()) warns.push(avisoDuplicadas());
    const soma = res.itens.reduce((s, i) => s + i.total, 0), desc = Math.max(0, soma - res.total);
    const itens = h('div', { class: 'list' }, res.itens.map((it, k) => {
      const m = map[k];
      return row({
        title: it.descricao, sub: `${num(it.quantidade, 3)} ${it.unidade.toLowerCase()} × ${money(it.preco_unitario)}`,
        badges: [m.produto_id ? h('span', { class: 'match is-ok' }, icon('check'), pname(m.produto_id) || 'Produto', it.motivo_sugestao === 'codigo' && m.produto_id === it.produto_sugerido_id ? ' · pelo código' : '') : h('span', { class: 'match is-new' }, icon('plus'), m.catalogo ? 'Do catálogo: ' + m.catalogo.nome : 'Novo produto')],
        trail: h('span', { class: 'num' }, money(it.total)),
        onClick: async () => {
          const v = await pick({ title: it.descricao, value: m.produto_id || '__novo', items: [{ value: '__novo', label: it.catalogo ? 'Criar “' + it.catalogo.nome + '” (do catálogo)' : 'Criar novo produto', sub: it.catalogo ? 'Com código de barras e dados da base colaborativa' : it.descricao, icon: 'plus' }, ...prods.map((p) => ({ value: p.id, label: p.nome, sub: [p.marca, embalagem(p)].filter(Boolean).join(' · '), icon: 'tag' }))] });
          if (v === undefined) return;
          map[k] = v === '__novo' ? { criar: true, catalogo: it.catalogo || null } : { produto_id: v };
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
          itens: res.itens.map((i, k) => ({ descricao: i.descricao, codigo: i.codigo, quantidade: i.quantidade, unidade: i.unidade, preco_unitario: i.preco_unitario, total: i.total, ...(map[k].produto_id ? { produto_id: map[k].produto_id } : { criar: map[k].catalogo ? { nome: map[k].catalogo.nome, marca: map[k].catalogo.marca || undefined, gtin: map[k].catalogo.gtin, unidade: map[k].catalogo.unidade, tam_embalagem: map[k].catalogo.tam_embalagem } : { nome: titulo(i.descricao) } }) })) };
        if (res.loja_id) p.loja_id = res.loja_id; else p.loja = { nome: titulo(res.emitente || 'Loja'), cnpj: res.cnpj || undefined, cidade: res.endereco && res.endereco.cidade, uf: res.endereco && res.endereco.uf };
        const r = await call('nfce.importar', p, { rid: uuid() });
        await successBurst(root, 'Nota importada');
        const verLanc = async () => (await import('./lancAcoes.js')).openLancDetail(r.lancamento.id);
        if (r.avisos && r.avisos.length) avisosImportacao(r.avisos, verLanc);
        else toast('Nota importada: lançamento, produtos e preços.', { tone: 'success', action: { label: 'Ver lançamento', onClick: verLanc } });
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
  // Nota em contingência: a SEFAZ ainda não tem os itens; o QR dá loja, dia e valor. Lança só pelo valor e completa depois.
  function passoParcial() {
    const err = formError();
    const q = res.qr || {}, data = q.data || res.data;
    let total = q.total != null ? q.total : res.total;
    const sug = !res.loja_id ? res.emitente_sugerido : null;
    const loja = (store.lojas && res.loja_id && (store.lojas.get ? store.lojas.get(res.loja_id) : null)) || null;
    const nome = titulo(res.emitente || (sug && sug.nome) || (loja && loja.nome) || 'Loja');
    const cid = (sug && sug.cidade) || (res.endereco && res.endereco.cidade);
    const uf = (sug && sug.uf) || (res.endereco && res.endereco.uf);
    const resumo = card('note-head', h('span', { class: 'note-em' }, nome),
      h('div', { class: 'note-meta' }, data ? h('span', {}, dmy(data)) : null, cid ? h('span', {}, cid + (uf ? '/' + uf : '')) : null,
        sug ? badge('Dados oficiais (Receita)', 'in', 'verified') : null, sug && sug.ativa === false ? badge('CNPJ não ativo', 'out', 'alert') : null),
      h('div', { class: 'kv-list' }, kv('Total', money(total), 'is-total')));
    const head = aviso1('', 'clock', 'A loja emitiu esta nota em contingência: os itens aparecem quando ela for autorizada.');
    // Alguns emissores mandam o valor do QR em centavos, sem vírgula ("10489" = R$ 104,89): o servidor lê assim e a pessoa confere/corrige aqui
    const conferir = q.valor_conferir ? aviso1('', 'alert', 'O QR desta nota veio sem vírgula (“' + q.valor_original + '”). Entendemos ' + money(total) + '. Confira com o comprovante e corrija abaixo, se preciso.') : '';
    if (res.provisoria) {
      root.replaceChildren(steps(2), head, resumo,
        aviso1('is-ok', 'check', 'Esta compra já foi lançada só pelo valor' + (res.provisoria.data ? ' em ' + dmy(res.provisoria.data) : '') + '. Leia o QR de novo mais tarde para completar com os itens.'),
        h('div', { class: 'btn-col' }, btn('Ver lançamento', { size: 'lg', full: true, icon: 'receipt', onClick: () => verLancId(res.provisoria.lancamento_id) }), btn('Voltar', { kind: 'ghost', icon: 'chevL', onClick: passo1 })));
      return;
    }
    const isCard = () => (store.recs.get(rec) || {}).tipo === 'CARTAO';
    const parcWrap = h('div', { class: 'field', hidden: !isCard() }, h('span', { class: 'field-label' }, 'Parcelas'), stepper({ value: parc, min: 1, max: 12, format: (v) => v + '×', label: 'Parcelas', onChange: (v) => { parc = v; } }));
    const b = btn('Lançar só pelo valor', { size: 'lg', full: true, icon: 'check', disabled: !(total > 0) });
    const campoValor = q.valor_conferir ? moneyField('Valor da compra', { value: total, onChange: (v) => { total = v; b.disabled = !(total > 0); } }) : '';
    b.onclick = async () => {
      if (!rec) { err.show('Escolha como pagou.'); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); err.show('');
      try {
        const p = { provisoria: true, chave: res.chave, data, total, recurso_id: rec, categoria_id: cat || undefined, parcelas: isCard() && parc > 1 ? parc : undefined };
        if (res.loja_id) p.loja_id = res.loja_id; else p.loja = { nome, cnpj: res.cnpj || undefined };
        const r = await call('nfce.importar', p, { rid });
        await successBurst(root, 'Compra lançada');
        emit('dados');
        root.replaceChildren(steps(2), resumo,
          aviso1('is-ok', 'check', 'Compra lançada só pelo valor.'),
          h('p', { class: 'sheet-note' }, 'Quando a nota for autorizada, abra o lançamento e toque em “Completar com a nota”.'),
          h('div', { class: 'btn-col' }, btn('Ver lançamento', { size: 'lg', full: true, icon: 'receipt', onClick: () => verLancId(r.lancamento.id) }),
            btn('Ler outra nota', { kind: 'ghost', icon: 'camera', onClick: () => { entrada = texto = ''; res = null; passo1(); } })));
      } catch (x) { err.show(x.message); b.disabled = false; } finally { b.removeAttribute('aria-busy'); }
    };
    const rid = uuid();
    root.replaceChildren(steps(2), head, conferir, err, avisoDuplicadas() || '', resumo, campoValor,
      pickField('Pagou com', { value: rec, items: () => recursoItems(), onChange: (v) => { rec = v; parcWrap.hidden = !isCard(); } }), parcWrap,
      pickField('Categoria', { value: cat, placeholder: 'Opcional', items: () => categoriaItems('DESPESA'), onChange: (v) => { cat = v; } }),
      h('p', { class: 'sheet-note' }, 'Depois dá para completar com os itens, lendo o mesmo QR.'),
      h('div', { class: 'btn-col' }, b, btn('Voltar', { kind: 'ghost', icon: 'chevL', onClick: passo1 })));
  }
  passo1();
}
const titulo = (s) => String(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E|Em|Com)\b/g, (w) => w.toLowerCase());
