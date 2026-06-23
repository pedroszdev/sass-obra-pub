# Handoff: Plataforma de Editais de Obra Pública

## Overview
SaaS para o **empreiteiro de obra pública** (dono de empreiteira / engenheiro orçamentista) encontrar
licitações (editais) de obra pública relevantes para a sua região e preparar a participação.
O diferencial é o **foco exclusivo em obra pública**. O usuário não é técnico — a interface precisa
ser **clara e objetiva**: ele quer responder rápido "tem obra na minha região, no meu tamanho de
empresa, pra eu participar?".

Toda a interface é em **português do Brasil**. Valores em **R$** (`Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })`)
e datas em **dd/MM/yyyy**.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram a
aparência e o comportamento pretendidos, **não código de produção para copiar diretamente**. A tarefa
é **recriar estes designs no ambiente do codebase de destino** usando seus padrões e bibliotecas já
estabelecidos.

A stack-alvo definida no briefing original é:
- **React 18 + TypeScript**
- **Mantine v8** (`@mantine/core`, `@mantine/hooks`) como biblioteca de componentes — usar
  `AppShell`, `Card`, `Table`, `TextInput`, `Select`, `NumberInput`, `Pagination`, `Badge`, `Group`,
  `Stack`, `Skeleton`, `Stepper`, `Progress`, etc. **Não** trazer outra lib de UI.
- **react-router-dom v6** para navegação.
- Cliente HTTP via `fetch` nativo (sem axios/react-query — manter simples).

> O protótipo foi escrito com estilos inline (sem Mantine de fato) só para validar visual e fluxo
> rapidamente. Na implementação real, **mapeie cada bloco para o componente Mantine equivalente** e
> use o tema do Mantine para os tokens abaixo.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios e estados estão definidos e devem
ser reproduzidos fielmente — mas usando os componentes do Mantine. O accent laranja (`#e8590c`) deve
virar a `primaryColor` do tema (escala "orange" do Mantine já é próxima; pode customizar).

## Screens / Views

A navegação é um **AppShell** com `navbar` lateral fixa (236px) + `header` (60px) + área de conteúdo.
Rotas sugeridas (react-router):

| Rota | Tela |
|------|------|
| `/` | Início (home) |
| `/editais` | Busca de editais (lista + filtros) |
| `/editais/:id` | Detalhe do edital |
| `/orcamentos` | Lista de orçamentos |
| `/orcamentos/:editalId` | Editor de orçamento |
| `/documentos` | Cofre de documentos + checklist por edital |
| `/agenda` | Agenda de prazos |
| `/perfil` | Perfil da empresa |
| `/onboarding` | Assistente de primeiros passos (4 passos) |

### Navbar (sidebar, 236px)
- Fundo `#fff`, borda direita `1px solid #dee2e6`, padding `16px 12px`.
- Topo: logo quadrado 32px `#e8590c` raio 8px com "OP" branco bold + nome "ObraPública" / subtítulo "Editais & propostas".
- Itens de navegação (ícone 18px + label 14px/600): **Início, Editais, Orçamentos, Documentos, Agenda, Perfil da empresa**.
  - Item ativo: fundo `#fff4e6`, texto `#d9480f`. Inativo: fundo transparente, texto `#495057`.
  - Padding `9px 11px`, raio 8px, gap 11px.
- Rodapé (empilha ao fundo via `margin-top:auto`): avatar 34px circular `#e7f5ff`/`#1971c2` com iniciais, nome da empresa + "Porte ME · SC". Clicável → `/perfil`.

### Header (60px)
- Borda inferior `1px solid #dee2e6`, fundo `#fff`, padding `0 24px`.
- Esquerda: título da seção (17px/700).
- Direita: **apenas nas telas de Editais e Detalhe**, um seletor de estado demo (Normal / Carregando / Vazio / Erro) — isso é só ferramenta de protótipo; **não implementar em produção** (os estados reais vêm do ciclo de fetch).

### Tela 1 — Início (home)
- **Purpose**: ponto de entrada que amarra a jornada (descobrir → avaliar → preparar → acompanhar).
- **Layout**: container max-width 1100px centralizado, padding `28px 32px 48px`.
- **Componentes**:
  1. Saudação: "Bem-vindo, {nomeCurto}" (23px/700) + subtítulo (14px `#868e96`) com "município/UF · Porte · N editais na sua região".
  2. **Hero de busca**: card `#fff4e6` borda `#ffe8cc` raio 14px, padding `24px 26px`. Título 18px/700 `#7a3208`. Campo de busca (altura 46px, ícone lupa) + botão "Buscar" laranja. Abaixo, 3 chips de atalho: "Minha região (UF)", "Até R$ 80 mil (ME/EPP)", "Publicados esta semana".
  3. **4 stat cards** (grid 4 col, gap 14px): "Editais na sua região", "Prazos encerrando" (número em `#e03131`), "Prontidão do perfil %", "Documentos válidos". Cada um clicável (hover: sobe 1px + sombra) com link contextual laranja.
  4. **6 module cards** (grid 3 col): Buscar editais, Resumo com IA, Prontidão & match, Checklist de habilitação, Orçamentos, Agenda de prazos. Cada um: ícone 42px em quadrado `#fff4e6`/`#e8590c` raio 10px, título 15px/700, descrição 13px `#868e96`.
  5. **Duas colunas (grid 1fr 1fr)**: "Prazos encerrando" (lista com badge de data dia/mês vermelho) e "Editais recentes na sua região" (mini-cards com objeto truncado, local e valor).

### Tela 2 — Busca de editais (lista + filtros)
- **Layout**: `navbar` de filtros (300px, `#fff`, borda direita) + `main` rolável (padding `20px 26px 40px`).
- **Painel de filtros**:
  - **UF** — `Select` com as 27 UFs (label "UF — Nome").
  - **Município** — `Select` desabilitado até escolher UF; opções dependem da UF; resolve para `codigoIbge` (7 dígitos). Nota explicativa abaixo.
  - **Faixa de valor** — dois `NumberInput` (Mín./Máx., R$). Botão-atalho "Até R$ 80 mil (ME/EPP)" (chip `#fff4e6`/`#d9480f`) que seta valorMax=80000.
  - **Período** — dois inputs date (De / Até) sobre `dataPublicacao`.
  - Botões **Aplicar** (laranja) e **Limpar**.
  - Filtros têm estado **pending** (enquanto edita) vs **applied** (após "Aplicar") — só "Aplicar" dispara a busca.
- **Busca textual** (topo do main): campo único (altura 44px, ícone lupa), placeholder "Buscar no objeto: pavimentação, escola, ponte…", **debounce ~400ms** sobre o param `q`.
- **Toolbar**: contagem "N editais encontrados" + "Ordenado por: mais recentes primeiro".
- **Chips de filtros ativos**: removíveis individualmente (× em círculo `#f1f3f5`).
- **Lista de resultados** (cards, recomendado): cada card raio 11px, borda `#dee2e6`, padding `17px 19px`, hover sobe 1px + sombra + borda `#ffd8a8`. Layout: coluna esquerda (badges de modalidade + situação, objeto 16px/600 truncado em 2 linhas, órgão, "Município/UF · Fonte: PNCP") e coluna direita 178px alinhada à direita (Valor estimado, Prazo da proposta). **Card inteiro clicável → detalhe**.
  - **Prazo urgente** (≤ `urgentDays`, default 7 dias): badge vermelho `#fff5f5`/`#e03131` com "dd/mm/aaaa · Encerra em N dias / hoje / amanhã". Senão texto normal.
- **Paginação**: componente Mantine `Pagination` usando `total` e `pageSize`. Default pageSize 6 no protótipo (briefing diz default 20 na API).

### Tela 3 — Detalhe do edital
- **Layout**: container max-width 880px, padding 24px. Botão "‹ Voltar para a busca" (texto laranja).
- **Cabeçalho** (card): badges (modalidade laranja, situação, "Fonte: PNCP"), título `objeto` (h1 23px/700), órgão (15px/600), município/UF.
- **3 stat cards** (grid 3 col): Valor estimado, Data de publicação, Prazo da proposta (vermelho se urgente).
- **Resumo com IA** (card): ícone "sparkle" + título "Resumo com IA" + badge "Gerado automaticamente". Parágrafo de resumo (14px, line-height 1.6). Subseção "Pontos de atenção" com 3 itens, cada um com tag de nível (Alto `#e03131`/`#fff5f5`, Médio `#e8590c`/`#fff4e6`, Baixo `#2f9e44`/`#ebfbee`) + texto.
- **Prontidão da empresa para esta obra** (card): título + label "N de M requisitos". Lista de 5 itens com ícone ✓ verde (atende) ou ! laranja (pendente). Botão "Revisar documentos no cofre" → `/documentos`.
- **Tabela de definições** (linhas label/valor): Órgão, CNPJ, Município/UF, Código IBGE, Modalidade, Situação, Fonte, Identificador, Publicado em, Atualizado em.
- **Ações**: "Abrir documento na fonte ↗" (laranja, abre `linkOrigem` em nova aba), "★ Acompanhar edital" (outline laranja → adiciona à agenda), "Voltar à lista".

### Tela 4 — Orçamentos (lista)
- Header com "+ Novo orçamento" (laranja). Cards: badge de status (Concluído verde / Em elaboração laranja / Rascunho cinza), objeto truncado, "N itens · BDI x% · atualizado em dd/mm/aaaa", total da proposta à direita. Card → editor.

### Tela 5 — Editor de orçamento
- Botão "‹ Voltar para orçamentos". Cabeçalho com objeto + órgão/local + "Valor de referência: R$".
- **Planilha** (card): cabeçalho de colunas (#, Descrição do serviço, Unid., Qtd., Preço unit., Total) sobre `#f8f9fa`. Linhas com valores. Botão "+ Adicionar item (banco SINAPI/SICRO)" (outline tracejado laranja). → Usar `Table` do Mantine; em produção as células de qtd/preço devem ser editáveis.
- **Duas colunas (grid 1.4fr 1fr)**:
  - **Cronograma físico-financeiro**: 4 fases, cada uma com label + % e barra de progresso (`Progress` do Mantine, preenchimento `#e8590c`).
  - **Composição da proposta**: Custo direto, BDI (24,5%), **Total** (20px/800 laranja). Botão "Exportar proposta (PDF / planilha)".

### Tela 6 — Documentos (cofre + checklist)
- **Card de prontidão**: anel SVG de progresso (`#e8590c` sobre `#f1f3f5`) + "Prontidão de habilitação %" + resumo "N válidos · N vencendo · N vencido · N faltando".
- **Cofre de documentos** (lista): cada linha = nome do doc + label de validade + badge de status (Válido verde / Vence em breve laranja / Vencido vermelho / Faltando cinza) + botão de ação (Ver/Renovar/Enviar).
- **Área de upload** (tracejada): "Arraste um arquivo ou clique para enviar… PDF, JPG ou PNG · até 10 MB".
- **Checklist de habilitação por edital**: `Select` de edital → ao escolher, mostra card cruzando exigências do edital × documentos do cofre. Cada exigência: ícone (✓ verde atende / ! laranja vence / × vermelho pendente) + nome + badge (Atende/Vence em breve/Vencido/Pendente). Cabeçalho com "N de M exigências atendidas".

### Tela 7 — Agenda de prazos
- Lista de prazos. Cada item: badge de data (dia grande + mês), tipo do prazo (uppercase laranja) + "· em N dias / hoje / amanhã" (vermelho se urgente), objeto truncado, chevron ›. Tipos: "Entrega da proposta", "Sessão de disputa", "Impugnação / esclarecimento". Clicável → detalhe do edital.

### Tela 8 — Perfil da empresa
- **Cabeçalho** (card): avatar 60px + razão social + "CNPJ · Porte · município/UF · desde ano". Botões "Refazer configuração" (outline laranja → onboarding) e "Editar perfil".
- **Qualificação econômico-financeira** (3 stat cards): Capital social, Faturamento anual, Índice de liquidez.
- **Ramos de atuação (CNAE)**: lista.
- **Acervo técnico** (obras executadas): cards com obra, "órgão · ano · ART/CAT", valor.
- **Duas colunas**: Responsáveis técnicos (avatar com iniciais, nome, "CREA · formação") e Regiões de interesse (lista com ◉).

### Tela 9 — Onboarding (assistente)
- Container 640px. **Stepper** horizontal de 4 passos (Empresa, Documentos, Região, Pronto): círculo 30px (laranja preenchido para concluído/atual com ✓ ou número, `#f1f3f5` para futuro), label abaixo, linha conectora (`#e8590c` concluída / `#dee2e6`).
- Card de conteúdo por passo:
  1. **Empresa**: inputs CNPJ, razão social, porte (select), UF (select).
  2. **Documentos**: área de upload tracejada + nota "pode pular".
  3. **Região**: chips selecionáveis de regiões.
  4. **Pronto**: ✓ grande verde + "Tudo pronto!".
- **Footer**: "Voltar" (passos 2–4, outline) à esquerda; "Continuar" (passos 1–3; "Concluir" no passo 3) / "Ir para o início" (passo 4) à direita — laranja.

### Estados (lista e detalhe)
- **Carregando**: `Skeleton` (cards de resultado / blocos do detalhe) com shimmer.
- **Vazio**: ícone lupa + "Nenhum edital encontrado com esses filtros." + sugestão de ampliar + botão "Limpar filtros".
- **Erro**: ícone "!" vermelho + "Não foi possível carregar os editais." + botão "Tentar de novo".
- (Implementar os mesmos três estados nas telas novas — orçamentos, documentos, agenda — que no protótipo ainda só têm estado normal.)

## Interactions & Behavior
- **Navegação**: sidebar troca de rota; cards/itens clicáveis navegam ao detalhe/editor.
- **Busca**: `q` com debounce 400ms; filtros aplicados só no botão "Aplicar"; chips removem filtros individualmente; "Limpar" zera tudo.
- **Atalhos da home**: setam filtros pré-definidos e navegam para `/editais` (Minha região = UF da empresa; ME/EPP = valorMax 80000; Esta semana = dataInicio = hoje-7).
- **Paginação**: `Pagination` controla `page`; resetar para 1 ao mudar filtros/busca.
- **Onboarding**: avança/volta entre 4 passos; "Ir para o início" finaliza.
- **Prazo urgente**: destaque vermelho quando faltam ≤ `urgentDays` (default 7) dias.
- **Abrir na fonte**: `<a target="_blank" rel="noopener">` para `linkOrigem`.
- Hover em cards: `translateY(-1px)` + sombra `0 6px 18px rgba(0,0,0,.08)` + borda `#ffd8a8`.

## State Management
- `screen`/rota atual, `selectedId` (edital), `selectedOrcId`, `checklistEditalId`, `onbStep`.
- Filtros: `pending` (em edição) e `applied` (efetivado); `query` (debounced) e `queryRaw`; `page`.
- Data fetching (substituir os mocks):
  - `GET /editais?{uf,q,codigoIbge,valorMin,valorMax,dataInicio,dataFim,page,pageSize}` → `{ data, total, page, pageSize }`.
  - `GET /editais/:id` → `EditalDetail`.
  - Sugeridos (a definir no back): `GET /perfil`, `GET /documentos`, `GET /orcamentos`, `GET /orcamentos/:editalId`, `GET /agenda`, `GET /editais/:id/checklist`, resumo IA via endpoint próprio.
- JWT em `Authorization: Bearer <token>`.

## Design Tokens
**Cores**
- Accent (primary): `#e8590c`; hover `#d9480f`; escuro p/ texto sobre claro `#7a3208`, `#9a5a2b`, `#d9480f`.
- Accent tints: `#fff4e6` (fundo), `#ffe8cc`, `#ffd8a8` (bordas), `#fff9f3` (hover claro).
- Texto: `#212529` (forte), `#343a40`, `#495057` (médio), `#868e96` (secundário), `#adb5bd` (placeholder).
- Bordas/superfícies: `#dee2e6` (borda), `#f1f3f5` / `#f8f9fa` (fundos), `#fff` (cards), `#fff` sobre `#f8f9fa` (página).
- Sucesso: `#2f9e44` / `#ebfbee`. Alerta: `#e8590c` / `#fff4e6`. Erro: `#e03131` / `#fff5f5` / borda `#ffc9c9`.
- Info (avatar): `#1971c2` / `#e7f5ff`.

**Tipografia** — font-family do sistema (`-apple-system, "Segoe UI", Roboto, …`); na implementação Mantine, usar a fonte padrão do tema.
- Títulos de seção 17–23px/700; títulos de card 15–16px/600–700; corpo 13.5–14px; secundário 12–12.5px; labels/uppercase 10.5–11px com letter-spacing ~0.4px.

**Raios**: cards 11–14px; inputs/botões 7–9px; chips/badges 999px (pill); avatares 50%.
**Sombras**: hover de card `0 6px 18px rgba(33,37,41,.09)`; cards de stat hover `0 4px 14px rgba(0,0,0,.07)`.
**Espaçamento**: padding de card 16–26px; gaps de grid 12–18px; alturas de input 36–46px.
**Skeleton shimmer**: `linear-gradient(90deg,#f1f3f5 25%,#e9ecef 37%,#f1f3f5 63%)`, `background-size:400% 100%`, animação 1.4s.

## Assets
- Sem imagens externas. Ícones são **SVG inline** simples (lupa, grid, calendário, documento, usuário, sparkle, check). Na implementação, substituir por ícones do `@tabler/icons-react` (pacote de ícones padrão do Mantine).
- Logo "OP" é um placeholder textual — substituir pela marca real quando houver.

## Files
- `Plataforma de Editais.dc.html` — app completo (home, busca, detalhe, orçamentos+editor, documentos+checklist, agenda, perfil, onboarding). **Referência principal.**
- `Busca de Editais.dc.html` — versão focada só na busca + detalhe (Tela 1 e 2 do briefing original), caso queira começar pelo núcleo.

> Os `.dc.html` abrem direto no navegador para inspeção visual. O markup usa estilos inline e um
> pequeno runtime de template — leia-os como **referência de layout/medidas/cores**, recriando a UI
> em React + Mantine.
