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

- [x] **T-22 — Busca textual no objeto** 🟡
  - Busca por palavra no objeto do edital (ex.: "pavimentação", "escola"). Indexar o campo para ser rápido.
  - **Infra já feita na T-07:** coluna `objetoBusca` (tsvector PT) + índice GIN. Resta **expor no endpoint de busca** (usar `@@ plainto_tsquery('portuguese', ...)`).
  - **Feito (2026-06-18):** param `q` no `SearchEditaisDto` (trim, máx. 200). Sem reescrever pra QueryBuilder: `buildEditalWhere` adiciona `objetoBusca = Raw(OBJETO_BUSCA_SQL, { q })` → `objeto_busca @@ plainto_tsquery('portuguese', :q)` (param nomeado, sem injeção). Aplica-se aos dois ramos do `OR` da faixa de valor. **Sem migration** (coluna + GIN são da T-07). Ordenação segue por data (ranking por `ts_rank` fica como melhoria futura). +4 testes. **Verificado ao vivo** (720 editais reais): `pavimentação`→224, `escola`→41, inexistente→0, `pavimentação`+valorMax→67; `EXPLAIN` confirma `Bitmap Index Scan` no GIN quando o planejador o escolhe (em 720 linhas ele prefere seq scan).
  - **Pronto quando:** buscar uma palavra retorna os editais que a contêm, rápido. ✅
  - **Dependência:** T-20.

- [x] **T-23 — Endpoint de detalhe do edital** 🟢
  - Retornar todos os dados de um edital específico, incluindo o link para o documento original na fonte.
  - **Feito (2026-06-18):** `GET /editais/:id` (protegido por JWT) → `EditaisSearchService.findById`. `ParseUUIDPipe` (id inválido → 400); `NotFoundException` ("Edital não encontrado") → 404. Resposta `EditalDetail` (estende `EditalListItem` + `modalidadeId`, `createdAt`, `updatedAt`); reusa `toEditalListItem` e exclui `rawPayload`/`objetoBusca`. Sem filtro `isObra` (acesso direto por id). `linkOrigem` leva ao documento na fonte. +2 testes (detalhe completo sem vazar internos; 404). Sem migration.
  - **Pronto quando:** `GET /editais/:id` traz o edital completo. ✅
  - **Dependência:** T-07.

- [x] **T-24 — Performance: índices no banco** 🟢
  - Índices nos campos mais filtrados (UF, município, valor, data, fonte).
  - **Já criados na T-07:** composto `(uf, isObra, dataPublicacao)`, `codigoIbge`, `valorEstimado`, `dataPublicacao`, `UNIQUE(fonte, idExterno)`, GIN do full-text. Resta só **revisar/ajustar** após o endpoint real (T-20) — ex.: paginação por cursor em vez de OFFSET.
  - **Feito (2026-06-22):** revisão documentada **sem migration** — o schema da T-07 já cobre todos os padrões do endpoint real (T-20–T-23). `EXPLAIN ANALYZE` na base real (720 editais) confirmou: filtro seletivo de **município** usa `IDX_editais_codigo_ibge` (Bitmap Index Scan); todas as queries respondem em <7ms. O composto `(uf, isObra, dataPublicacao)` ainda não aparece nos planos **só porque o dado de dev é 100% SC** (filtrar por UF não seleciona nada) — ele está desenhado certo e vira o ganho quando a base tiver as 27 UFs. Os dois índices de data **não são redundantes**: o composto serve UF-seletivo; o `dataPublicacao` sozinho serve a ordenação sem UF. **Decisão:** manter **paginação por OFFSET** nesta fase (captação orientada à demanda → base por UF pequena; usuário refina filtro, não pagina fundo; cursor seria mudança de contrato da API e respingo no front). Caminho de cursor sobre `(dataPublicacao, id)` documentado como melhoria futura no `editais-search.service.ts`. **Fecha o Épico 3.**
  - **Pronto quando:** busca filtrada responde rápido mesmo com muitos editais. ✅
  - **Dependência:** T-20.

---

## Épico 4 — Interface de busca
*A tela onde o empreiteiro acha a obra.*

- [x] **T-25 — Configurar frontend base (Vite + React + TS)** 🟡
  - Esqueleto do frontend com roteamento e conexão à API. Biblioteca de componentes pronta (confirmar comigo antes de escolher).
  - **Feito (2026-06-19):** `apps/web` com **Vite + React 18 + TS + Mantine v8** (escolha confirmada; **v8** porque a v9 exige React 19 e o stack fixa React 18). Roteamento via `react-router-dom`; cliente HTTP fino (`src/lib/api.ts`) sobre **`fetch` nativo** (sem dep extra — `@tanstack/react-query` fica pra quando a busca precisar de cache, T-26/T-27). `HomePage` provisória bate em `GET /health` e mostra o status do backend (smoke test). ESLint flat config + PostCSS do Mantine; `.env.example` com `VITE_API_URL`. **No backend:** habilitado **CORS** no `main.ts` (origin por `WEB_ORIGIN`, default `http://localhost:5173`) — sem isso o browser bloqueia. Verificado ao vivo: Vite serve a página, API responde `/health` com banco `up`, e o preflight CORS libera a origem do Vite. Lint limpo nos dois pacotes; 66 testes da API passam.
  - **Pronto quando:** o frontend sobe e conversa com o backend. ✅
  - **Dependência:** T-04.

- [x] **T-26 — Tela de busca: layout e lista de editais** 🔴
  - Lista de editais com dados essenciais (órgão, objeto, município, valor, prazo). Card ou tabela, com paginação. Clareza > beleza.
  - **Feito (2026-06-22):** `EditaisListPage` em cards (`EditalCard`), paginação (`Pagination` do Mantine), toolbar de contagem e ordenação "mais recentes primeiro". Layout em `AppShell` (`layout="alt"`, navbar 236px + header 60px) com sidebar de navegação para todas as telas. Tema do Mantine mapeado 1:1 nos design tokens (Open Color = paleta default; accent `orange.8`). Cliente HTTP (`src/lib/api.ts`) ganhou auth Bearer + refresh-on-401; **tela de login** (`/login`) sobre o `/auth/login` existente (a busca é protegida por JWT). **Implementado junto: T-27, T-28, T-29 e T-30** (abaixo). Build (`tsc`+`vite`) e lint limpos.
  - **Pronto quando:** a tela mostra editais reais vindos da API. ✅
  - **Dependência:** T-25, T-20.

- [x] **T-27 — Painel de filtros (UF, município, tipo, valor)** 🔴
  - Controles de filtro conectados à busca: estado, município, tipo de obra, faixa de valor. Atualiza a lista ao aplicar.
  - **Feito (2026-06-22):** painel lateral com **UF** (`Select`, 27 UFs), **Município** (`Select` dependente da UF → resolve p/ `codigoIbge`; subconjunto empacotado em `src/data/cidades.ts` como stopgap até um endpoint geo), **faixa de valor** (dois `NumberInput` + preset "Até R$ 80 mil (ME/EPP)" usando `ME_EPP_VALOR_LIMITE`) e **período** (datas). Estado **pending** vs **applied**: só "Aplicar" dispara a busca; filtros aplicados ficam na **URL** (`useSearchParams`, compartilhável) com **chips removíveis**; "Limpar" zera tudo. (Sem filtro de "tipo de obra" — a API já só devolve obra; ver T-15.)
  - **Pronto quando:** mudar um filtro atualiza a lista corretamente. ✅
  - **Dependência:** T-26, T-21.

- [x] **T-28 — Campo de busca textual** 🟢
  - Barra de busca por palavra no objeto, conectada ao T-22, com debounce.
  - **Feito (2026-06-22):** campo `q` no topo da lista com **debounce 400ms** (`useDebouncedValue`), ligado ao param `q` da busca; reseta para a página 1 ao mudar. Inicializa a partir de `?q=` na URL (atalho da home).
  - **Pronto quando:** digitar uma palavra filtra a lista. ✅
  - **Dependência:** T-26, T-22.

- [x] **T-29 — Tela de detalhe do edital** 🟡
  - Ao clicar num edital, ver todos os dados e o botão que leva ao documento original na fonte.
  - **Feito (2026-06-22):** `EditalDetailPage` (`GET /editais/:id` via `useEdital`): cabeçalho, stat cards (valor/publicação/prazo), tabela de definições e ações — **"Abrir documento na fonte"** abre `linkOrigem` em nova aba. Estados loading/erro (incl. 404). As seções **"Resumo com IA"** e **"Prontidão da empresa"** são **placeholders** (derivados no cliente / mock) — feature futura, ver `edital-insights.ts` e nota no CLAUDE.md §9.
  - **Pronto quando:** clicar num edital abre o detalhe completo com link para a fonte. ✅
  - **Dependência:** T-26, T-23.

- [x] **T-30 — Estados de vazio, carregando e erro** 🟢
  - Tratamento visual para: sem resultado, carregando, e falha da API.
  - **Feito (2026-06-22):** componentes reusáveis em `src/components/StateViews.tsx` — `LoadingCards` (Skeleton), `EmptyState` (lupa + "Limpar filtros") e `ErrorState` (+ "Tentar de novo"). Usados na lista e no detalhe. Fetch com `AbortController` (cancela requisição anterior ao trocar filtro/página).
  - **Pronto quando:** os três estados têm tratamento visual claro. ✅
  - **Dependência:** T-26.

- [x] **T-31 — Salvar/favoritar edital (preparar p/ alertas)** 🟡
  - Usuário marca editais de interesse. Prepara o terreno para alertas e diagnóstico de prontidão (fases futuras).
  - **Feito (2026-06-23):** recurso `favoritos` (join user × edital) via migration `CreateFavoritos` (UNIQUE `(user_id, edital_id)`, 2 FKs `ON DELETE CASCADE`). `FavoritosService` (add idempotente com `ON CONFLICT DO NOTHING` + 404 se o edital não existe; remove; list reusando `toEditalListItem`) + `FavoritosController` (JWT): `POST /favoritos` 204, `DELETE /favoritos/:editalId` 204, `GET /favoritos`. No front: `FavoritesProvider` (estado otimista), `FavoriteButton` (estrela nos cards e no detalhe — o "Acompanhar edital" virou o toggle real), nova aba **"Salvos"** no menu + `SalvosPage`. 5 testes do service; **e2e curl** validou add/idempotência (sem duplicar no banco)/list/delete/404/400/401.
  - **Pronto quando:** o usuário consegue favoritar e ver seus editais salvos. ✅
  - **Dependência:** T-26.
  - *Obs.: implementado só o favoritar/listar. NÃO foram construídos alertas nem diagnóstico (CLAUDE.md §9).*

- [x] **T-32 — Responsividade (funciona no celular)** 🟡
  - Busca e filtros funcionando bem em tela pequena. PWA básico resolve sem app nativo.
  - **Feito (2026-06-23):** navbar colapsa no mobile (burger, desde a T-26) e os grids usam `SimpleGrid` responsivo. **Painel de filtros** vira **`Drawer`** no mobile (botão "Filtros" com contador na toolbar) e segue como sidebar no desktop (`visibleFrom="md"`), com o formulário extraído e reutilizado nos dois. **`EditalCard`** empilha valor/prazo abaixo do objeto no mobile (`Flex` com `direction` responsivo) — sem overflow horizontal. Padding das telas (busca/detalhe/início) responsivo (`px={{ base:'md', sm:... }}`). **PWA básico:** `manifest.webmanifest` + `icon.svg` + `theme-color`/apple-meta no `index.html` (instalável / "adicionar à tela inicial"), **sem dependência nova**.
  - ⚠️ **PWA offline/instalação completa** (service worker) ficou de fora — exigiria `vite-plugin-pwa` (dep nova, pedir antes). As telas pré-criadas (orçamentos, documentos, etc.) usam padding fixo, mas são usáveis no mobile.
  - **Pronto quando:** dá para buscar editais confortavelmente no celular. ✅
  - **Dependência:** T-26, T-27.

- [x] **T-33 — Teste de ponta a ponta com dados reais** 🟡
  - Validar o fluxo completo: job capta → banco enche → busca filtra → tela mostra → detalhe abre a fonte. Com editais reais do PNCP, na região de teste.
  - **Feito (2026-06-23):** validado ponta a ponta com **editais reais do PNCP** (stack local: Postgres + API compilada). Evidências: busca **sem token → 401** (protegida); cadastro SC → token; `GET /editais?uf=SC` → **711 obras reais**; `q=pavimentação` → 267; `valorMax=80000` → 49; detalhe (`GET /editais/:id`) com **`linkOrigem` real** (Comprasnet) — o botão "abrir na fonte". **T-34 ao vivo:** `uf=RJ` (sem dados) → `total=0, capturing=true` + `sync_states` RJ criado → backfill em background gravou **8 obras reais de RJ** (`sync_runs` success) → 2ª busca `total=8, capturing=false`. O front é build/lint verdes e consome exatamente esses endpoints (a T-25 já provou o front conversando com a API ao vivo); recomendado um clique-a-clique final no navegador como sign-off humano.
  - **Pronto quando:** alguém consegue achar uma obra real da região filtrando na tela. ✅
  - **Dependência:** T-18, T-27, T-29.

- [x] **T-34 — Captação sob demanda por busca** 🟡 *(adicionada fora do escopo original)*
  - Evolução do T-18: o sinal de demanda deixa de ser só "existe usuário na UF" e passa a incluir **"alguém buscou a UF"**. Buscar uma UF ainda não captada (ou com dado velho) dispara a captação dela — assim um usuário de SC consegue ver, ex., RJ sem haver usuário lá.
  - **Feito (2026-06-23):** lógica de captura por UF extraída para `UfCaptureService` (`apps/api/src/editais/`), usada tanto pelo job (T-18) quanto pela busca. `EditaisSearchService.search`, quando há `uf`, chama `triggerUfIfStale(uf)` — que **roda a captação em background** (fire-and-forget), com **dedup por UF** e **stale-gate** (UF nova ou watermark > 24h, `CAPTACAO_ONDEMAND_STALE_HOURS`), **sem travar a busca** (lê só do banco). O envelope ganhou `capturing?: boolean`; o front (`EditaisListPage`) mostra um aviso e faz auto-reload uma vez. Testes: `uf-capture.service.spec` (backfill/incremental/erro/dedup/stale) + ajustes em `captacao-job`/`editais-search`.
  - ⚠️ **Trade-off:** toda UF buscada passa a ser captada → o banco cresce além das UFs de usuários. No **Postgres free** isso eventualmente bate no limite — encaminhar **task futura de retenção** (descartar editais encerrados/antigos).
  - **Pronto quando:** buscar uma UF sem usuário traz editais reais dela após a captação em background. ✅
  - **Dependência:** T-18, T-20, T-26.

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

---

## Épico 5 — Diagnóstico de Prontidão + Resumo com IA

> Dá vida ao maior diferencial do produto (prontidão) e ao resumo por IA.
> **Estratégia central:** construir em 4 camadas, da mais simples à mais inteligente. As camadas 1 e 2 **não usam IA** e já entregam o diferencial. A IA entra só na camada 3 — e alimenta prontidão E resumo ao mesmo tempo.
> Tira do mock as telas: documentos, prontidão, e resumo com IA.

**Regra de ouro (IA):** uma task por vez, commit por task. **Validar a parte de IA contra editais reais ANTES de mostrar ao usuário.**

### Camada 1 — Perfil do empreiteiro (a fundação, sem IA)
*O sistema precisa saber o que o empreiteiro TEM antes de comparar com qualquer edital. Dá vida à tela de documentos hoje mockada.*

- [ ] **T-40 — Modelar o perfil de habilitação da empresa** 🟡
  - Entidade(s) para guardar o que o empreiteiro possui: certidões (tipo, número, validade), registro CREA/CAU, capital social, porte (ME/EPP), atestados de capacidade técnica (tipo de obra, quantitativo/tamanho).
  - **Pronto quando:** dá para persistir o perfil de habilitação de um usuário via migration + entidade.
  - **Dependência:** já existe `User` (Épico A).

- [ ] **T-41 — API do perfil de habilitação (CRUD)** 🟡
  - Endpoints para o empreiteiro cadastrar/editar/listar suas certidões, atestados e dados de habilitação. Protegido por auth.
  - **Pronto quando:** `GET/POST/PUT/DELETE` do perfil funcionando, validado.
  - **Dependência:** T-40.

- [ ] **T-42 — Tela de perfil/cofre de documentos (dar vida ao mock)** 🟡
  - Conectar a tela de documentos (hoje casca visual) à API real. Empreiteiro cadastra e vê seus documentos e atestados.
  - **Pronto quando:** a tela de documentos deixa de ser mock e persiste dados reais.
  - **Dependência:** T-41.

- [ ] **T-43 — Alerta de vencimento de certidões** 🟢
  - Avisar quando uma certidão está perto de vencer (ex.: 30/15/5 dias). Já entrega valor sozinho, mesmo sem diagnóstico.
  - **Pronto quando:** o sistema sinaliza certidões a vencer no perfil do usuário.
  - **Dependência:** T-40.
  - *Valor entregue: esta camada sozinha já justifica o cofre de documentos.*

### Camada 2 — Checklist genérico de prontidão (o diferencial, ainda sem IA)
*A versão mais simples do diagnóstico: checklist genérico de habilitação de obra × perfil do empreiteiro. Já é mais do que qualquer concorrente faz.*

- [ ] **T-44 — Catálogo de requisitos comuns de habilitação de obra** 🟡
  - Lista centralizada e configurável dos documentos/requisitos que quase toda licitação de obra pública exige (certidões padrão, CREA, capacidade técnica genérica). Mesmo espírito do catálogo de obra (T-09).
  - **Pronto quando:** existe uma lista clara e ajustável dos requisitos comuns.

- [ ] **T-45 — Motor de cruzamento perfil × requisitos** 🟡
  - Lógica que compara o que o empreiteiro tem (T-40) com os requisitos comuns (T-44) e gera: tem / falta, por item.
  - **Pronto quando:** dado um perfil, o sistema retorna "tem X de Y itens, faltam: ...".
  - **Dependência:** T-40, T-44.

- [ ] **T-46 — Tela de prontidão genérica (dar vida ao mock)** 🟡
  - Conectar a tela/seção de prontidão (hoje placeholder) ao motor T-45. Mostrar semáforo e lista do que falta. Versão genérica (não específica por edital ainda).
  - **Pronto quando:** a tela de prontidão mostra o diagnóstico genérico real do usuário.
  - **Dependência:** T-45.
  - *Valor entregue: mesmo genérico, já é o diferencial que ninguém faz. 80% do valor com 20% do esforço.*

### Camada 3 — Extração com IA (a parte difícil — alimenta prontidão E resumo)
*A IA lê o PDF do edital específico. É o salto de inteligência e a parte que exige mais cuidado. Um motor, dois diferenciais.*

- [ ] **T-47 — Spike: baixar e extrair texto do PDF do edital** 🟡
  - **Validar primeiro (estilo Épico 0).** Pegar o link do PDF (já vem do PNCP), baixar, extrair o texto. Ver se os editais reais são extraíveis (alguns podem ser imagem escaneada → exigem OCR).
  - **Pronto quando:** você sabe que % dos editais reais dá para extrair texto, e como.
  - **Dependência:** banco com editais reais (já tem).

- [ ] **T-48 — Spike: IA extrai exigências de habilitação de 5 editais reais** 🟡
  - **Validar a qualidade ANTES de construir.** Pegar 5 PDFs reais do banco, mandar pra IA (API Anthropic) extrair as exigências de habilitação de forma estruturada, e conferir à mão se acertou.
  - **Pronto quando:** você sabe a taxa de acerto real da IA em editais de verdade — e decide se está bom o suficiente ou precisa ajustar o prompt.
  - **Dependência:** T-47.
  - *Crítico: edital errado interpretado gera diagnóstico errado. Diagnóstico errado é pior que diagnóstico nenhum.*

- [ ] **T-49 — Serviço de extração de exigências com IA** 🔴
  - Com base no spike, construir o serviço: dado um edital, baixa o PDF, extrai texto, chama a IA, retorna as exigências estruturadas. Guardar o resultado (não reprocessar o mesmo edital toda vez — custa dinheiro de API).
  - **Pronto quando:** dado um edital, o sistema retorna as exigências de habilitação estruturadas, com cache.
  - **Dependência:** T-48.

- [ ] **T-50 — Resumo do edital com IA (dar vida ao mock)** 🟡
  - Reaproveitando o texto já extraído (T-49), gerar o resumo de 1 página: objeto, valor, prazo, documentos exigidos, datas-chave. Conectar à tela de resumo hoje mockada.
  - **Pronto quando:** a tela de "Resumo com IA" mostra o resumo real do edital.
  - **Dependência:** T-49.
  - *Um motor (extração), dois diferenciais: resumo sai junto com a prontidão.*

### Camada 4 — Diagnóstico específico por edital (o produto completo)
*Junta tudo: exigências reais do edital (camada 3) × perfil do empreiteiro (camada 1). O veredito específico daquela licitação.*

- [ ] **T-51 — Motor de diagnóstico específico (edital × perfil)** 🟡
  - Cruzar as exigências extraídas de UM edital (T-49) com o perfil do empreiteiro (T-40). Gerar veredito específico: apto / quase / não apto, com o que falta para AQUELA obra.
  - **Pronto quando:** dado um edital + um usuário, o sistema diz se ele está apto àquela licitação e o que falta.
  - **Dependência:** T-49, T-40.

- [ ] **T-52 — Diagnóstico específico na tela de detalhe do edital** 🟡
  - Mostrar o veredito específico na tela de detalhe: semáforo + lista do que falta para aquele edital. Substitui o placeholder de "Prontidão" no detalhe.
  - **Pronto quando:** ao abrir um edital, o empreiteiro vê se está apto àquela obra específica.
  - **Dependência:** T-51.

- [ ] **T-53 — Filtro "só editais que estou apto" na busca** 🟢
  - Na busca (Épico 3), permitir filtrar para mostrar só os editais em que o empreiteiro está apto (ou quase). O "produto dos sonhos": buscar obra e já ver onde tem chance.
  - **Pronto quando:** dá para filtrar a busca por aptidão do usuário.
  - **Dependência:** T-51.
  - *Cuidado de performance: diagnóstico por edital é caro (IA). Pensar em pré-computar para os editais da região do usuário, não calcular tudo on-the-fly.*

### Ordem e marco

```
Camada 1 (sem IA) — fundação + valor imediato
  T-40 → T-41 → T-42
  T-40 → T-43

Camada 2 (sem IA) — o diferencial genérico
  T-44 + T-40 → T-45 → T-46

Camada 3 (IA) — validar ANTES de construir
  T-47 → T-48 → T-49 → T-50 (resumo)

Camada 4 (junta tudo) — diagnóstico específico
  T-49 + T-40 → T-51 → T-52, T-53
```

**Marco do Épico 5:** o empreiteiro busca uma obra, abre o edital, e o sistema diz — lendo o edital de verdade — se ele está apto a participar e o que falta. Mais o resumo de 1 página por IA. É o diferencial que nenhum concorrente entrega, no ar.

**Princípio que guia o épico:** as camadas 1 e 2 entregam valor sem IA e sem risco — construa e valide primeiro. A IA (camadas 3-4) é onde mora a dificuldade; ataque depois, validando com editais reais antes de mostrar ao usuário. Assim nunca fica tudo travado esperando a parte difícil, e o diagnóstico errado (pior que nenhum) é evitado.

### Notas de custo e cuidado (IA)

- **Cache é obrigatório:** extrair exigências e gerar resumo custam chamada de API por edital. Guardar o resultado e nunca reprocessar o mesmo edital. Isso vira regra desde a T-49.
- **Validar acerto antes de confiar:** o spike T-48 existe para isso. Não mostrar diagnóstico ao usuário sem saber a taxa de erro.
- **PDF escaneado:** alguns editais podem ser imagem (sem texto extraível). O spike T-47 revela quantos — se for muito, considerar OCR como tarefa futura, não bloquear o épico por causa deles.
- **Pré-computar, não on-the-fly:** o filtro de aptidão (T-53) sobre muitos editais não pode disparar uma chamada de IA por edital na hora da busca. Pensar em processar os editais da região do usuário em background.
