# Nexora — interface (ui/)

HTML + CSS + JavaScript puro (módulos ES). Sem build.

## Rodar
```
npx serve ui        # ou: python3 -m http.server -d ui
```
- Demonstração (dados fictícios, qualquer código de 6 dígitos): `http://localhost:3000/?demo=1`
- Real: `http://localhost:3000/` usa `window.NEXORA_API_URL` de `config.js`. Sem URL configurada, cai na demonstração.
- Demonstração com latência realista: `?demo=1&lento=1`. Em Ajustes → Modo demonstração: sem conexão, falha, conflito, sessão expirada, espaço só leitura, primeiro acesso, banco não criado.

## Estrutura
- `config.js` — URL da API e constantes.
- `css/` — `tokens.css` (cores oklch claro/escuro, espaço, raios, sombras, tipografia, movimento), `base.css` (shell), `components.css`, `telas.css`.
- `js/api.js` — `api(action, payload)` única; injeta `_tk`, `_ws`, `_rid` (gerado ao abrir o formulário e reaproveitado em reenvios); cache de leitura em memória (limpo após escrita) e cópia offline em `localStorage`; trata `LOGIN`, `CONFLITO`, `SEM_ESPACO`, `SEM_BANCO`.
- `js/demo.js` — implementação local de todas as rotas com motor coerente (saldos derivados, faturas por fechamento, parcelas, estorno, planejamento por prioridade, recorrências, comparação com deslocamento, NFC-e).
- `js/ui/` — sheet (arrastar, pontos de parada, Esc/voltar via History API), seletores ricos (sem `<select>`), data, máscara de moeda, gestos (deslizar, segurar, puxar para atualizar, rolagem infinita), gráficos SVG, câmera/código de barras, pdf.js.
- `js/telas/` — uma tela por arquivo.

## Mapa tela → rotas
- Acesso: `auth.pedir`, `auth.confirmar`, `sistema.iniciar` (banco não criado), `bootstrap`.
- Espaços/pessoas (troca de espaço, Ajustes): `ws.listar`, `ws.criar`, `ws.renomear`, `membros.listar/convidar/remover`, `perfil.salvar`, `exportar.espaco`, `integridade.verificar`.
- Início: `relatorios.painel`, `relatorios.serie`, `relatorios.fluxo`, `alertas.precos`.
- Lançamentos: `lancamentos.listar/detalhe/historico/criar/atualizar/efetivar/cancelar/estornar`, `categorias.listar` (via bootstrap).
- Contas e cartões: `relatorios.saldos`, `recursos.listar/criar/atualizar/inativar`, `cartoes.situacao`, `faturas.listar/detalhe/pagar`.
- Agenda: `relatorios.fluxo`, `recorrencias.listar/salvar/gerar`.
- Planejamentos: `planejamentos.listar/situacao/salvar`.
- Início → cartão Resultado (navega por mês): `relatorios.resultado`.
- Compras: `listas.listar/criar/arquivar/detalhe`, `listas.item.adicionar/atualizar`, `sessoes.iniciar/listar/detalhe/item.salvar/item.adicionar/concluir/cancelar`, `comparacao.lista`, `produtos.listar/salvar/porGtin/imagens/imagem.salvar/imagem.remover`, `lojas.listar/salvar/proximas`, `precos.registrar/compartilhados/confirmar/historico/evolucao`, `denuncias.criar`, `reputacao.minha`.
- Ajustes: `config.ler/salvar`, `categorias.salvar`.
- Nota fiscal: `nfce.interpretar`, `nfce.importar`.
- Administração: `admin.painel/cadastro/usuario.ativo/papel/catalogo/preco.decidir/produto.mesclar/reputacao/imagem/denuncias/denuncia.decidir/renomear`.

## Pendências de servidor (sugestões, backend não alterado)
1. `relatorios.fluxo.itens[]` sem `id` (lançamento/fatura) e `status`: a agenda precisa deles para efetivar/pagar com um gesto. A demo já envia.
2. Não há `produtos.detalhe {id}`: a tela de produto usa `produtos.listar {todos, limite:200}` como fallback.
3. `precos.compartilhados` não traz `status` (suspeito/observado): a UI usa se vier.
4. `admin.denuncias` sem `resumo`/`motivos` legíveis; não há rota para listar usuários da plataforma (a aba Usuários age por e-mail).
5. `bootstrap.saldos` sem formato documentado; a UI espera `{recurso_id: {saldo_atual, saldo_projetado}}`.

## Decisões
- Navegação: barra inferior (Início, Lançamentos, Contas, Compras, Mais) + FAB "Novo lançamento"; ≥768 px trilho lateral, ≥1100 px barra lateral completa. Atalhos: `n`, `/`, `1–7`, `r`, `?`, `Esc`.
- Tipos sempre com ícone + sinal + cor: entrada (verde, ↙, +), saída (vermelho, ↗, −), transferência/pagamento de fatura (azul, ⇄, sem sinal).
- Sem exclusão: só cancelar (futuro) ou estornar (efetivado), com "Desfazer" de 5 s no cliente.
- `design-system.html` monta os componentes reais (módulos do app) com tokens, ícones, campos, gráficos, estados e sheets; abre pelo mesmo servidor estático.
- PWA: ícones SVG + PNG 192/512 e maskable; o service worker guarda o shell e as telas (dados nunca são cacheados pelo SW; leitura offline vem do cache do `api.js`).
- Rascunho automático no formulário de lançamento (fechar sem querer não perde dados); demais formulários são curtos.
- `prefers-reduced-motion`: durações zeradas e animações contínuas desligadas.
