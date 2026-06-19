# BACKLOG.md

> Backlog da funcionalidade **Captação e busca de editais por região** (camadas 1 e 2).
> Do repositório vazio até a busca funcionando com o PNCP (fonte primária da camada 1).
> Leia junto com `CLAUDE.md`. Trabalhe **uma task por vez**, na ordem. Marque o checkbox ao concluir.

**Legenda de tamanho:** 🟢 P (~1h) · 🟡 M (~3h) · 🔴 G (dia inteiro ou quebrar em menores)

**Regra de ouro:** termine e commite uma task antes de pegar a próxima. Cada task = um commit.

> 📋 **Resultados dos spikes (T-01–T-03):** ver [`spikes/RESULTADOS.md`](spikes/RESULTADOS.md) — fontes validadas, decisões e impactos nas próximas tasks.

---

## Épico 0 — Validação e fundação
*Antes de construir o produto, provar que as fontes funcionam e montar a base.*

- [x] **T-01 — Spike: testar a API do PNCP num script isolado** 🟢
  - Script Node standalone que chama a API de consulta de contratações do PNCP, busca editais de um período e imprime o JSON.
  - Objetivo: ver com os próprios olhos o que a API retorna. Não precisa ser código de produto.
  - **Pronto quando:** rodou e viu editais reais chegando em JSON no terminal.

- [x] **T-02 — Spike: validar cobertura de OBRA e granularidade regional** 🟡
  - No mesmo script, filtrar por modalidade de obra/serviço de engenharia e por um estado (UF).
  - Contar quantos editais de obra aparecem por dia; checar se vêm com município, UF e valor preenchidos.
  - **Pronto quando:** dá para responder com dados "o PNCP tem volume de obra suficiente e dados completos?".
  - **Dependência:** T-01.

- [x] **T-03 — Spike: testar a API do Compras.gov.br (dados abertos)** 🟡
  - Mesmo exercício para a segunda fonte da camada 1 (compras.dados.gov.br).
  - Confirmar formato, campos e como filtrar licitações de obra. Comparar com o PNCP (sobreposição/complemento).
  - **Pronto quando:** você sabe o que cada fonte traz e onde se sobrepõem.
  - **Dependência:** T-01.

- [x] **T-04 — Inicializar o repositório (monorepo pnpm)** 🟢
  - Criar repo no GitHub; estrutura de pastas (`apps/api`, `apps/web`, `packages/`); README; `.gitignore`; licença.
  - **Pronto quando:** repo no GitHub com estrutura base e primeiro commit.

- [x] **T-05 — Configurar backend base (NestJS + TypeORM + Postgres)** 🟡
  - Esqueleto do NestJS com conexão ao Postgres via Docker; endpoint `GET /health` funcionando.
  - **Pronto quando:** `GET /health` responde e o banco conecta.
  - **Dependência:** T-04.

- [x] **T-06 — Configurar deploy / ambiente** 🟡
  - Backend rodando em ambiente acessível (Railway/Render) com banco gerenciado; deploy contínuo a partir do main.
  - Não deixar deploy para o fim. (Confirmar plataforma comigo antes — ver CLAUDE.md.)
  - **Decisão (2026-06-16):** **Render** (plano free) + imagem **Docker**. Infra como código no `render.yaml`; passo a passo no `DEPLOY.md`.
  - **No ar:** <https://obrapub-api.onrender.com/health> → `{"status":"ok", database: up}`. Deploy contínuo no push pra `main`.
  - **Pronto quando:** `/health` responde de uma URL pública. ✅
  - **Dependência:** T-05.

---

## Épico A — Autenticação (adicionado fora do escopo original)
*Cadastro e login com JWT. Pedido explícito do dono do produto (2026-06-16), antecipando
a base de usuários. Nota: o CLAUDE.md §9 ainda lista "não construir login" — atualizar lá
se a decisão for permanente.*

- [x] **T-A1 — Cadastro + login com JWT (access + refresh)** 🟡
  - Entidade `User` (email, senha, nome, CNPJ, porte, role, **`uf`**) e `RefreshToken` (rotação/revogação), via migration.
  - Endpoints: `POST /auth/register` (auto-login), `POST /auth/login`, `POST /auth/refresh` (rotação), `POST /auth/logout`, `GET /users/me` (protegido).
  - `JwtStrategy` + `JwtAuthGuard` + `RolesGuard`/`@Roles`/`@CurrentUser`; `ValidationPipe` global.
  - `role` nunca aceito no cadastro (sempre `USER`) — evita escalonamento de privilégio.
  - **`uf` obrigatória no cadastro** (validada contra as 27 UFs): é o alvo da captação orientada à demanda — ver nota em T-08/T-18.
  - **Pronto quando:** registrar → logar → acessar rota protegida → renovar → deslogar funciona ponta a ponta. ✅

---

## Épico 1 — Modelo de dados
*A estrutura que guarda os editais.*

- [x] **T-07 — Modelar a entidade `Edital`** 🟡
  - Campos: órgão, município, UF, objeto, modalidade, valor estimado, data de publicação, prazo de proposta, link original, `fonte`, `idExterno`.
  - Criar via migration do TypeORM.
  - **Feito (2026-06-16):** tabela `editais` com os campos mapeados + `isObra` + `rawPayload` jsonb + `objetoBusca` (tsvector gerado). `UNIQUE(fonte, idExterno)`, índice composto `(uf, isObra, dataPublicacao)`, índices de filtro e **GIN** para full-text PT. `valorEstimado` em `numeric(15,2)` com transformer. Validado por SQL: insert, dedup, full-text e índices.
  - **Absorveu parte de T-22 e T-24** (full-text e índices já criados aqui — ver notas lá).
  - ⚠️ **Convenção (papercut do TypeORM):** o índice **GIN** de full-text é criado por SQL cru, então **toda `migration:generate` gera um `DROP INDEX IDX_editais_objeto_busca`** (e recria no `down`). **Sempre remova essas duas linhas** ao revisar uma migration nova.
  - **Pronto quando:** a tabela existe no banco via migration. ✅
  - **Dependência:** T-05.

- [x] **T-08 — Modelar tabela de controle de sincronização** 🟢
  - Guardar última data/página consultada por fonte (para o job continuar de onde parou) e registrar erros de sync.
  - **Captação orientada à demanda (decisão 2026-06-16):** o controle é por **fonte + UF**, com status de **backfill por UF** (se a UF já foi semeada). Ver nota em T-18.
  - **Feito (2026-06-16):** tabela `sync_states` (UNIQUE fonte+uf; `backfillDone`, `syncedUntil` watermark, `lastRunAt`, `lastError`/`lastErrorAt`, `consecutiveErrors`) via migration + `SyncStateService` (`getOrCreate`/`markSynced`/`recordError`) testado (5 testes). Rastreia **data** (watermark), não página — o conector pagina sozinho. **Fecha o Épico 1.**
  - **Pronto quando:** dá para registrar e ler "última sincronização da fonte X **na UF Y**". ✅
  - **Dependência:** T-05.

- [x] **T-09 — Definir o catálogo de modalidades e tipos de obra** 🟡
  - Regra de negócio central: quais modalidades contam como obra; quais palavras no objeto incluem/excluem.
  - Guardar de forma **configurável e centralizada** (não espalhar pelo código).
  - **Feito (2026-06-16):** `src/editais/obra/` — `obra-catalog.ts` (modalidades de obra **por fonte** + palavras de inclusão/exclusão, centralizado e ajustável) e `obra-classifier.ts` (`isEditalObra` puro). **Critério (decisão):** modalidade de obra basta, menos exclusões (favor recall) — exclusão > modalidade > inclusão. 7 testes. **Aplicar na ingestão é a T-15.**
  - **Pronto quando:** existe uma lista clara e ajustável do que é "edital de obra". ✅

- [x] **T-10 — Modelar tabela de regiões (UF / município)** 🟢
  - Base de UFs e municípios do IBGE para padronizar o filtro regional e permitir busca por cidade.
  - **Feito (2026-06-16):** tabela `municipios` (codigoIbge PK, nome, nomeNormalizado indexado, uf) via migration; **5.571 municípios** semeados do IBGE (JSON commitado em `src/geo/data/`, seed idempotente `seed:municipios`, rodado também no entrypoint se vazio). UFs ficam no código (`UF_NOMES` em `common/uf.ts`) — sem tabela de 27 linhas. `normalizeText` consolidado em `common/text.ts`. Validado por SQL (4206009 → Governador Celso Ramos/SC; SC=295).
  - **Pronto quando:** dá para associar cada edital a um município padronizado. ✅
  - **Dependência:** T-05.

---

## Épico 2 — Captação (o motor)
*Conectores das fontes + job automático. Aqui vive o padrão de conector do CLAUDE.md.*

- [x] **T-11 — Criar a camada de "conector de fonte" (interface comum)** 🟡
  - Abstração que todo conector implementa: dado um período → devolve editais no formato interno padronizado.
  - É o que faz PNCP e Compras.gov.br (e a camada 2 depois) entrarem pela mesma porta.
  - **Feito (2026-06-16):** em `src/editais/connectors/` — `EditalSourceConnector` (`fetchEditais(query): AsyncIterable<EditalSourceRecord>` + `readonly fonte`), `EditalQuery` (uf + período), `EditalSourceRecord` (formato padronizado, sem `isObra`/colunas de banco) e o token DI `EDITAL_SOURCE_CONNECTORS` (multi). Conector novo = classe implementando a interface + registro no token. Contrato puro (sem migration/endpoint/teste).
  - **Pronto quando:** existe a interface e está claro como um conector novo se encaixa. ✅
  - **Dependência:** T-07.

- [x] **T-12 — Conector PNCP: buscar editais** 🔴
  - Chamada real à API do PNCP; mapear a resposta para a entidade `Edital`. Aproveitar aprendizado de T-01/T-02.
  - **Feito (2026-06-16):** `PncpConnector` (implementa `EditalSourceConnector`) em `src/editais/connectors/pncp/`. `fetchEditais` pagina Concorrência (4 e 5) por UF/período e emite `EditalSourceRecord` mapeado (`mapPncpRecord` puro). `fetch` nativo (sem dep nova). Registrado no token via factory no `EditaisModule`. Paginação básica + retry no 429 (endurecimento = T-13). Testado: mapper (registro real + nulos + fuso) e generator (paginação, 429, vazio, erro) — 22 testes. Requisição validada ao vivo (200, 213 reg/5 págs em SC).
  - **Pronto quando:** chamar o conector traz editais do PNCP no formato padrão. ✅
  - **Dependência:** T-11.

- [x] **T-13 — Conector PNCP: tratar paginação e limites** 🟡
  - Busca completa respeitando paginação e rate limit, sem perder editais nem ser bloqueado.
  - **Feito (2026-06-16):** `fetchPage` com retry robusto — **429** (honra `Retry-After`), **5xx** e **timeout/erro de rede** re-tentados com **backoff exponencial + jitter** (teto 30s, até 6 tentativas); **4xx não-429 falha de imediato**. Paginação sequencial com delay entre páginas. 9 testes (429, Retry-After, 5xx, timeout, desistência, 4xx imediato, paginação, vazio).
  - **Pronto quando:** o conector busca um período inteiro sem perder editais nem tomar erro. ✅
  - **Dependência:** T-12.

- [x] **T-14 — Lógica de deduplicação e upsert** 🟡
  - Ao salvar, checar por `fonte` + `idExterno`. Existe e mudou → atualizar; é novo → inserir.
  - **Feito (2026-06-16):** `EditalUpsertService.upsert(record, isObra)` → `created`/`updated`/`unchanged`. Busca por `fonte`+`idExterno`; detecção de mudança nos campos relevantes (dinheiro em centavos; datas por instante); `isObra` vem por parâmetro (a classificação é T-15). 6 testes + verificação real (upsert 2× → 1 linha, sem duplicar).
  - **Pronto quando:** rodar o conector duas vezes não duplica editais. ✅
  - **Dependência:** T-12.

- [x] **T-15 — Aplicar o filtro de obra na ingestão** 🟡
  - Usar o catálogo do T-09 para marcar/filtrar só o que é obra.
  - Recomendado: guardar os não-obra marcados (para ajustar o filtro depois sem reprocessar).
  - **Feito (2026-06-16):** `EditalIngestionService.ingest(record)` classifica com `isEditalObra` (T-09) e persiste via `upsert` (T-14), gravando `isObra`. Guarda **todos** (obra e não-obra, marcados). Retorna `{ outcome, isObra }`. 3 testes. A busca (T-20) filtra `isObra=true`.
  - **Pronto quando:** só editais de obra aparecem como relevantes no banco. ✅
  - **Dependência:** T-12, T-09.

- [ ] **T-16 — Conector Compras.gov.br: buscar editais** 🔴 ⏸️ DESPRIORIZADA (opcional/futura)
  - ⚠️ **Decisão pós-T-03:** o Compras.gov.br é um **subconjunto do PNCP** (~3,5% do volume em SC; ver `spikes/RESULTADOS.md`). Para obra municipal não agrega. Reavaliar só se houver foco em **obra federal**.
  - A 2ª fonte da camada 2 passa a ser o **Portal de Compras Públicas** — precisa de **spike próprio** antes de virar task (análogo a T-01/T-03).
  - Se/quando implementado: segundo conector, **mesma interface do T-11**; reaproveita dedup e filtro; usar o conector PNCP como referência.
  - **Pronto quando:** editais do Compras.gov.br entram pela mesma porta do PNCP.
  - **Dependência:** T-11, T-14, T-15.

- [~] **T-17 — Normalização para o formato interno** 🟡 *(coberta para fonte única)*
  - Padronizar modalidade/município para o formato interno, usando a tabela de regiões (T-10). **Nota pós-T-03:** o PNCP já entrega `codigoIbge` 100% preenchido, então com fonte única a normalização é leve; a parte "entre fontes" ativa quando entrar a 2ª fonte (Portal).
  - **Status (2026-06-16):** com **fonte única (PNCP)**, o `mapPncpRecord` (T-12) já produz o formato padronizado e o `codigoIbge` casa com a base do IBGE (T-10) — não há o que normalizar "entre fontes" ainda. A parte cross-fonte (de/para de modalidade e match de município por nome) **ativa quando entrar a 2ª fonte** (Portal de Compras Públicas).
  - **Pronto quando:** um edital de qualquer fonte tem município e modalidade no mesmo padrão.
  - **Dependência:** T-10 (e a 2ª fonte da camada 2, quando existir).

- [x] **T-18 — Job agendado de sincronização** 🟡
  - Rotina (cron do NestJS) que roda de tempos em tempos, chama todos os conectores desde a última sync (T-08) e atualiza o banco.
  - **Captação orientada à demanda (decisão 2026-06-16):** o job **não varre o Brasil todo** — busca só as **UFs dos usuários ativos** (lê a `uf` da tabela `users`). Mantém o banco leve e cabe no Postgres free. **Dois modos:**
    - **Backfill** (uma vez, ao surgir UF nova): busca os últimos N dias para já haver o que mostrar (evita "tela vazia" pro 1º usuário da região);
    - **Incremental** (recorrente): só o novo desde a última sync (T-08).
    - **Arquitetura:** o **conector continua sem conhecer "usuário"** (recebe período + UF → editais). Quem decide *quais* UFs é o job. Granularidade de captação = **UF** (filtro nativo do PNCP); busca por município é no nosso banco via `codigoIbge`.
  - **Feito (2026-06-16):** `CaptacaoJobService` (`@Cron` diário + `runOnce()` público). `UsersService.findDistinctUfs()` dá as UFs ativas. Por conector × UF: backfill (**30 dias**) ou incremental (`syncedUntil` − **2 dias** de overlap) → ingere → `markSynced`/`recordError` (falha isolada por UF). `@nestjs/schedule` + `ScheduleModule.forRoot()`. 4 testes; app sobe com toda a DI. **"Ativo" = qualquer UF com ≥1 usuário** (refinável).
  - ⚠️ **Caveat do Render free:** o web service hiberna após ~15 min, então o `@Cron` **não dispara de forma confiável** ali. Para agendamento real: manter o serviço acordado (pinger externo), plano pago, ou um cron externo chamando um endpoint. `runOnce()` permite disparo manual.
  - **Pronto quando:** o banco se atualiza automaticamente sem rodar nada à mão. ✅ *(lógica pronta; e2e real depende de um usuário com UF em produção)*
  - **Dependência:** T-12, T-08. (com fonte única, o job roda só o PNCP; multi-fonte quando entrar a 2ª fonte)

- [x] **T-19 — Logs e monitoramento do job** 🟢
  - Registrar cada execução: novos, atualizados, erros. Para saber se a captação está saudável.
  - **Feito (2026-06-16):** tabela `sync_runs` (uma linha por sync de fonte+UF: modo, status, processados/novos/atualizados/obras, erro, início/fim/duração) via migration. O job grava um run a cada UF (sucesso ou falha), best-effort. `SyncRunService` (`record` + `recent`). Logs estruturados por UF. Leitura via SQL/`recent()` por ora; endpoint admin pode vir no Épico 3. 2 testes (+ asserts no job).
  - **Pronto quando:** dá para ver o histórico de sincronizações e detectar falha. ✅
  - **Dependência:** T-18.

---

## Épico 3 — Busca por região (a API)
*Expor os editais com filtros.*

- [x] **T-20 — Endpoint de busca com filtros** 🔴
  - API que o frontend consome: buscar por UF, município, tipo de obra, faixa de valor e período. Com paginação e ordenação (recentes primeiro).
  - **Feito (2026-06-17):** `GET /editais` (protegido por JWT) em `EditaisController` + `EditaisSearchService`. Filtros: **UF**, **município por `codigoIbge`** (chave padronizada do IBGE), **período** (`dataInicio`/`dataFim` sobre `dataPublicacao`), `page`/`pageSize` (def. 1/20, máx. 100). Sempre `isObra=true` (nota T-15). Função pura `buildEditalWhere(dto)` (TypeORM `Between`/`MoreThanOrEqual`/`LessThanOrEqual`) + `findAndCount` ordenando por `dataPublicacao DESC, id DESC` (paginação estável). Resposta sem `rawPayload`/`objetoBusca`; envelope `{ data, total, page, pageSize }`. 10 testes. **Decisões:** município por código (resolução nome→código = endpoint geo futuro); **faixa de valor fica na T-21**; **busca textual na T-22**.
  - **Pronto quando:** `GET /editais?uf=..&municipio=..` retorna os editais certos. ✅
  - **Dependência:** T-07, T-17.

- [x] **T-21 — Filtro por faixa de valor (porte da empresa)** 🟢
  - Regra de negócio do porte. Permitir filtrar por faixa; atenção ao limite de R$ 80 mil (benefício ME/EPP).
  - **Feito (2026-06-18):** `valorMin`/`valorMax` (em reais) no `SearchEditaisDto`; `buildEditalWhere` ganhou o helper `rangeCondition` (reusado por período e valor). **Sem migration** (coluna e índice `IDX_editais_valor_estimado` já são da T-07). **Decisões:** (1) faixa **livre** no backend — a regra dos R$80k vira constante `ME_EPP_VALOR_LIMITE` (LC 123/2006 art. 48, em `company-porte.enum.ts`) que a UI usa como preset (não embute "diagnóstico" no backend); (2) editais **sem valor** (null) **entram mesmo com a faixa aplicada** (favor recall) — vira `OR` (`where` em array com `IsNull`). +4 testes (total 14 no spec da busca).
  - **Pronto quando:** dá para buscar só obras na faixa de valor do usuário. ✅
  - **Dependência:** T-20.

- [ ] **T-22 — Busca textual no objeto** 🟡
  - Busca por palavra no objeto do edital (ex.: "pavimentação", "escola"). Indexar o campo para ser rápido.
  - **Infra já feita na T-07:** coluna `objetoBusca` (tsvector PT) + índice GIN. Resta **expor no endpoint de busca** (usar `@@ plainto_tsquery('portuguese', ...)`).
  - **Pronto quando:** buscar uma palavra retorna os editais que a contêm, rápido.
  - **Dependência:** T-20.

- [ ] **T-23 — Endpoint de detalhe do edital** 🟢
  - Retornar todos os dados de um edital específico, incluindo o link para o documento original na fonte.
  - **Pronto quando:** `GET /editais/:id` traz o edital completo.
  - **Dependência:** T-07.

- [ ] **T-24 — Performance: índices no banco** 🟢
  - Índices nos campos mais filtrados (UF, município, valor, data, fonte).
  - **Já criados na T-07:** composto `(uf, isObra, dataPublicacao)`, `codigoIbge`, `valorEstimado`, `dataPublicacao`, `UNIQUE(fonte, idExterno)`, GIN do full-text. Resta só **revisar/ajustar** após o endpoint real (T-20) — ex.: paginação por cursor em vez de OFFSET.
  - **Pronto quando:** busca filtrada responde rápido mesmo com muitos editais.
  - **Dependência:** T-20.

---

## Épico 4 — Interface de busca
*A tela onde o empreiteiro acha a obra.*

- [x] **T-25 — Configurar frontend base (Vite + React + TS)** 🟡
  - Esqueleto do frontend com roteamento e conexão à API. Biblioteca de componentes pronta (confirmar comigo antes de escolher).
  - **Feito (2026-06-19):** `apps/web` com **Vite + React 18 + TS + Mantine v8** (escolha confirmada; **v8** porque a v9 exige React 19 e o stack fixa React 18). Roteamento via `react-router-dom`; cliente HTTP fino (`src/lib/api.ts`) sobre **`fetch` nativo** (sem dep extra — `@tanstack/react-query` fica pra quando a busca precisar de cache, T-26/T-27). `HomePage` provisória bate em `GET /health` e mostra o status do backend (smoke test). ESLint flat config + PostCSS do Mantine; `.env.example` com `VITE_API_URL`. **No backend:** habilitado **CORS** no `main.ts` (origin por `WEB_ORIGIN`, default `http://localhost:5173`) — sem isso o browser bloqueia. Verificado ao vivo: Vite serve a página, API responde `/health` com banco `up`, e o preflight CORS libera a origem do Vite. Lint limpo nos dois pacotes; 66 testes da API passam.
  - **Pronto quando:** o frontend sobe e conversa com o backend. ✅
  - **Dependência:** T-04.

- [ ] **T-26 — Tela de busca: layout e lista de editais** 🔴
  - Lista de editais com dados essenciais (órgão, objeto, município, valor, prazo). Card ou tabela, com paginação. Clareza > beleza.
  - **Pronto quando:** a tela mostra editais reais vindos da API.
  - **Dependência:** T-25, T-20.

- [ ] **T-27 — Painel de filtros (UF, município, tipo, valor)** 🔴
  - Controles de filtro conectados à busca: estado, município, tipo de obra, faixa de valor. Atualiza a lista ao aplicar.
  - **Pronto quando:** mudar um filtro atualiza a lista corretamente.
  - **Dependência:** T-26, T-21.

- [ ] **T-28 — Campo de busca textual** 🟢
  - Barra de busca por palavra no objeto, conectada ao T-22, com debounce.
  - **Pronto quando:** digitar uma palavra filtra a lista.
  - **Dependência:** T-26, T-22.

- [ ] **T-29 — Tela de detalhe do edital** 🟡
  - Ao clicar num edital, ver todos os dados e o botão que leva ao documento original na fonte.
  - **Pronto quando:** clicar num edital abre o detalhe completo com link para a fonte.
  - **Dependência:** T-26, T-23.

- [ ] **T-30 — Estados de vazio, carregando e erro** 🟢
  - Tratamento visual para: sem resultado, carregando, e falha da API.
  - **Pronto quando:** os três estados têm tratamento visual claro.
  - **Dependência:** T-26.

- [ ] **T-31 — Salvar/favoritar edital (preparar p/ alertas)** 🟡
  - Usuário marca editais de interesse. Prepara o terreno para alertas e diagnóstico de prontidão (fases futuras).
  - **Pronto quando:** o usuário consegue favoritar e ver seus editais salvos.
  - **Dependência:** T-26.
  - *Obs.: implementar só o favoritar/listar. NÃO construir alertas nem diagnóstico nesta fase.*

- [ ] **T-32 — Responsividade (funciona no celular)** 🟡
  - Busca e filtros funcionando bem em tela pequena. PWA básico resolve sem app nativo.
  - **Pronto quando:** dá para buscar editais confortavelmente no celular.
  - **Dependência:** T-26, T-27.

- [ ] **T-33 — Teste de ponta a ponta com dados reais** 🟡
  - Validar o fluxo completo: job capta → banco enche → busca filtra → tela mostra → detalhe abre a fonte. Com editais reais do PNCP, na região de teste.
  - **Pronto quando:** alguém consegue achar uma obra real da região filtrando na tela.
  - **Dependência:** T-18, T-27, T-29.

---

## Marco de conclusão

Ao concluir a **T-33**, a funcionalidade-núcleo está pronta: **camada 1 coberta via PNCP** (fonte primária e praticamente completa; ver `spikes/RESULTADOS.md`), e um empreiteiro consegue entrar, filtrar por região e tipo de obra, e achar licitações reais. A camada 2 (Portal de Compras Públicas) entra logo depois, reaproveitando o padrão de conector. É a base sobre a qual o diagnóstico de prontidão e os alertas serão construídos nas próximas fases.

### Próximo passo após este backlog (fora de escopo agora)
- **Camada 2 priorizada (decisão pós-T-03): Portal de Compras Públicas.** Antes de virar conector, fazer um **spike próprio** (validar API/webservice, cobertura municipal, formato) — análogo a T-01/T-03. Aproveita o padrão de conector (T-11).
- **Compras.gov.br (T-16):** fonte opcional/futura — só se houver foco em obra federal.
- Adicionar o **portal estadual** da região onde estiverem os usuários.
- Só então: alertas, diagnóstico de prontidão, etc.

---

## Ordem de dependências (resumo visual)

```
Épico 0 (fundação)
  T-01 → T-02, T-03          (spikes de validação)
  T-04 → T-05 → T-06         (repo → backend → deploy)

Épico 1 (dados) — depois de T-05
  T-07, T-08, T-09, T-10

Épico 2 (captação) — o coração  [fonte única: PNCP]
  T-11 → T-12 → T-13, T-14, T-15
  T-10 → T-17                (normalização; "entre fontes" quando entrar a 2ª fonte)
  T-12 → T-18 → T-19
  T-16 (Compras.gov.br) DESPRIORIZADA — camada 2 = Portal de Compras Públicas (spike futuro)

Épico 3 (busca/API) — depois de T-17
  T-20 → T-21, T-22, T-24
  T-23

Épico 4 (interface) — depois da API
  T-25 → T-26 → T-27, T-28, T-29, T-30, T-31, T-32
  T-18 + T-27 + T-29 → T-33  (teste e2e)
```
