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
  - ⚠️ **Caveat do Render free:** o web service hiberna após ~15 min, então o `@Cron` **não dispara de forma confiável** ali. Para agendamento real: manter o serviço acordado (pinger externo), plano pago, ou um cron externo chamando um endpoint. `runOnce()` permite disparo manual. **Ao resolver isto em prod, resolve também a T-54** (a pré-computação por IA roda pendurada neste mesmo job — sem disparo confiável, ela não roda).
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

- [x] **T-40 — Modelar o perfil de habilitação da empresa** 🟡
  - Entidade(s) para guardar o que o empreiteiro possui: certidões (tipo, número, validade), registro CREA/CAU, capital social, porte (ME/EPP), atestados de capacidade técnica (tipo de obra, quantitativo/tamanho).
  - **Feito (2026-06-23):** módulo `company-profile/` com 3 entidades + migration `CreateCompanyProfile`. **`CompanyProfile`** (tabela `company_profiles`, **1:1** com `users` via `UNIQUE(user_id)`): razão social, `capitalSocial` (numeric 15,2 + `decimalTransformer`), registro profissional CREA/CAU (tipo+número+UF). **`Certidao`** (N por user): `tipo` **enum estruturado** (`CND_FEDERAL`/`FGTS`/`TRABALHISTA`/`ESTADUAL`/`MUNICIPAL`/`FALENCIA`/`REGISTRO_CONSELHO`/`OUTRA` — para o cruzamento da T-44/T-45), número, órgão, emissão e **`dataValidade`** (índice `(user, validade)` p/ o alerta da T-43). Cobertura conferida contra a Lei 14.133/2021: habilitação fiscal/social/trabalhista (art. 68 — `CND_FEDERAL` já inclui a previdenciária/INSS), econômico-financeira (art. 69 — `FALENCIA`) e técnica (art. 67 — `REGISTRO_CONSELHO`, certidão de registro e quitação CREA/CAU). **`Atestado`** (N por user): descrição, quantitativo+unidade, valor, contratante, ano. As 3 referenciam `users(id)` **ON DELETE CASCADE**. **Decisões:** porte **não** duplicado (segue em `User.porte`); certidões/atestados penduram em `user_id` direto (sem exigir profile antes). **Sem service/controller/DTO** (é T-41). Verificado: `migration:run`/`revert`/`run` (up/down ok), insert/select real com FK + UNIQUE 1:1 rejeitando 2º profile (em transação com rollback), app sobe (`CompanyProfileModule` resolve na DI), lint + build limpos, 88 testes passando.
  - **Pronto quando:** dá para persistir o perfil de habilitação de um usuário via migration + entidade. ✅
  - **Dependência:** já existe `User` (Épico A).

- [x] **T-41 — API do perfil de habilitação (CRUD)** 🟡
  - Endpoints para o empreiteiro cadastrar/editar/listar suas certidões, atestados e dados de habilitação. Protegido por auth.
  - **Feito (2026-06-23):** `CompanyProfileController` + `CompanyProfileService` (JWT). **8 endpoints** sob `company-profile`: `GET /` (snapshot agregado `{profile, certidoes[], atestados[]}` — uma chamada p/ a tela da T-42; `profile:null` até o 1º PUT), `PUT /` (upsert dos escalares, merge), `POST|PUT|DELETE /certidoes(/:id)` e `POST|PUT|DELETE /atestados(/:id)`. DTOs com class-validator (`Upsert/Create/Update` × profile/certidão/atestado); `PUT` faz merge só dos campos enviados (`applyDefined`). **Segurança:** tudo escopado ao `user_id` do JWT (nunca do body); operações por `:id` de não-dono → **404** (não vaza existência); `OUTRA` exige `descricao` → 400. Update DTOs escritos à mão (sem dep de `PartialType`). 14 testes do service (ownership/404, upsert create×update, validação OUTRA). **e2e curl:** 401 sem token, CRUD completo, `forbidNonWhitelisted` barra `userId` no body (400), id inválido → 400, e **isolamento cross-user** (B não lê/edita/apaga dados de A → 404). Sem migration (schema é da T-40).
  - **Pronto quando:** `GET/POST/PUT/DELETE` do perfil funcionando, validado. ✅
  - **Dependência:** T-40.

- [x] **T-41b — Storage do arquivo (PDF) das certidões em `bytea`** 🟡 *(adicionada — pedido do dono do produto: o cofre precisa guardar o arquivo, não só os metadados)*
  - O cofre guarda o arquivo de cada certidão (PDF/JPG/PNG) no Postgres (`bytea`), decisão de storage do dono (alternativas object storage/disco descartadas: disco do Render é efêmero). Por enquanto só **certidões** (atestados ficam sem arquivo).
  - **Feito (2026-06-23):** tabela **separada** `certidao_arquivos` (1:1 com `certidoes`, `UNIQUE(certidao_id)`, FK CASCADE) via migration `CreateCertidaoArquivo` — separada de propósito p/ o `conteudo` (bytea) **nunca** ser carregado nas listagens. 3 endpoints no `CompanyProfileController`: `POST/GET/DELETE /company-profile/certidoes/:id/arquivo` (`FileInterceptor` em memória + `StreamableFile` no download). Valida **mime** (PDF/JPG/PNG) e **tamanho ≤10 MB** (limite também no interceptor). O snapshot (`GET /company-profile`) passou a trazer `arquivo: {nomeArquivo, mimeType, tamanhoBytes} | null` por certidão (query leve, sem os bytes). **Sem dependência nova** (`multer` já vem com `@nestjs/platform-express`; tipo do upload escrito à mão p/ dispensar `@types/multer`). +10 testes do service (ownership 404, mime/tamanho 400, re-upload substitui, snapshot sem bytes) — 24 no spec, **112 na suíte**. **e2e (PDF real):** upload→download **byte-idêntico** (sha confere), 401 sem token, mime inválido 400, e **isolamento cross-user** (B não baixa/sobe arquivo de A → 404), delete→snapshot `null`.
  - **Pronto quando:** dá para anexar, baixar e remover o PDF de uma certidão, escopado ao dono. ✅
  - **Dependência:** T-41.
  - ⚠️ **Nota de retenção:** PDFs em `bytea` aceleram o crescimento do banco (Postgres free) — reforça a task futura de retenção (ver T-34). Migrar p/ object storage continua como caminho futuro.

- [x] **T-42 — Tela de perfil/cofre de documentos (dar vida ao mock)** 🟡
  - Conectar a tela de documentos (hoje casca visual) à API real. Empreiteiro cadastra e vê seus documentos e atestados.
  - **Feito (2026-06-23):** `DocumentosPage` reescrita sobre dados reais (`useCompanyProfile` → `GET /company-profile`). **Certidões:** lista com status de validade **derivado** (válida / vence em ≤30d / vencida / sem validade), CRUD via `CertidaoFormModal`, e **anexar/baixar/remover PDF** por certidão (T-41b) com `FileButton` + download autenticado (blob). **Atestados:** seção nova com CRUD via `AtestadoFormModal`. **Resumo real** no topo (contagem por status — não diagnóstico). Estados loading/erro reusando `StateViews`; refetch em background no reload (sem piscar). O cliente HTTP (`lib/api.ts`) ganhou suporte a `FormData` (upload) e `responseType:'blob'` (download). **Decisões:** o anel "% prontidão" virou resumo de contagem; **sem upload de PDF? não** — guarda o arquivo (T-41b); escalares do perfil (razão/capital/CREA) ficam na `PerfilPage` (futura); o **checklist por edital** virou placeholder rotulado "Em breve" (camada 2, T-45/T-46). **Sem dependência nova** (Modal/Select/NumberInput/FileButton do core; data nativa). Verificado: `tsc` + `vite build` + `eslint` limpos; API e Vite sobem e servem; backend e2e da T-41/T-41b cobre o fluxo de dados. **Sign-off humano recomendado:** clique-a-clique no navegador (padrão T-25/T-33).
  - **Pronto quando:** a tela de documentos deixa de ser mock e persiste dados reais. ✅
  - **Dependência:** T-41.

- [x] **T-43 — Alerta de vencimento de certidões** 🟢
  - Avisar quando uma certidão está perto de vencer (ex.: 30/15/5 dias). Já entrega valor sozinho, mesmo sem diagnóstico.
  - **Feito (2026-06-23):** função pura `certidaoAlertas(certidoes)` em `lib/certidao.ts` (agrega vencidas + vencendo, dias mais urgente, **severidade graduada 30/15/5** → crítico/alerta/aviso) e componente reutilizável `CertidaoAlert` (`Alert` do Mantine; some quando não há nada; link "Revisar no cofre"). Surge no topo do **cofre** (`DocumentosPage`, sem link) e da **Início** (`HomePage`, com link). Na Home, como já busco o perfil (`useCompanyProfile`) pro alerta, o stat card "Documentos válidos" virou **"Certidões válidas"** com **dado real** (contagem do cofre) — pra não contradizer o alerta; o card "Prontidão do perfil" segue mock (T-46). **Frontend-only**, sem backend/dep nova (reusa `GET /company-profile`; regra client-side em `VENCENDO_DIAS`/`ALERTA_DIAS_*`). Verificado: `tsc`+`vite build`+`eslint` limpos e **check dos limiares** (vencido/vencendo nas janelas 5/15/30 e gradação crítico/alerta/aviso, todos OK). **Sign-off humano:** clique-a-clique no navegador. **Sem notificação externa** (e-mail/push) — fora de escopo.
  - **Pronto quando:** o sistema sinaliza certidões a vencer no perfil do usuário. ✅
  - **Dependência:** T-40.
  - *Valor entregue: esta camada sozinha já justifica o cofre de documentos.*

### Camada 2 — Checklist genérico de prontidão (o diferencial, ainda sem IA)
*A versão mais simples do diagnóstico: checklist genérico de habilitação de obra × perfil do empreiteiro. Já é mais do que qualquer concorrente faz.*

- [x] **T-44 — Catálogo de requisitos comuns de habilitação de obra** 🟡
  - Lista centralizada e configurável dos documentos/requisitos que quase toda licitação de obra pública exige (certidões padrão, CREA, capacidade técnica genérica). Mesmo espírito do catálogo de obra (T-09).
  - **Feito (2026-06-23):** `src/company-profile/habilitacao/requisitos-catalog.ts` — config em código (como o T-09, sem DB), ajustável editando a lista. `REQUISITOS_HABILITACAO_OBRA` com 9 requisitos conferidos contra a Lei 14.133/2021: 6 fiscais/trabalhista/falência (mapeados a `CertidaoTipo` + `exigeValidade`), `registro_conselho`, `capacidade_tecnica` (≥1 atestado) e `capital_social` (>0). Cada requisito carrega `key`/`label`/`descricao`/`categoria`/`baseLegal` + um `check` (união discriminada) que a **T-45 mapeia para a verificação no perfil** — T-44 não avalia, só lista. **Fora de propósito:** habilitação jurídica (contrato social/CNPJ) e balanço/índices — não há campo no perfil pra checá-los (entrariam sempre como "faltando"). Sem migration/endpoint/módulo. 6 testes de integridade (keys únicas, checks de certidão apontam pra `CertidaoTipo` válido ≠ OUTRA, cobertura das certidões comuns) — **118 na suíte**.
  - **Pronto quando:** existe uma lista clara e ajustável dos requisitos comuns. ✅

- [x] **T-45 — Motor de cruzamento perfil × requisitos** 🟡
  - Lógica que compara o que o empreiteiro tem (T-40) com os requisitos comuns (T-44) e gera: tem / falta, por item.
  - **Feito (2026-06-23):** motor **puro** `avaliarProntidao(input, now?)` em `habilitacao/prontidao.ts` — cruza o perfil (certidões/atestados/capital/registro) com o catálogo (T-44) e devolve, por item, um **semáforo de 3 estados** (`atendido`/`atencao`/`nao_atendido`) + `motivo`, mais o agregado (`atendidos`/`atencao`/`naoAtendidos`/`total`/`percentual`). Regras: certidão 🟢 válida · 🟡 vence em ≤30d ou sem data · 🔴 vencida ("renove") ou ausente; registro CREA/CAU, ≥1 atestado e capital>0 como 🟢/🔴. Backend é o dono do diagnóstico (calcula a validade; `now` injetável p/ determinismo). `CompanyProfileService.getProntidaoGenerica` carrega só o necessário (conta atestados) e **`GET /company-profile/prontidao`** (JWT) expõe o resultado — assim a **T-46 só monta a tela**. 11 testes do motor (cada check, válida/vencendo/vencida/sem-validade/ausente, "melhor de várias", agregado) + 2 de wiring do service — **131 na suíte**. **e2e ao vivo:** perfil vazio → 0/9; perfil parcial → 4/9 (44%) com FGTS "vence em 12 dias" e CNDT "vencida — renove"; 401 sem token.
  - **Pronto quando:** dado um perfil, o sistema retorna "tem X de Y itens, faltam: ...". ✅
  - **Dependência:** T-40, T-44.

- [x] **T-46 — Tela de prontidão genérica (dar vida ao mock)** 🟡
  - Conectar a tela/seção de prontidão (hoje placeholder) ao motor T-45. Mostrar semáforo e lista do que falta. Versão genérica (não específica por edital ainda).
  - **Feito (2026-06-23):** `ProntidaoPanel` (anel `RingProgress` com seções verde/amarelo/vermelho + "% / atende X de Y" + lista do semáforo com `motivo`, faltantes primeiro) consome `GET /company-profile/prontidao` (T-45) via `useProntidao`. Aparece como **seção no topo da página Documentos** (a nav já agrupa habilitação em "Documentos e habilitação") — **substituiu** o card de contagem de certidões da T-42 (redundante com o alerta + badges). Editar o cofre recarrega cofre **e** prontidão (`reloadAll`). Na **Home**, o stat card "Prontidão do perfil" virou **real** (% do endpoint), removendo o último mock de documentos da Home (`prontidaoHabilitacao`/`MOCK_DOCUMENTOS`). **Não** mexi no "Prontidão da empresa" do detalhe do edital — esse é o diagnóstico **específico** (T-52). O client **não recalcula** o diagnóstico (backend é o dono). Sem dep nova; `tsc`+`vite build`+`eslint` limpos. **Fecha a Camada 2 do Épico 5.** Sign-off humano no navegador recomendado.
  - **Pronto quando:** a tela de prontidão mostra o diagnóstico genérico real do usuário. ✅
  - **Dependência:** T-45.
  - *Valor entregue: mesmo genérico, já é o diferencial que ninguém faz. 80% do valor com 20% do esforço.*

### Camada 3 — Extração com IA (a parte difícil — alimenta prontidão E resumo)
*A IA lê o PDF do edital específico. É o salto de inteligência e a parte que exige mais cuidado. Um motor, dois diferenciais.*

- [x] **T-47 — Spike: baixar e extrair texto do PDF do edital** 🟡
  - **Validar primeiro (estilo Épico 0).** Pegar o link do PDF (já vem do PNCP), baixar, extrair o texto. Ver se os editais reais são extraíveis (alguns podem ser imagem escaneada → exigem OCR).
  - **Feito (2026-06-24):** spike `spikes/pncp-pdf.mjs` (zero dep npm; usa `docker exec psql` p/ a amostra real e `pdftotext`/`pdfinfo`/`unzip` do sistema). Amostra de **40 editais de obra** (SC). **Achados:** (1) o PDF **não** vem no `linkSistemaOrigem` — vem de um endpoint **separado de arquivos** do PNCP, derivado do `numeroControlePNCP` (`…/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos`); (2) **boa parte vem em ZIP** (edital + anexos; `content-type` octet-stream, `content-disposition` revela `.zip`) — precisa descompactar e achar o PDF do edital dentro. **Resultado:** **70% edital completo com texto extraível** · 27,5% só resumo/aviso curto (texto OK, mas órgão não publicou o edital completo no PNCP) · **0% escaneado** (OCR não é problema hoje) · 2,5% sem PDF útil (ZIP só com `.docx`). Editais completos têm ~162k chars de média → vai exigir **chunking** na IA. Detalhes e impactos em [`spikes/RESULTADOS.md`](spikes/RESULTADOS.md#t-47--extração-de-texto-do-pdf-do-edital-épico-5-camada-3).
  - **Pronto quando:** você sabe que % dos editais reais dá para extrair texto, e como. ✅
  - **Dependência:** banco com editais reais (já tem).

- [x] **T-48 — Spike: IA extrai exigências de habilitação de 5 editais reais** 🟡
  - **Validar a qualidade ANTES de construir.** Pegar 5 PDFs reais do banco, mandar pra IA (**API OpenAI** — `gpt-5.5`, structured outputs; provider trocado em 24/06/2026, ver CLAUDE.md §3.4) extrair as exigências de habilitação de forma estruturada, e conferir à mão se acertou.
  - **Feito (2026-06-24):** spike `spikes/edital-ia.mjs` (zero dep; reusa a pipeline de PDF do T-47 + `fetch` p/ a OpenAI; chave em `spikes/.env`). 5 editais reais → JSON estruturado de exigências (certidões, CREA/CAU, capacidade técnica, capital social, garantia, outros), cada item com **trecho de evidência**. **Resultado: 5/5 corretas e detalhadas** (pegou as 6 certidões padrão, CREA/CAU, quantitativos de atestado, índices contábeis, PL/capital, garantia). **Verificação anti-alucinação:** o spike confere se cada trecho existe no texto do edital; inspeção confirmou **zero alucinação** — todo requisito citado está no edital (a IA às vezes **parafraseia** o trecho em vez de copiar literal, daí o T-49 deve pedir citação verbatim se quiser evidência clicável). Custo ~$0,15–$0,50/edital (~$2 nos 5). **Achado crítico (vira regra do T-49):** o PNCP lista vários arquivos como `tipo:"Edital"` (projeto executivo, ART, edital) — pegar o errado (projeto, sem habilitação) faz a IA devolver vazio **corretamente** (não é erro da IA, é seleção de documento). Corrigido escolhendo pelo **título "edital"** excluindo projeto/anexo. Detalhes e impactos em [`spikes/RESULTADOS.md`](spikes/RESULTADOS.md#t-48--ia-extrai-exigências-de-habilitação-épico-5-camada-3).
  - **Pronto quando:** você sabe a taxa de acerto real da IA em editais de verdade — e decide se está bom o suficiente ou precisa ajustar o prompt. ✅ *(qualidade alta; segue pro T-49. Sign-off humano final: abrir os 5 PDFs e conferir — os trechos citados tornam rápido.)*
  - **Dependência:** T-47.
  - *Crítico: edital errado interpretado gera diagnóstico errado. Diagnóstico errado é pior que diagnóstico nenhum.*

- [x] **T-49 — Serviço de extração de exigências com IA** 🔴
  - Com base no spike, construir o serviço: dado um edital, baixa o PDF, extrai texto, chama a IA, retorna as exigências estruturadas. Guardar o resultado (não reprocessar o mesmo edital toda vez — custa dinheiro de API).
  - **Feito (2026-06-24):** módulo `editais/exigencias/` (no `EditaisModule`). **Fluxo** (`ExigenciasService.getOrExtract`, máx. 1 chamada de IA por edital): cache → conector entrega documentos ranqueados → para cada candidato, baixa+extrai texto LOCALMENTE e escolhe o 1º com **sinal de habilitação** (resolve a seleção de doc do T-48; grátis) → 1 chamada à IA → **quality gate** (verificação de trechos) → persiste. **Cache obrigatório (§3.4):** tabela `edital_exigencias` (1:1, migration `CreateEditalExigencias`); status `extraido`/`indisponivel`/`erro` (só `erro` re-tenta). **§3.1 respeitado:** o contrato `EditalSourceConnector` ganhou `fetchEditalDocuments` (lógica do endpoint `/arquivos` + ranqueamento fica no `PncpConnector`); download+`pdftotext`/`unzip` é genérico (`DocumentoTextoService`). **IA:** `IaExtracaoService` (OpenAI SDK, `gpt-5.4-mini`, structured outputs estritos, prompt pede **citação verbatim**; trata 503 sem key, erro de IA → status erro). **Endpoint:** `GET /editais/:id/exigencias` (JWT, lazy: extrai na 1ª vez e cacheia). **Infra:** `poppler-utils`+`unzip` no Dockerfile (runtime Debian); dep nova **`openai`** (aprovada pelo dono); `OPENAI_API_KEY`/`OPENAI_MODEL` no `.env.example`. **Testes:** +17 (verificação anti-alucinação, ranqueamento de docs, orquestrador: cache/indisponível/extraído/erro/dedup) — **148 na suíte**. **E2E ao vivo** (banco real + OpenAI + poppler): edital real → `extraido`, doc certo, **trechos 11/11 verificados** (verbatim subiu vs ~55% do spike), 2ª chamada **19ms** (cache), 1 linha (sem duplicar). Esquema de saída alinhado ao catálogo T-44 + enum `CertidaoTipo` → cruzamento T-51 trivial.
  - **Pronto quando:** dado um edital, o sistema retorna as exigências de habilitação estruturadas, com cache. ✅
  - **Dependência:** T-48.

- [x] **T-50 — Resumo do edital com IA (dar vida ao mock)** 🟡
  - Reaproveitando o texto já extraído (T-49), gerar o resumo de 1 página: objeto, valor, prazo, documentos exigidos, datas-chave. Conectar à tela de resumo hoje mockada.
  - **Feito (2026-06-24):** o resumo sai na **MESMA chamada de IA** da extração (T-49) — "um motor, dois diferenciais" — então o custo segue ~1 chamada por edital. **Backend:** campo `resumo` adicionado ao schema/structured-output e aos tipos (`ResumoEdital`: `visaoGeral`, `prazoExecucao`, `datasChave[]`, `pontosDeAtencao[]` — foca no que só está no PDF, já que objeto/valor/prazo de proposta são campos do `Edital`); coluna `resumo` jsonb em `edital_exigencias` (migration `AddResumoToEditalExigencias`); exposto no response do `GET /editais/:id/exigencias`. **Frontend:** `useEditalIA` + componente `ResumoIA` ligam a seção "Resumo com IA" do detalhe ao dado real (visão geral + prazo + datas-chave + pontos de atenção), com estados loading/erro e **"indisponível"** (editais sem texto completo — T-47); aposentei `resumoIA`/`riscos` mock do `edital-insights.ts` (a prontidão específica segue mock até a T-52). **Validação ao vivo (§3.4):** resumo gerado num edital real conferido à mão — preciso (escopo, prazo "4 meses", 4 datas-chave com horários, 7 pontos de atenção reais) e **sem regressão** nas exigências (trechos 9/9). +1 teste (148 na suíte); build/lint API e web verdes; migration aplicada.
  - **Pronto quando:** a tela de "Resumo com IA" mostra o resumo real do edital. ✅ *(sign-off humano no navegador recomendado, padrão do projeto.)*
  - **Dependência:** T-49.
  - *Um motor (extração), dois diferenciais: resumo sai junto com a prontidão.*

### Camada 4 — Diagnóstico específico por edital (o produto completo)
*Junta tudo: exigências reais do edital (camada 3) × perfil do empreiteiro (camada 1). O veredito específico daquela licitação.*

- [x] **T-51 — Motor de diagnóstico específico (edital × perfil)** 🟡
  - Cruzar as exigências extraídas de UM edital (T-49) com o perfil do empreiteiro (T-40). Gerar veredito específico: apto / quase / não apto, com o que falta para AQUELA obra.
  - **Feito (2026-06-24):** motor puro `habilitacao/diagnostico-edital.ts` (`diagnosticarEdital(exigencias, perfil, now?)`) — itera **só o que aquele edital exige** (não o catálogo fixo da T-45) e devolve **veredito** (`apto`/`quase`/`nao_apto`) + itens (semáforo 🟢🟡🔴 + motivo) + `faltam[]` + `observacoes[]`. **Reuso:** as checagens (validade de certidão, registro, atestado, capital) foram extraídas de `prontidao.ts` para `habilitacao/habilitacao-checks.ts`, compartilhadas por T-45 e T-51 (T-45 inalterada). **Bônus sobre a T-45:** usa o `capitalSocial.valorMinimoReais` do edital (compara o capital do perfil com o mínimo exigido). Garantia, certidões OUTRA e outrosRequisitos viram **observações** (não pontuam — sem campo no perfil). **Regra do veredito:** algum 🔴 → não apto; só 🟡 → quase; tudo 🟢 → apto. **Serviço/endpoint:** `CompanyProfileService.getDiagnosticoEdital(userId, editalId)` (carrega perfil + `ExigenciasService.getOrExtract`; se o edital não tem exigências extraídas → `diagnostico:null` + status) exposto em **`GET /company-profile/diagnostico/:editalId`** (JWT). `CompanyProfileModule` importa `EditaisModule` (que passou a exportar `ExigenciasService`) — dependência numa direção só, sem ciclo. **Sem IA, sem custo** (cruzamento é lógica pura; o edital já foi extraído na T-49/T-50). +6 testes (motor: itera só o exigido, apto/quase/não apto, capital mínimo, observações) — **154 na suíte**; build/lint verdes. **e2e ao vivo:** edital real (cacheado) × perfil → veredito coerente listando os 8 requisitos daquele edital. A tela é a T-52.
  - **Pronto quando:** dado um edital + um usuário, o sistema diz se ele está apto àquela licitação e o que falta. ✅
  - **Dependência:** T-49, T-40.

- [x] **T-52 — Diagnóstico específico na tela de detalhe do edital** 🟡
  - Mostrar o veredito específico na tela de detalhe: semáforo + lista do que falta para aquele edital. Substitui o placeholder de "Prontidão" no detalhe.
  - **Feito (2026-06-24):** componente `DiagnosticoEdital` (+ hook `useDiagnosticoEdital`, `getDiagnosticoEdital` no client) consome `GET /company-profile/diagnostico/:editalId` (T-51) e **substitui o último mock** "Prontidão da sua empresa para esta obra" no detalhe. Mostra o **veredito** (badge Apto 🟢 / Quase lá 🟡 / Não apto 🔴), "atende X de Y (%)", e a lista de itens com semáforo + motivo (**não-atendidos primeiro**); as observações do edital (garantia/declarações) aparecem como "Também exigido (confira no edital)"; CTA "Atualizar meu perfil no cofre". Estados loading ("analisando…", pode levar segundos na 1ª vez)/erro/**indisponível** (editais sem edital completo — T-47/T-49). Removido o `edital-insights.ts` (último resquício de mock do detalhe — resumo e prontidão agora são reais). **Sem dep nova**; `tsc`+`vite build`+`eslint` limpos. **Fecha a Camada 4 (telas) do diagnóstico.** Sign-off humano no navegador recomendado.
  - **Pronto quando:** ao abrir um edital, o empreiteiro vê se está apto àquela obra específica. ✅
  - **Dependência:** T-51.

- [x] **T-53 — Filtro "só editais que estou apto" na busca** 🟢
  - Na busca (Épico 3), permitir filtrar para mostrar só os editais em que o empreiteiro está apto (ou quase). O "produto dos sonhos": buscar obra e já ver onde tem chance.
  - **Feito (2026-06-24):** **§3.4 respeitado** — o filtro roda sobre editais **já extraídos** (cache T-49), cruzando com o perfil via o motor da T-51 (**zero IA na busca**). **Backend:** `EditaisSearchService.findEditaisComExigencias(dto)` (reusa `buildEditalWhere` + JOIN nos `extraido`) → candidatos; `CompanyProfileService.getEditaisAptos(userId, dto)` roda `diagnosticarEdital` em cada, fica com **apto + quase**, ordena por data, pagina, devolve o veredito por item; endpoint **`GET /company-profile/editais-aptos`** (JWT). `EditaisModule` exporta `EditaisSearchService` (company-profile → editais, sem ciclo). **Frontend:** `EditaisListPage` ganhou o toggle **"Só obras em que estou apto"** (estado na URL) — liga `getEditaisAptos` no `useEditaisSearch(params, apto)`; `EditalCard` mostra badge de veredito (Você está apto / Quase lá); estado vazio dedicado. +3 testes (`findEditaisComExigencias`, `getEditaisAptos` filtra+pagina) — **156 na suíte**; build/lint API+web verdes; e2e ao vivo (DI + query). **Decisão de escopo (A):** o filtro cobre os editais já analisados (cresce conforme são abertos/extraídos); **pré-computação em background** dos não-analisados (top-N por UF, demanda-driven) fica como **follow-up** documentado — é decisão de custo do dono. **Fecha o Épico 5 e o marco do produto-núcleo.**
  - **Pronto quando:** dá para filtrar a busca por aptidão do usuário. ✅
  - **Dependência:** T-51.
  - *Cuidado de performance: diagnóstico por edital é caro (IA). Pensar em pré-computar para os editais da região do usuário, não calcular tudo on-the-fly.* → **Resolvido:** filtro só sobre já-extraídos (sem IA na busca). Pré-computação em background = T-54.

- [x] **T-54 — Pré-computação em background na captação** 🟡
  - Antecipa a extração por IA (resumo + exigências) em background, pra a região já vir analisada conforme é captada — sem depender do clique em cada edital.
  - **Feito (2026-06-24):** `ExigenciasService.triggerPrecomputeUf(uf)` — pega os **top-N editais de obra não-analisados** da UF (mais recentes primeiro, `LEFT JOIN edital_exigencias IS NULL`), **fire-and-forget**, **dedup por UF**, **sequencial** (gentil com OpenAI/PNCP), reusando `getOrExtract` (mesmo cache; "só resumo" custam $0). Teto **`PRECOMPUTE_LIMIT`** (default 20). **Gatilho:** o **job de captação** (`CaptacaoJobService.runOnce` — `@Cron` 3h **+** disparo manual `POST /captacao/run`), após cada UF. **NÃO** dispara na captação **sob demanda** da busca (T-34) de propósito — decisão do dono (24/06/2026): em fase de testes, buscar não pode gastar IA. **Kill-switch:** `PRECOMPUTE_ENABLED` (**ligado por padrão**; `=false` desliga sem mexer no código — decisão do dono: deixar ligada). **Caveat Render free:** hiberna (~15 min) → lotes longos não sobrevivem; por isso o teto N. +5 testes (160 na suíte); build/lint verdes.
  - **Cobertura:** progressiva (newest-first; novos têm prioridade). Acervo antigo enche ao longo dos disparos; o **clique (T-49)** continua como fallback pra qualquer edital não alcançado.
  - **⚠️ Ao colocar em prod (fazer JUNTO com o caveat da T-18):** como o gatilho agora é só o job, e no Render free o `@Cron` **não dispara confiável** (hiberna), a pré-computação **só roda de fato** com disparo confiável do job — configurar **cron externo** chamando `POST /captacao/run` (ou manter o serviço acordado). Sem isso, a região não vem pré-analisada e o produto recai no clique (T-49). No mesmo momento: setar `OPENAI_API_KEY` e revisar `PRECOMPUTE_ENABLED`/`PRECOMPUTE_LIMIT` no painel. Ver também T-55 (reativar o gatilho na busca depois dos testes).
  - **Pronto quando:** a região vem com resumo/diagnóstico prontos conforme é captada, sem abrir cada edital. ✅ *(em prod, depende do disparo confiável do job — ver acima)*
  - **Dependência:** T-49, T-53.

- [ ] **T-55 — Pré-computação na busca (gatilho on-search)** 🟢 ⏳ FUTURO (adiada — custo nos testes)
  - Estende a T-54: além da captação, disparar `triggerPrecomputeUf(dto.uf)` **na busca por UF** (aquece a região conforme as pessoas navegam, não só quando captada) e devolver `precomputing` no filtro "apto" → front mostra "analisando…" + auto-reload (igual ao `capturing` da T-34).
  - **Por que adiada (decisão do dono, 24/06/2026):** em fase de testes, disparar a cada busca gastaria IA à toa. A captação (T-54) + o clique (T-49) já cobrem o essencial. Retomar depois dos testes.
  - **Dependência:** T-54.

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

---

## Épico 6 — Orçamento integrado ao edital

> **Estratégia: NÃO competir com OrçaFáscio em profundidade de SINAPI.** Competir em integração — o orçamento nasce do edital específico que o empreiteiro já captou e leu com IA, não de uma planilha em branco. É o que os orçamentistas genéricos não conseguem fazer.
>
> **Diferença-chave:** OrçaFáscio começa do zero (planilha branca → busca composições). Aqui começa do edital (já captado, já lido por IA → proposta vinculada àquela licitação).

**Legenda:** 🟢 P (~1h) · 🟡 M (~3h) · 🔴 G (dia inteiro ou quebrar)
**Regra de ouro:** uma task por vez, commit por task. Reaproveitar o motor de IA já existente (Épico 5) — não construir leitura de edital de novo.

**⚠️ Antes de começar — recomendação registrada:** o MVP-núcleo já está vendável (buscar → prontidão → resumo). Este épico EXPANDE, não "fecha" o MVP. Idealmente validar com um empreiteiro real que orçamento é a próxima dor, antes de investir semanas. Decisão do dono: avançar.

---

## Camada 1 — Estrutura da proposta (a fundação, sem cálculo complexo)
*Modelar e montar a planilha de proposta. Começa simples: o empreiteiro cria uma proposta para um edital.*

- [x] **T-60 — Modelar a entidade Orçamento/Proposta** 🟡
  - Entidade `Proposta` vinculada a um `Edital` e a um `User`. Campos: título, status (rascunho/finalizada), BDI (%), valor de referência do edital (teto), datas.
  - Entidade `ItemProposta`: descrição, unidade, quantidade, preço unitário, subtotal (calculado). Vinculada à proposta, ordenável.
  - **Feito (2026-06-26):** módulo `propostas/` com 2 entidades + enum + migration `CreatePropostas`. **`Proposta`** (tabela `propostas`, N por user e por edital — **sem** `UNIQUE(user, edital)`, permite rascunhos): `titulo`, `status` enum `propostas_status_enum` (`rascunho`/`finalizada`, default `rascunho`), `bdiPercentual` (numeric 5,2), `valorReferencia` (numeric 15,2 — teto do edital), `createdAt`/`updatedAt`. **`ItemProposta`** (tabela `proposta_itens`, N por proposta, ordenável via `ordem` int): `descricao` (text), `unidade` (varchar 20), `quantidade` (numeric 15,4 — aceita frações/coeficientes), `precoUnitario` (numeric 15,2). Todas as colunas `numeric` usam o `decimalTransformer` existente; relação `@OneToMany`/`@ManyToOne` entre proposta e itens. **3 FKs `ON DELETE CASCADE`:** `propostas`→`users`, `propostas`→`editais`, `proposta_itens`→`propostas`. Índices `IDX_propostas_user_created (user_id, created_at)` e `IDX_proposta_itens_proposta_ordem (proposta_id, ordem)`. **Decisão (§3.3):** **subtotal e totais NÃO são persistidos** — só as entradas do cálculo (qtd, preço, BDI, teto); os totais são derivados pelo motor da T-66 (evita divergir de `qtd × preço`). **Sem service/controller/DTO** (é T-61). Verificado: `migration:run`/`revert`/`run` (up/down simétrico — tabelas e enum somem/voltam); insert real de proposta + 2 itens com FKs reais (roundtrip dos `numeric` ok, qtd com 4 casas), **CASCADE proposta→itens** confere, 3 FKs `confdeltype='c'` no catálogo (tudo em transação com ROLLBACK); app sobe (`PropostasModule` resolve na DI); lint + build limpos, **163 testes** passando.
  - **Pronto quando:** dá para persistir uma proposta com itens via migration + entidades. ✅
  - **Dependência:** `Edital` (Épico 1), `User` (Épico A).

- [x] **T-61 — API CRUD de propostas e itens** 🟡
  - Endpoints (JWT, ownership 404): criar/editar/listar/excluir proposta; adicionar/editar/remover/reordenar itens.
  - **Feito (2026-06-26):** `PropostasController` + `PropostasService` (JWT) sob `propostas`. **Proposta:** `POST /propostas`, `GET /propostas` (resumo, sem itens; filtro opcional `?editalId=` p/ a T-71), `GET /propostas/:id` (detalhe **com itens**), `PUT /propostas/:id`, `DELETE /propostas/:id` (204; CASCADE apaga itens). **Itens:** `POST /propostas/:id/itens` (append — ordem = última+1), `PUT /propostas/:id/itens/:itemId`, `DELETE /propostas/:id/itens/:itemId` (204) e `PUT /propostas/:id/itens` (**reordenar** em lote — body `{ordem: string[]}`, grava ordem = índice). DTOs com class-validator (`Create/Update` × proposta/item + `ReordenarItensDto`); `PUT` faz merge só do enviado (`applyDefined`). **Decisões:** (1) `status` nasce sempre `rascunho` — não aceito no `POST`, vira `finalizada` via `PUT`; (2) `editalId` validado no create → **404** se não existe (repo de `Edital` no `forFeature`, espírito do `FavoritosService`); (3) `valorReferencia` **pré-preenchido com `edital.valorEstimado`** quando o body não informa (snapshot do teto; refino é T-69); (4) **não** permite trocar `editalId` no update; (5) **reordenação** exige a lista com exatamente os ids dos itens (sem faltar/sobrar/repetir) → 400; (6) **sem totais calculados** nas respostas (T-66). **Segurança:** tudo escopado ao `user_id` do JWT (nunca do body); operações por `:id`/`:itemId` de não-dono → 404 (não vaza existência); `ParseUUIDPipe` nos params; `forbidNonWhitelisted` barra campo extra (400). **Sem migration** (schema é da T-60); sem dep nova. **Testes:** +17 no service (create/edital 404, ownership cross-user, merge, append de item, reordenação valida conjunto) — **180 na suíte**; lint + build verdes. **e2e curl (33 checagens, stack local):** 401 sem token, CRUD completo, `valorReferencia=811261.27` (teto do edital real), merge no update, ordem dos itens, reorder, isolamento cross-user (B→404) e DELETE com CASCADE.
  - **Pronto quando:** `GET/POST/PUT/DELETE` de proposta e itens funcionando, validado. ✅
  - **Dependência:** T-60.

- [x] **T-62 — Tela de proposta: criar e listar** 🟡
  - Tela onde o empreiteiro vê suas propostas e cria uma nova a partir de um edital. Dá vida à tela de Orçamentos hoje mockada.
  - **Feito (2026-06-26):** `OrcamentosPage` reescrita sobre dados reais (`usePropostas` → `GET /propostas`): cards com **título**, **badge de status** (Rascunho/Finalizada), **valor de referência** (teto) e data; estados loading/vazio/erro via `StateViews`. **Criar** via `NovaPropostaModal` — lista os **editais salvos** (`GET /favoritos`) num `Select`, **pré-preenche o título com o objeto** do edital escolhido, cria via `POST /propostas`; sem favoritos, orienta a buscar/salvar. **Excluir** com diálogo de confirmação (`Modal` do core — `@mantine/modals` não está no projeto) → `DELETE /propostas/:id` → reload. **Editor (`OrcamentoEditorPage`)** virou **placeholder real** (não mock): carrega `GET /propostas/:id`, mostra cabeçalho (título/status/teto/BDI + "ver edital de origem") e avisa que a planilha/cálculo/BDI vêm na próxima etapa; a **rota mudou de `:editalId` p/ `:id`** (propostaId). **Client** (`lib/api.ts`): `getPropostas`/`getProposta`/`createProposta`/`deleteProposta` + tipos em `types/proposta.ts`. **Mocks de orçamento removidos** (`MOCK_ORCAMENTOS`/`PLANILHA`/`BDI`/`CRONOGRAMA` + tipos órfãos). **Decisões:** (1) criação a partir dos favoritos (o atalho pela tela do edital é a T-71); (2) título = identidade do card (sem buscar o edital por card; sem mudar o backend); (3) excluir incluído (gestão da lista); (4) sem totais nos cards (T-66); (5) editor placeholder real até o T-68. **Sem dependência nova**; `tsc`+`vite build`+`eslint` limpos (bundle reduziu com a saída dos mocks). **Sign-off humano no navegador recomendado** (padrão do projeto).
  - **Pronto quando:** a tela de orçamentos deixa de ser mock e lista/cria propostas reais. ✅
  - **Dependência:** T-61.

---

## Camada 2 — Extração dos itens do edital com IA (reaproveita o Épico 5)
*A maioria dos editais de obra já traz a planilha orçamentária com itens e quantitativos. A IA extrai isso — e o empreiteiro só preenche preços.*

- [x] **T-63 — Spike: a IA consegue extrair a planilha de itens do edital?** 🟡
  - **Feito (2026-06-30):** `spikes/edital-itens.mjs` (reusa a pipeline de PDF do T-47 + parser XLSX em Node puro; OpenAI gpt-5.4-mini). Rodado com 30 candidatos + 5 extrações (~$0,12). **Resultado:** (1) **só 27% (8/30)** dos editais de obra têm planilha **extraível** — 67% não têm planilha anexada no PNCP, alguns são `.xls` binário → **o gargalo é dado, não a IA** (mesmo padrão do T-47/T-48). (2) Quando há planilha, a extração é **fiel, completa e barata**: 6–100 itens, zero alucinação no sign-off (últimos 5 códigos e item do meio batem literal com a fonte; não trunca), e a IA pega o **preço sem BDI** (custo direto) corretamente. **Decisões:** seguir pro T-64 (com cache, reusando T-47); **T-65 (import manual) é OBRIGATÓRIO** (~73% sem extração automática); preço de referência = sem BDI (BDI no T-67). Detalhes em `spikes/RESULTADOS.md`.
  - **Validar antes de construir (estilo Épico 0/5).** Pegar 5 editais reais que tenham planilha orçamentária e ver se a IA extrai os itens (descrição, unidade, quantidade) de forma estruturada e confiável.
  - **Pronto quando:** você sabe a taxa de acerto da extração de itens — e se a planilha vem em formato extraível (alguns editais têm a planilha em anexo separado, não no PDF principal).
  - **Dependência:** motor de IA do Épico 5 (T-49).
  - *Cuidado: a planilha de quantitativos às vezes é um anexo Excel separado do edital, não está no PDF. O spike revela quão comum isso é.*

- [x] **T-64 — Serviço de extração de itens da proposta (com cache)** 🔴
  - **Feito (2026-06-30):** módulo `editais/itens/` espelhando a infra do Épico 5. `ItensExtracaoService.getOrExtract(editalId)` com **cache obrigatório** (§3.4, tabela `edital_itens_extracao` 1:1 + migration): cache → `fetchEditalDocuments` → **seleciona a planilha** (`scorePlanilhaNome`, inverso do T-48) → `PlanilhaTextoService` extrai texto (**PDF via pdftotext + XLSX** via parser portado do spike; `.xls` binário/ZIP de anexos tratados) → `IaExtracaoService.extrairItens` (preço SEM BDI) → persiste itens + tokens/custo. Endpoint `GET /editais/:id/itens-extraidos`. Importação pra proposta: `POST /propostas/:id/itens/importar` (descrição/unidade/quantidade; **preço null** pro empreiteiro). **Testes:** `planilha-select.spec` + `propostas.service.spec` (import) + suíte 196 verde; **e2e na API real**: edital com planilha PDF → **100 itens importados** (extração PNCP+IA ponta a ponta), preço null. Sucesso/indisponível não reprocessam; erro re-tenta.
  - Com base no spike: dado um edital, extrair os itens da planilha orçamentária e pré-popular uma proposta. Reaproveita o texto já extraído pelo Épico 5 quando possível (não reprocessar à toa). Cache obrigatório.
  - **Pronto quando:** criar proposta a partir de um edital traz os itens já preenchidos (descrição/unidade/quantidade), faltando só os preços.
  - **Dependência:** T-63, T-60.

- [x] **T-65 — Importação manual de itens (fallback)** 🟢
  - **Feito (2026-06-30):** add unitário já existia (T-61); adicionado o **bulk** `POST /propostas/:id/itens/bulk` (array, append na ordem enviada) pra "colar de uma planilha" quando a extração por IA não rola (~73% dos editais — o spike T-63 mostrou). `CreatePropostaItensBulkDto` (ValidateNested, máx 2000). Testado (`propostas.service.spec` + e2e: +2 itens manuais sobre os importados, totais corretos).
  - Para editais onde a IA não extrai (planilha em anexo, escaneada, etc.): permitir o empreiteiro adicionar itens manualmente ou colar de uma planilha. Garante que o módulo funciona mesmo quando a extração falha.
  - **Pronto quando:** dá para montar a proposta à mão quando a extração automática não rola.
  - **Dependência:** T-61.

---

## Camada 3 — Cálculo e BDI (o coração financeiro, versão simples)
*Cálculo direto, sem a fórmula completa de TCU no início. O empreiteiro preenche preços, o sistema soma e aplica BDI.*

- [x] **T-66 — Motor de cálculo da proposta** 🟡
  - **Feito (2026-06-30):** `propostas/calculo.ts` — função pura `calcularProposta({itens, bdiPercentual})` → subtotal por item (qtd×preço, 2 casas, item sem preço/qtd = 0 e sinalizado), custo direto (Σ subtotais), valor do BDI (percentual único sobre o custo direto), valor global (custo direto + BDI) e contadores (totalItens/itensSemPreco). **Backend dono do cálculo (§3.3):** totais NÃO persistidos — derivados sob demanda. Plugado no **detalhe** (`GET /propostas/:id` → campo `calculo`); a lista fica sem totais (isso é o T-85). **Testes:** `test/calculo.spec.ts` (7 — soma, BDI, item sem preço, vazio, arredondamento a centavos, caso real do spike); +e2e na API local (proposta com 2 itens + BDI 25% → custoDireto 27.139,72 / valorBdi 6.784,93 / valorGlobal 33.924,65). lint + build verdes. Sem migration (sem mudança de schema). Modelo simples (§9): BDI percentual único, sem composições/BDI decomposto.
  - Backend é o dono do cálculo (mesma filosofia da prontidão, T-45): subtotal por item (qtd × preço unitário), custo direto total, valor com BDI aplicado, valor global da proposta. Função pura, testável.
  - **Pronto quando:** dado uma proposta com itens e BDI, o sistema retorna todos os totais corretos.
  - **Dependência:** T-60.

- [x] **T-67 — BDI configurável (percentual)** 🟢
  - **Feito (2026-06-30):** o BDI já era configurável (campo `bdiPercentual` na entidade — T-60; aceito e validado em `Create`/`UpdatePropostaDto`, 0–999,99 com 2 casas — T-61) e o motor (T-66) o aplica como percentual único sobre o custo direto. Não precisou de código de produção novo. Travado com teste de **recálculo** (`calculo.spec.ts`: mudar o BDI muda o valor global, custo direto inalterado) + **e2e** na API (criar BDI 0% → valorGlobal 1000; `PUT bdiPercentual=30` → valorGlobal 1300). Sem fórmula TCU/decomposição (§9) — só o percentual.
  - Versão simples: o empreiteiro informa o BDI (%) e o sistema aplica sobre o custo direto. SEM a fórmula completa de TCU (administração, risco, tributos detalhados) no início — só o percentual.
  - **Pronto quando:** alterar o BDI recalcula o valor global da proposta.
  - **Dependência:** T-66.
  - *Evolução futura: decompor o BDI nos componentes do TCU (acórdão 2622/2013). Não agora.*

- [x] **T-68 — Tela de edição da proposta (preencher preços + ver totais)** 🔴
  - **Feito (2026-06-30):** `OrcamentoEditorPage` reescrita (o "Gestor de proposta" do Figma). Tabela de itens com **preço unitário editável** (NumberInput, salva no blur → refetch; **totais vêm do backend**, §3.3 — front nunca recalcula) + subtotal por item; **Importar do edital** (T-64) e **Adicionar item** (modal: um item ou colar vários → T-65). Painel **Composição** (card grafite): BDI editável (T-67), custo direto, valor do BDI, **valor global**, **% do teto** (comparação leve vs valorReferencia) + barra, contador de itens sem preço. Finalizar/Reabrir (status). Client de API: update proposta/itens, importar, bulk. tsc+lint+build verdes; screenshot confere com o frame. **Exportar (T-70)** e **cronograma físico-financeiro (T-93)** ficam marcados "em breve" — precisam de backend próprio.
  - A tela principal do módulo: lista de itens, campo de preço unitário por item, subtotais, BDI, e o valor global atualizando em tempo real. Clareza > sofisticação.
  - **Pronto quando:** o empreiteiro preenche os preços e vê a proposta calculada ao vivo.
  - **Dependência:** T-66, T-62.

---

## Camada 4 — O diferencial e a saída (o que ninguém faz + entregável)
*Aqui mora o ouro: comparar com o teto do edital. E a exportação que tira o empreiteiro do sistema com o documento pronto.*

- [x] **T-69 — Comparação com o valor de referência do edital** 🟡
  - **Feito (2026-06-30):** o motor (T-66) agora calcula um bloco `comparacao` (backend é o dono, §3.3): valorReferencia, **economia (teto − valor global, em R$)**, % do teto e diferença % (abaixo/acima), `abaixoDoTeto`. O front renderiza no editor (texto verde/vermelho "X% abaixo do teto · folga de R$Y" + barra) e no PDF/impressão — substituindo o cálculo que antes era feito no front. O teto vem do `valorReferencia` da proposta (snapshot do PNCP no create — refino por IA fica para depois). Testes em `calculo.spec` (abaixo/acima/sem teto) + e2e (R$2,5mi vs teto R$3,6mi → 31% abaixo, economia R$1,1mi). Mostra a relação em **% e valor**.
  - **O diferencial que orçamentista nenhum faz.** O edital tem um valor máximo (orçamento de referência do órgão). Mostrar: "sua proposta está X% abaixo/acima do teto". Ajuda a ser competitivo sem cair no prejuízo.
  - Extrair o valor de referência do edital (a IA do Épico 5 pode pegar isso, ou vem dos dados do PNCP).
  - **Pronto quando:** a proposta mostra a relação com o teto do edital em % e valor.
  - **Dependência:** T-66.
  - *Conecta com a ideia futura de inteligência de mercado (por quanto obras parecidas foram arrematadas).*

- [x] **T-70 — Exportar a proposta (PDF/Excel)** 🔴
  - **Feito (2026-06-30):** sem dependência nova. **Excel via CSV** — `GET /propostas/:id/export.csv` (`@Header` + BOM UTF-8, `;` + decimal `,` pro Excel pt-BR; itens + totais do backend §3.3); front baixa via `downloadPropostaCsv`. **PDF via impressão** — `OrcamentoImprimirPage` (rota `/orcamentos/:id/imprimir`, tela limpa sem shell, `@media print` esconde a barra) → "Imprimir / Salvar PDF" do navegador. Menu **Exportar** no editor (Excel .csv / Imprimir-PDF). Build/lint/testes verdes; e2e do CSV na API real (BOM, decimais, item sem preço → 0,00) + screenshot do PDF. Formato limpo e padrão (modelo específico por edital fica para depois, se o uso pedir).
  - **Pronto quando:** o empreiteiro baixa a proposta pronta para anexar ao edital.
  - **Dependência:** T-66.
  - *Verificar formato: alguns editais exigem a planilha num modelo específico. Começar com um formato limpo e padrão.*

- [x] **T-71 — Vincular proposta ao fluxo do edital (integração)** 🟢
  - **Feito (2026-06-30):** no detalhe do edital, o botão **"Montar proposta"** (topo + sidebar do prazo) cria a proposta **já vinculada** (editalId + título + valorReferencia = snapshot do teto via create) e leva ao editor. Reaproveita: ao carregar o detalhe busca `GET /propostas?editalId=` — se já existe, o botão vira **"Abrir proposta"** e abre a existente (sem duplicar). Fecha a jornada achar → habilitar → propor. Client: `getPropostasDoEdital`. e2e confirma criar+vincular+reabrir. **Cobre também o T-86 do Épico 7.**
  - **Pronto quando:** dá para criar uma proposta direto da tela do edital, com tudo pré-vinculado.
  - **Dependência:** T-62, T-52 (detalhe do edital).

---

## Ordem e marco

```
Camada 1 (fundação) — proposta + itens
  T-60 → T-61 → T-62

Camada 2 (IA extrai itens) — validar antes
  T-63 → T-64 ; T-65 (fallback, paralelo)

Camada 3 (cálculo + BDI)
  T-60 → T-66 → T-67
  T-66 + T-62 → T-68

Camada 4 (diferencial + saída)
  T-66 → T-69, T-70
  T-62 + T-52 → T-71
```

**Marco do Épico 6:** o empreiteiro acha uma obra, vê que está apto (prontidão), e monta a proposta de preço — com os itens já extraídos do edital pela IA, calculando totais e BDI, vendo o quanto está abaixo do teto, e exportando o documento pronto para anexar. A jornada **achar → habilitar → propor** fica completa.

**Princípio que guia o épico:** começar simples (cálculo direto, BDI percentual, sem a base SINAPI inteira) e usar a força que você já tem (captação + leitura de edital por IA). O diferencial não é profundidade de SINAPI — é o orçamento nascer do edital específico. Profundidade (base SINAPI, BDI decomposto, composições) é evolução futura, SE o uso real provar que vale.

---

## O que deliberadamente NÃO entra (e por quê)

- ❌ **Base SINAPI completa (87 mil composições, 27 estados, atualização mensal):** trabalho perpétuo, território do OrçaFáscio. Talvez consulta pontual no futuro (T-72?), nunca a base inteira agora.
- ❌ **Composições analíticas (insumo + mão de obra + coeficiente):** o motor mais complexo e onde erros de centavo desclassificam. Fora de escopo.
- ❌ **BDI decomposto no padrão TCU completo:** começar com percentual simples. Decompor é evolução.
- ❌ **Curva ABC, cronograma físico-financeiro, integração BIM:** funcionalidades de produto especializado. Não agora.

*Estes são o que torna OrçaFáscio um produto de anos. Replicá-los te tiraria do seu diferencial. A régua: só entra se o uso real provar a necessidade.*

---

## Notas de cuidado

- **Reaproveitar o motor de IA do Épico 5:** a extração de itens (T-64) usa a mesma infra de leitura de PDF + IA + cache que já existe. NÃO construir de novo.
- **Fallback sempre:** nem todo edital tem planilha extraível (anexo Excel separado, escaneado). A importação manual (T-65) garante que o módulo funciona sempre.
- **Cálculo no backend:** seguir a filosofia da prontidão — backend dono do cálculo, front só renderiza. Evita divergência entre o que a tela mostra e o que o sistema calcula.
- **Cuidado com promessa de precisão:** este é um orçamento de proposta, não uma ferramenta de orçamentação oficial certificada. Deixar claro ao usuário que ele confere os valores — não assumir responsabilidade por erro de cálculo que o desclassifique. (Mesma lógica do "diagnóstico errado é pior que nenhum".)

---

## Épico 7 — Redesign PrumoLicita: pendências de backend (pro Figma bater 100%)

> O re-skin visual da nova identidade **PrumoLicita** nas telas de app foi concluído no front (re-skin no lugar, validado com dados de exemplo). Os itens abaixo são o que o Figma desenha mas **depende de backend** — o front já está pronto pra consumir quando existir. Frames, decisões e o que ficou de fora em `memory/rebrand-prumolicita.md`.
>
> **Editor de Orçamento (T-68):** o dono decidiu **seguir o Figma completo** (cronograma físico-financeiro + BDI decomposto). Isso **revoga as proibições do CLAUDE.md §9** — ao construir o T-68, atualizar o §9 removendo "cronograma físico-financeiro" e "BDI decomposto" da lista de não-escopo.

### Busca de editais
- [x] **T-80 — Filtro por modalidade** 🟡
  - Param `modalidade` no `GET /editais` (+ índice). Front adiciona os checkboxes (Pregão eletrônico / Concorrência / Tomada de preços) no painel de filtros.
  - **Dependência:** Épico 3.
  - **Decisão (2026-06-30):** o Figma mockou "Pregão eletrônico / Concorrência / Tomada de preços", mas **a captação só traz Concorrência** (PNCP modalidades 4 Eletrônica e 5 Presencial — `PNCP_MODALIDADES`); Pregão e Tomada de preços **nunca entram no banco** (Tomada de preços nem existe na Lei 14.133). Implementar os 3 checkboxes seria um filtro que mente (2 sempre zero). O dono escolheu o **filtro honesto**: só o corte que existe — Concorrência **eletrônica × presencial**. Expandir é T-80-bis (mexeria na captação, §3.1).
  - **Feito (2026-06-30):** Backend — `SearchEditaisDto` aceita `modalidade` (param repetido `?modalidade=4&modalidade=5`, coagido a `number[]`, validado: ≤20, inteiros ≥1; lixo não-inteiro é saneado para vazio = sem filtro); `buildEditalWhere` vira `modalidadeId IN (...)` carregando nos dois ramos do OR de valor; migration `AddModalidadeIndexToEditais` (índice em `modalidade_id`, à mão → sem papercut GIN §10.1). Front — checkboxes "Concorrência eletrônica/presencial" no painel (estado na URL como csv `modalidade=4,5`; client converte p/ param repetido), chip de filtro ativo. Testes: 4 no `editais-search.service.spec` (single/multi/vazio/OR) + suíte cheia (207). E2e local: sem filtro 1508 = 1431 (4) + 77 (5); `modalidade=6` → 0 (confirma a honestidade).
- [x] **T-81 — Multi-região e ordenação** 🟢
  - Aceitar múltiplas UFs/municípios e `sort` (prazo ↑, valor) no `GET /editais`. Front: região como chips múltiplos + "Ordenar: Prazo".
  - **Dependência:** Épico 3.
  - **Feito (2026-06-30):** Backend — `SearchEditaisDto`: `uf` e `codigoIbge` viram arrays (param repetido `?uf=SC&uf=PR`, retrocompatível com valor único; uma UF colapsa pra escalar, várias viram `IN`); novo `sort` (`recentes` default | `prazo` | `valor`) → função pura `buildEditalOrder` (prazo `ASC nulls last`, valor `DESC nulls last`, `id DESC` desempate). Captação sob demanda dispara por **cada** UF buscada (loop; `triggerUfIfStale` já é dedup/não-bloqueante). Migration: índice em `prazo_proposta` (à mão, sem papercut GIN). Front — UF e município viram **MultiSelect** (município só com 1 UF, pois a base geo é por-UF; limpa ao mudar o conjunto), chips por UF/município removíveis, e dropdown **"Ordenar"** na barra de resultados (param próprio na URL, muda na hora; preservado ao aplicar filtros). Testes: 9 novos no `editais-search.service.spec` (multi-UF/IN, multi-município, 3 sorts, multi-UF captação) + suíte cheia (214). E2e local: `uf=SC&uf=RJ` = 822 = 814+8; `sort=valor` decrescente; `sort=prazo` ascendente; UF inválida → 400.
  - **Nuance (registrado):** `sort=prazo` é ascendente puro — não filtra prazos já vencidos. Com captação fresca em prod, ascendente = próximo vencimento primeiro; filtrar vencidos é outra coisa (não faz parte da ordenação).
- [x] **T-98 — Busca de editais mais rápida na 1ª captação de UF nova** 🟡
  - Origem: conversa 02/07/2026. A 1ª busca de uma UF nunca captada era lenta: o front esperava **25s fixos** em branco antes de um reload único, e o backend fazia o backfill de **30 dias** de uma vez (o conector do PNCP pagina modalidade 4 inteira → depois 5, sem reordenar por data — os editais recentes podiam só aparecer no fim).
  - **Front (poll):** trocado o reload cego de 25s por um **poll curto** (~4s, até 10 tentativas / teto ~40s) que só roda quando a UF vem **vazia + capturing**, e para assim que os editais aparecem (`total>0`). UF já populada mas "velha" não entra no poll (evita piscar esqueletos) nem no alerta de "primeira vez". `EditaisListPage`.
  - **Backend (backfill progressivo):** na 1ª captação de uma UF (backfill pendente), `UfCaptureService.syncUf` faz **dois passes**: um **rápido** dos últimos `CAPTACAO_ONDEMAND_QUICK_DAYS` (7d) que **não marca sync** (best-effort; se falhar, só loga e segue) — janela pequena e recente, poucos registros, primeiros editais aparecem já; seguido do **completo** (30d) que re-busca a janela do rápido (upsert idempotente por `fonte+idExterno`) e **marca `backfillDone`**. O segredo é o rápido **não** marcar: se marcasse encolhido, o job seguinte trataria a UF como incremental (overlap 2d) e os dias 8–30 nunca entrariam. Incremental (UF já com backfill) **inalterado**. Refatorado o miolo em `ingestWindow` (loop compartilhado) + `runQuickPass` (best-effort) + `runFullWindow` (autoritativo: marca sync + histórico T-19).
  - **Dependência:** T-34 (captação sob demanda), Épico 2.
  - **Feito (2026-07-02):** Constante `CAPTACAO_ONDEMAND_QUICK_DAYS_DEFAULT=7` (env `CAPTACAO_ONDEMAND_QUICK_DAYS`). Testes: `uf-capture.service.spec` — passe rápido 7d + completo 30d, `markSynced`/`syncRun` só uma vez (no completo), e falha no rápido não impede o completo; suíte cheia (242). Lint + build limpos. **Sign-off humano pendente:** buscar uma UF nova no navegador e confirmar a sensação (§4.4) — não dá pra medir timing só com build/testes.
- [x] **T-82 — Veredito (aptidão) na listagem e nos favoritos** 🔴
  - Trazer o `veredito` pré-computado (T-54) nos itens de `GET /editais`, `GET /favoritos` e nos cards da Início. Habilita: badge "Apto/Falta doc" em Início/Busca/Salvas, a aba "Apto" e as ações condicionais ("Montar proposta"/"Resolver pendência") em Salvas.
  - **Dependência:** T-52, T-54.
  - **Arquitetura (2026-06-30):** `company-profile` já importa `editais`, então `editais`→`company-profile` faria ciclo. Solução: módulo **`aptidao` standalone** (injeta só os repos perfil/certidões/atestados + exigências, nenhum módulo) com `vereditosPara(userId, editalIds) → Map`; importado por `editais` e `favoritos`. Cruza o **cache** de exigências (status EXTRAIDO) com o perfil via `diagnosticarEdital` — **sem IA** (§3.4). Editais sem exigências ficam sem veredito (null).
  - **Feito (2026-06-30):** Backend — `AptidaoModule`/`AptidaoService`; `EditalListItem` ganha `veredito: Veredito | null` (default null em `toEditalListItem`); `editais.controller.list` (agora `@CurrentUser`) e `FavoritosService.list` decoram via `vereditosPara`. Front — `veredito` no `EditalListItem` (e `BuscaResultItem` virou alias); **Busca/Início** já passavam `veredito` ao `EditalCard`/`VereditoBadge` (acendem sozinhos); **Salvos** ganhou badge por card, **aba "Apto"** (SegmentedControl Todos/Apto) e **ação contextual** no rodapé (Montar proposta / Resolver pendência / Ver detalhe). Testes: 4 no `aptidao.service.spec` (vazio/sem-exigências/apto/nao_apto) + ajuste de 2 specs + suíte cheia (236). E2e local: campo presente em todos; os 2 editais analisados → veredito (nao_apto p/ dev sem certidões); favoritos decorados.
- [x] **T-83 — Status do resumo IA na listagem** 🟢
  - Sinalizar por edital se o resumo IA já está pronto (sem abrir). Habilita o badge "Resumo IA pronto" no card de destaque da Início.
  - **Dependência:** T-50.
  - **Feito (2026-06-30):** Backend — `EditalListItem` ganha `resumoPronto: boolean`. No `search()` (GET /editais), uma query lê do cache quais editais DA PÁGINA têm `resumo IS NOT NULL` (`resumosProntos`, `Not(IsNull())`) e marca o flag — **só lê o cache, NUNCA dispara IA** (§3.4); 1 query por página (pageSize pequeno). `toEditalListItem(edital, resumoPronto=false)`; favoritos mantém false (selo é da busca/Início; Salvos pode reusar o lookup depois). Front — badge laranja "Resumo IA pronto" (IconSparkles) no card de destaque da Início quando `resumoPronto`. Testes: 1 novo no `editais-search.service.spec` (marca e1 sim/e2 não, e confere que lê `resumo IS NOT NULL`) + ajuste de mocks + suíte cheia (215). E2e local: os 2 editais com resumo no cache → `resumoPronto: true`, demais false, campo presente em todos.
  - **Follow-up barato (não-escopo agora):** o mesmo selo nos cards da lista de busca (`EditalCard`) e nos Salvos — o dado já existe; é só renderizar.

### Orçamentos / propostas
- [x] **T-84 — Ciclo de status da proposta + resultado** 🟡
  - Estender `PropostaStatus` (rascunho → enviada → ganhou/não ganhou), data de envio e resultado. Front: badges Enviada/Ganhou/Não ganhou na lista.
  - **Dependência:** T-61.
  - **Decisão (2026-06-30):** enum **plano** `rascunho | enviada | ganhou | nao_ganhou` (substitui `finalizada`) — o resultado É o status (sem coluna `resultado` separada). `dataEnvio` é **derivada da transição** (backend dono, §3.3): set ao sair de rascunho, preservada entre enviada↔resultado, limpa ao reabrir como rascunho — o front nunca a envia.
  - **Feito (2026-06-30):** Backend — novo enum + `STATUS_ENVIADOS` + função pura `resolveDataEnvio(status, atual, now)` (now injetável); coluna `data_envio`; migration recria o tipo PG (rename→map `finalizada→enviada`→drop) + backfill `data_envio = updated_at` das enviadas; `update()` aplica `resolveDataEnvio`; `PropostaResponse`/detalhe expõem `dataEnvio`. Front — `PropostaStatus` (4) + `dataEnvio`; `OrcamentosPage` badges (Rascunho/Enviada/Ganhou/Não ganhou, cores marca) + stat cards Rascunhos/Enviadas/Ganhas; editor troca "Finalizar/Reabrir" por **ações contextuais** (`StatusAcoes`: rascunho→"Marcar como enviada"; enviada→"Ganhou"/"Não ganhou"/"Voltar a rascunho"; resultado→"Reabrir") + subtítulo "enviada em". Testes: 3 transições no service + 4 da função pura (`proposta-status.spec`) + suíte cheia (222). E2e local: rascunho(null)→enviada(set)→ganhou(preserva)→rascunho(limpa); status inválido→400.
  - **Follow-up (não-escopo):** deixar a `dataEnvio` editável (hoje auto = agora na transição).
- [x] **T-85 — Total calculado e faturamento na listagem** 🟡
  - "Seu preço" (total com BDI) por proposta na lista + "economia" vs teto + agregado "Faturado em obra". Front: 4º stat card + colunas Seu preço/Economia.
  - **Dependência:** T-66, T-84.
  - **Feito (2026-06-30):** Backend — `GET /propostas` agora roda o motor de cálculo por proposta (carrega os itens de todas numa query `In`, agrupa, `toPropostaListItemResponse`) e devolve `valorGlobal` + `itensSemPreco` + `comparacao` (ComparacaoTeto) por item — só o agregado, **sem** a planilha item a item (§3.3, lista enxuta). Front — `PropostaListItem` (estende Proposta); `OrcamentosPage` ganha colunas **Seu preço** (valorGlobal) e **Economia** (comparacao, verde abaixo / vermelho acima do teto) + 4º stat card **Faturado em obra** (soma do valorGlobal das ganhas — só soma valores já calculados pelo backend, não recalcula). `getPropostas`/`getPropostasDoEdital`/`usePropostas` tipados como `PropostaListItem`. Testes: 2 no service (lista vazia / valorGlobal+economia, e confere que não vaza `itens`) + suíte cheia (224). E2e local: BDI 20% sobre R$50k → valorGlobal 60k, itensSemPreco 1, economia 40k (teto 100k), faturado 60k; lista sem `itens`.
- [x] **T-86 — Montar proposta a partir do edital** 🟢 — **coberto pela T-71 (30/06/2026):** o detalhe cria/abre a proposta vinculada direto.
  - Deep-link "Montar proposta" no detalhe do edital cria a proposta direto (sem precisar salvar antes). É a T-71 com o gatilho no detalhe.
  - **Dependência:** T-61, T-52.
- [x] **T-93 — Cronograma físico-financeiro (simples) da proposta** 🟡
  - O frame "Gestor de proposta" tem um cronograma simples (distribuir a obra em meses com % do valor). **Revoga o §9** (que proibia cronograma) — versão SIMPLES, percentual por mês, NÃO o cronograma TCU completo. Backend: persistir os meses/percentuais por proposta; front: o card já existe como "em breve" no editor (T-68).
  - **Pronto quando:** o empreiteiro distribui a proposta em meses e vê os valores por mês.
  - **Dependência:** T-66, T-68.
  - **Feito (2026-06-30):** Backend — coluna `cronograma` jsonb na `Proposta` (etapas `{descrição, percentual}`); migration `AddCronogramaToPropostas`; `UpdatePropostaDto` aceita `cronograma` (validado: ≤36 etapas, %0–100). **O valor por etapa é derivado** (`calcularCronograma`: % × valor global, função pura testável, §3.3) e exposto no detalhe (`cronograma` + `cronogramaPercentualTotal`); o front NUNCA recalcula. Front — o card "em breve" do editor virou seção **editável** (etapas com descrição + % + valor derivado + barra; "Adicionar etapa"/remover; total com aviso quando não fecha 100%; "Salvar cronograma" → PUT → refetch). O cronograma também sai na **impressão/PDF** (T-70). Testes: `cronograma.spec` (4) + suíte cheia (203). E2e na API local: PUT 200 → valores 30k/70k de R$100k, total 100%, inválido (150%) → 400.

### Configurações (tela nova — hoje mock §7)
- [ ] **T-87 — Equipe & convites** 🔴
  - Membros, papéis (Dono/Editor/Leitor) e convite por e-mail; multi-usuário por empresa. Front já tem a aba "Equipe & Plano".
  - **Dependência:** Épico A (auth).
- [ ] **T-88 — Plano, assinatura e cobrança** 🔴
  - Plano atual, uso do mês, método de pagamento/próxima cobrança (provável gateway). Front já tem a casca.
  - **Dependência:** —.
- [x] **T-89 — Preferências de notificação + troca de senha** 🟢
  - Persistir as preferências de alerta/canais e ligar a troca de senha ao backend.
  - **Dependência:** Épico A.
  - **Feito (2026-06-30):** Backend — coluna `notification_prefs` jsonb no User (`{whatsapp,email}`; null → defaults na resposta via `DEFAULT_NOTIFICATION_PREFS`) + migration; `GET /users/me` expõe `notificationPrefs`; `PUT /users/me/notifications` (DTO `@IsBoolean`) persiste. **Troca de senha:** `POST /auth/change-password` (guarded) → `AuthService.changePassword` confere a senha atual (bcrypt), grava o novo hash e **revoga todos os refresh tokens** (encerra outras sessões; access token atual segue até expirar). DTO reusa MinLength 8. Push fica fora (não implementado — UI "em breve"). Front — `UserMe.notificationPrefs`; aba **Notificações** com toggles otimistas (salva no change, reverte em erro) e aba **Segurança** com troca de senha (valida nova≥8 + confirmação, erros 401/400, sucesso limpa os campos). Testes: 2 no `auth.service.spec` (troca+revoga / senha errada não troca) + suíte cheia (232). E2e local: defaults, PUT persiste, inválido→400; change errada→401, curta→400, correta→204, login antiga→401/nova→200 (senha do dev **restaurada** no fim).

- [ ] **T-99 — Ligar a tela de Perfil inteira (remover os mocks)** 🔴
  - Origem: conversa 02/07/2026. A `PerfilPage` é **mista**: **Notificações** e **Segurança** já são reais (T-89); **Equipe & Plano** e o grosso de **Dados da empresa** ainda saem de `MOCK_COMPANY`/`MOCK_EQUIPE`. Objetivo: a página inteira consumir dado real, apagando os mocks.
  - **Por aba:**
    - **Notificações + Segurança:** ✅ já reais (T-89) — nada a fazer.
    - **Equipe & Plano:** depende de **T-87** (equipe/convites) e **T-88** (plano/cobrança) — já são tasks próprias. Esta task **não** as duplica; quando ambas existirem, trocar o `MOCK_EQUIPE`/casca de plano pelo real.
    - **Dados da empresa:** o trabalho novo. Parte já tem backend e é só ligar; parte não tem backend e exige decisão (não construir schema para campo-vaidade).
  - **Já tem backend (só ligar, sem schema novo):** razão social + CNPJ + porte + UF (User + `CompanyProfile`, T-40/T-41 — hoje o cabeçalho usa `user` com fallback pro mock); **capital social** (`CompanyProfile.capitalSocial`); **registro CREA/CAU** (`CompanyProfile.registroProfissional*`); **acervo técnico** (entidade `Atestado`, T-40 — obra/contratante/ano/valor). Município do usuário vem da **T-94** (preferência nova).
  - **Sem backend — DECIDIR (dono) cortar vs criar schema:** faturamento anual, índice de liquidez, lista de CNAEs, fundação, contato (e-mail/telefone), múltiplos responsáveis técnicos (o `CompanyProfile` só guarda **um** registro profissional), regiões de atuação. **Recomendação:** cortar os campo-vaidade e manter só o que alimenta prontidão/diagnóstico (capital social, registro, acervo já entram no T-45/T-51); adicionar faturamento/liquidez só se virarem critério de habilitação de fato.
  - **Dependência:** T-40/T-41 (perfil/atestados, feitos), T-94 (município), T-87, T-88, T-89 (feito).
  - **Pronto quando:** `PerfilPage` não importa mais `MOCK_COMPANY`/`MOCK_EQUIPE`; cada aba mostra dado real (ou o "em breve" honesto enquanto T-87/T-88 não existem), com estados loading/erro/vazio.

### Telas mock que precisam de backend próprio
- [x] **T-90 — Central de notificações (Alertas)** 🔴
  - Backend de eventos/alertas (nova obra, prazo, certidão vencendo, resumo pronto, resultado) + leitura/marcação. A tela (`AlertasPage`) já existe como casca + o sino do header.
  - **Dependência:** T-82, T-84, captação.
  - **Decisão (2026-06-30):** alertas **DERIVADOS** do estado real (sem tabela de eventos/hooks), com "lido" por timestamp de última visita (`users.alertas_visto_em`) — escolha do dono frente ao sistema de eventos persistido (muito maior). No espírito da Agenda (T-91).
  - **Feito (2026-06-30):** Backend — módulo `alertas` standalone (só repos): `GET /alertas → {itens, naoLidos}` deriva 4 fontes — **certidão vencendo/vencida** (≤30d), **prazo de entrega** (≤14d, editais salvos/com proposta), **resumo IA pronto** (editais salvos, cache), **resultado** (propostas ganhou/não ganhou); montagem/ordenação pura `construirAlertas(input, vistoEm, now)` (cada alerta tem `data` PASSADA; `novo = data > vistoEm`). `POST /alertas/marcar-lido` grava `alertas_visto_em = now` (zera o sino). Migration leve. **"Nova obra apta"** ficou como follow-up (recência × veredito). Front — `AlertasProvider` (contexto compartilhado sino+tela); sino no header com `Indicator` (contagem de não lidos); `AlertasPage` reescrita (abas por categoria, lista real, "marcar tudo como lido"). Testes: 5 em `alertas.spec` (janelas/ordem/novo) + suíte cheia (241). E2e local: 2 alertas (resumo IA + prazo) novos → marcar-lido (204) → naoLidos 0 → marcar proposta "ganhou" gera alerta de resultado novo (naoLidos 1); tudo restaurado.
- [x] **T-91 — Agenda de prazos (dados reais)** 🟡
  - Derivar os prazos da agenda dos editais salvos/propostas (sessão, impugnação, entrega, visita técnica, certidões). A tela já existe mock.
  - **Dependência:** Épico 3, T-61.
  - **Escopo honesto (2026-06-30):** o modelo só tem **dois prazos reais** — entrega da proposta (`Edital.prazoProposta`) e vencimento de certidão (`Certidao.dataValidade`). Sessão de disputa / impugnação / visita técnica **não são captadas** (exigiriam extração por IA do texto do edital) — ficam fora até existir essa fonte (registrado no código).
  - **Feito (2026-06-30):** Backend — módulo `agenda` (sem entidade própria): `GET /agenda` agrega os editais **salvos + com proposta** (dedup, link à proposta) e as **certidões** do usuário; derivação/ordenação pura em `montarAgenda(editais, certidoes, now)` (now injetável §3.3 — entrega só se ainda por vir; certidão entra mesmo vencida pra renovar; ordena asc). Front — `AgendaPage` reescrita consumindo `useAgenda` (calendário + lista com estados loading/erro/vazio, link por evento, dias no fuso de Brasília via `calendarYmd` exportado); **HomePage** passou a usar a agenda real (prazos de entrega na "atenção"/resumo, certidões já tinham bloco) — **`MOCK_PRAZOS`/`MockPrazo` removidos**. Testes: 6 em `agenda.spec` (futuro/passado/sem prazo/certidão/OUTRA/ordenação) + suíte cheia (230). E2e local: propostas → 2 eventos entrega (com link), +certidão = 3, ordenados, ambos os tipos.

### Início (Home) — personalização por município
> Origem: conversa 02/07/2026. Hoje "região do usuário" = só a `uf` do cadastro (`User.uf`); a Home usa a UF inteira pra tudo (contagem, lista, destaque). Ideia: deixar o usuário refinar a região escolhendo os municípios onde atua/tem interesse, **sem** trocar a captação (que continua por UF, arquitetura fixa §3.3/T-18) nem restringir a busca manual (que já filtra por UF ou município livremente, T-81, e continua assim).
- [ ] **T-94 — Município(s) de atuação do usuário (preferência opcional)** 🟡
  - Usuário escolhe um ou mais municípios de interesse, complementando a `uf` (não substitui). Se não configurar nenhum, tudo cai no comportamento atual (UF inteira) — sem fricção nova no cadastro.
  - Backend: tabela `user_municipios` (N:N, FK `users.id` + `municipios.codigoIbge`, `ON DELETE CASCADE`); endpoint pra ler/gravar a preferência (provável `users` module, junto de `GET/PUT /users/me`). A captação orientada à demanda (T-18/`findDistinctUfs`) continua disparando por **UF** — derivar o conjunto de UFs a partir dos municípios escolhidos (união com a `uf` de cadastro), sem mudar a granularidade do job.
  - Front: seleção de município(s) reaproveitando `useMunicipios`/`GET /geo/municipios` (T-81 já usa isso no painel de busca). Onde mora a tela é decisão em aberto — candidatos: Onboarding ou aba "Dados da empresa" de Configurações (ambas mock hoje, §7); **não mexer nessas telas fora desta task**.
  - **Dependência:** T-10 (base municípios), Épico A.
  - **Pronto quando:** o usuário salva 1+ municípios, a preferência persiste e volta em `GET /users/me`.
- [ ] **T-95 — Home ("Melhor obra pra você hoje" + "Obras pra você hoje") prioriza aptidão + município** 🟢
  - Troca o critério dos DOIS blocos da Home que hoje são só recência por UF: o **card de destaque** (`recentes[0]`) e a **lista "Obras pra você hoje"** logo abaixo (`recentes.slice(1,4)`). Ambos saem da mesma consulta (`useEditaisSearch({ uf, page:1, pageSize:4 })`, sem olhar veredito/prazo/município).
  - **Regra (ordem exata):** busca os editais da UF do usuário → se ele tiver município(s) configurados (T-94), filtra pra só esses (`codigoIbge`, já suportado por `GET /editais`, T-81); ordena o conjunto priorizando **veredito "apto"** primeiro e **recência** como desempate. O **destaque** é o 1º dessa ordem; a **lista** são os próximos. Se nenhum for apto, tudo cai pra recência pura (comportamento de hoje). Sem município configurado → mesma regra rodando sobre a UF inteira (não muda nada pra quem não configurou T-94).
  - **Nuance a decidir na implementação:** a Home hoje só busca `pageSize: 4` — insuficiente pra "procurar aptos" e ainda encher destaque + 3 linhas. Buscar um conjunto maior (ex.: `pageSize` maior só pra ranquear na Home) e então fatiar destaque/lista. Cálculo é seleção/ordenação sobre dado já exposto pela API (veredito/prazo/município já vêm no `EditalListItem`, T-82) — sem endpoint novo. O "Ver todas as N" e o `regiaoCount` continuam apontando pra busca da UF inteira.
  - **Dependência:** T-94, T-81, T-82.
  - **Pronto quando:** com município(s) configurados, destaque e lista mostram primeiro os editais aptos daqueles municípios (recência como desempate); sem apto, caem pra recência; sem município configurado, comportamento idêntico ao atual.
- [ ] **T-96 — Ordenar e limitar o "Precisa da sua atenção" da Home** 🟢
  - Origem: conversa 02/07/2026. O bloco (`HomePage.tsx`, array `atencao`) hoje concatena 4 fontes reais em ordem FIXA por categoria — certidões vencidas → vencendo → prazos de entrega (≤7d) → propostas em rascunho — **sem ordenar por urgência e sem limite de itens**. Resultado: uma certidão vencendo em 28 dias aparece acima de uma proposta que encerra amanhã, e a lista pode crescer sem corte.
  - **Princípio:** é uma **lista de AÇÃO** (renovar / entregar / continuar rascunho), distinta da Central de Alertas (T-90), que inclui avisos passivos (resumo IA pronto, resultado ganhou/perdeu). **Não fundir os dois** — só parar de duplicar a derivação.
  - **Escopo:**
    - **Ordenar por urgência real** cruzando categorias: chave numérica única = dias até o vencimento/prazo; vencidas fixas no topo (dias negativos). Rascunho (sem data) vai pro fim.
    - **Limitar a ~4 itens** + link "ver tudo". Destino recomendado: **Central de Alertas** (`/alertas`) — é o "lugar de tudo que pede olhar". (Decisão do dono: `/alertas` vs `/agenda`.)
    - **Centralizar a derivação de janelas** compartilhada com os Alertas (T-90) num único lugar, pra as janelas (Home usa prazo ≤7d; Alertas usa ≤14d) não divergirem por descuido. Hoje são dois cálculos client-side paralelos.
  - **Dependência:** T-90 (pro "ver tudo" e a derivação compartilhada), T-91 (agenda, fonte dos prazos).
  - **Pronto quando:** os itens do bloco aparecem em ordem de urgência real (o mais crítico no topo, independente da categoria), a lista é capada com "ver tudo", e a lógica de janela de prazo/certidão vive num só lugar reusado pela Home e pelos Alertas.
  - **Frontend-only provável** (o dado já vem de `useAgenda`/`useCompanyProfile`/`usePropostas`); sem backend novo se a derivação continuar no client.
- [ ] **T-97 — Stat cards da Home: eliminar destino/métrica duplicados** 🟢
  - Origem: conversa 02/07/2026. Os 4 stat cards da Home (`HomePage.tsx`, `<StatCard>`) são "Editais na sua região" (→ `/editais`), "Prazos encerrando" (→ `/agenda`), "Prontidão do perfil" (→ `/documentos`) e "Documentos válidos" (→ `/documentos`). **Os dois últimos apontam pro mesmo lugar** e, pior, **medem quase a mesma coisa**: "Documentos válidos" (contagem de certidões não vencidas) é subconjunto do que "Prontidão do perfil" (% de exigências de habilitação atendidas, T-45) já reflete.
  - **Racional:** a jornada do produto (§1) é achar obra → prontidão → resumo → **proposta**; hoje 2 dos 4 cards gastam no estágio prontidão/docs e **nenhum** cobre proposta. Fundir libera um slot pra fechar a jornada, e cada card volta a levar a uma área distinta.
  - **Escopo:**
    - **Fundir** "Prontidão do perfil" + "Documentos válidos" num só: mantém o `%` como número principal e move a contagem de certidões válidas pra subtexto (ex.: "3/5 certidões válidas"); continua → `/documentos`. Nenhum dado perdido, só um slot liberado.
    - **Novo card "Propostas em andamento"** no slot livre → `/orcamentos`. Métrica = propostas em rascunho + enviadas (as "vivas", exclui ganhou/nao_ganhou). Dado já disponível na Home (`usePropostas` já é chamado pro bloco de atenção) — sem fetch novo.
  - **Dependência:** T-46 (prontidão real, já feita), T-84/T-85 (status/lista de propostas, já feitas). Sem backend novo.
  - **Pronto quando:** os 4 cards levam a 4 destinos distintos (`/editais`, `/agenda`, `/documentos`, `/orcamentos`), o card de prontidão exibe o % + a contagem de certidões, e o card de propostas mostra a contagem de propostas em andamento.

### Login (opcional — só se for decisão de produto)
- [ ] **T-92 — Autenticação por WhatsApp/código (OTP)** 🟢
  - O Figma do login usa WhatsApp + código; hoje é e-mail+senha (que funciona bem). Só entra se o produto quiser.
  - **Dependência:** Épico A.

---

## Épico 8 — Prontidão para lançamento (go-to-market)

> Origem: **auditoria completa do projeto (02/07/2026)** — 4 frentes em paralelo (segurança/ops do backend, UX do front, cobertura de testes, completude de produto). Conclusão: **o núcleo funciona** (buscar → aptidão → resumo/diagnóstico IA → montar/exportar proposta, com backend real e ~248 testes), mas faltam as peças de **negócio, aquisição, legal e operação** que separam "demo" de "SaaS vendável". Vários bloqueadores **não tinham task** — este épico os registra. Prioridade: **A** = impede lançar comercialmente; **B** = lançar assim é arriscado/incompleto; **C** = qualidade/melhoria.

### A — Bloqueadores duros (antes de qualquer cliente pagante)
- [ ] **T-100 — Cadastro self-service na web** 🔴 **(A)**
  - O backend tem `/auth/register` real (UF obrigatória, CNPJ, porte), mas o front **não tem tela nem botão de cadastro** — `LoginPage` só faz login e `lib/api.ts` não tem `register()`. Um empreiteiro novo não consegue criar conta → não há funil de aquisição.
  - Escopo: página/rota de cadastro + `register()` no client + `auth-context` expõe cadastro + validações (senha, CNPJ opcional, UF) + redirecionar pro onboarding (T-108) após criar.
  - **Dependência:** Épico A (backend já pronto).
  - **Pronto quando:** um usuário sem conta se cadastra pela web, é logado e cai no onboarding.
- [ ] **T-101 — Recuperação de senha + infra de e-mail transacional** 🔴 **(A)**
  - Não há "esqueci a senha" nem confirmação de e-mail, e **nenhuma lib de e-mail** no projeto. Cliente que esquece a senha fica travado. A infra de e-mail aqui é também pré-requisito das notificações reais (T-103).
  - Escopo: provedor de e-mail transacional (decisão do dono: Resend/SES/SendGrid/Postmark…), fluxo forgot/reset com token expirável, opcional confirmação de e-mail no cadastro. **NÃO instalar dependência sem aprovar (§4.2).**
  - **Dependência:** —.
  - **Pronto quando:** o usuário recupera a senha por e-mail com token de uso único e expiração.
- [ ] **T-102 — LGPD: termos, privacidade, consentimento e direitos do titular** 🔴 **(A)**
  - O produto guarda CNPJ, dados da empresa e **PDFs de certidões fiscais/trabalhistas/CAT em `bytea`** (dado sensível) sem base legal, sem consentimento no cadastro, sem exportação/exclusão de dados. Coletar isso no Brasil sem isso é risco legal direto. Hoje só há menção a "Termos/Privacidade" num HTML de marketing não-embarcado, sem link.
  - Escopo: Termos de Uso + Política de Privacidade (páginas reais), checkbox de consentimento no cadastro (T-100), e caminho para exportar/excluir dados do titular. (Texto jurídico é decisão do dono; aqui é o encaixe no produto.)
  - **Dependência:** T-100.
  - **Pronto quando:** o cadastro exige aceite, os documentos estão publicados e há como o titular pedir exportação/exclusão.
- [ ] **T-108 — Onboarding real (persistir + rotear após cadastro)** 🔴 **(A)**
  - `OnboardingPage` é casca 100% mock (CNPJ/nome/cidade hardcoded), não persiste nada e é praticamente inalcançável (só via "Refazer configuração"); o login novo cai direto em `/`. "Selecionar arquivos" é botão morto.
  - Escopo: ligar aos endpoints reais (perfil/região/certidões), persistir de fato, e rotear o usuário recém-cadastrado (T-100) pra cá. Casa com a preferência de município (T-94).
  - **Dependência:** T-100, T-94, T-40/T-41 (perfil).
  - **Pronto quando:** o usuário novo passa por um onboarding que grava região/perfil e o leva à Home configurado.

### B — Lançar assim é arriscado/incompleto (fechar antes de escalar)
- [ ] **T-103 — Envio real de notificações (e-mail/WhatsApp)** 🔴 **(B)**
  - Os toggles WhatsApp/e-mail (T-89) persistem, mas **nada dispara** — Alertas (T-90) e Agenda (T-91) são pull-only (só quem loga vê). O valor central "te avisamos de obra/prazo/certidão" não existe fora da tela, e o toggle "WhatsApp" é promessa falsa.
  - Escopo: job que deriva os alertas (reusa T-90) e envia por e-mail (T-101) e/ou WhatsApp (provedor a decidir); respeitar as preferências e não duplicar. Depende de captação/cron confiável (T-106).
  - **Dependência:** T-90, T-101, T-106.
  - **Pronto quando:** uma certidão vencendo / prazo próximo gera e-mail (ou WhatsApp) real conforme as preferências do usuário.
- [ ] **T-104 — Hardening de segurança do backend** 🔴 **(B)**
  - Achados da auditoria, todos sem cobertura hoje: **(a)** sem rate limiting nos endpoints de auth (`/auth/login|register|refresh`) — brute force + exaustão de CPU no bcrypt; **(b)** download de PDF **sem cap de tamanho** em `documento-texto.service.ts:30-40` (risco de OOM no free tier 512MB; o irmão `planilha-texto.service.ts` já tem cap de 40MB — replicar); **(c)** sem **validação de env no boot** (`app.module.ts` sem `validationSchema`) — deploy fica "verde" mas auth/CORS quebram, e cai em defaults `obrapub`/`localhost`; **(d)** OpenAI sem timeout explícito (segura a conexão HTTP por minutos); **(e)** `refresh_tokens` cresce sem purga (só marca `revoked`).
  - Escopo: `@nestjs/throttler` (aprovar dep §4.2), cap+Content-Length no download de PDF, `validationSchema` fail-fast no boot, timeout no client OpenAI, purga periódica de tokens expirados/revogados.
  - **Dependência:** —.
  - **Pronto quando:** auth throttled, PDF com teto, boot falha rápido se faltar env, OpenAI com timeout e tokens velhos purgados.
- [ ] **T-105 — Fim das degradações silenciosas de erro no front** 🟡 **(B)**
  - Vários pontos violam a regra dos 3 estados (§4.4) mostrando erro como "vazio": **Alertas** (`AlertasProvider` engole o erro → "Nenhum alerta") e **Salvos** (`FavoritesProvider` → "Você não salvou nada", como se tivesse perdido os favoritos); o **editor de orçamento** salva preço/BDI/status/cronograma **sem `catch`** (falha silenciosa no caminho crítico); **"Montar proposta"** (`EditalDetailPage`) e a **Agenda** (sem retry) também. (A Home já foi corrigida nesta sessão.)
  - **Dependência:** —.
  - **Pronto quando:** cada um desses mostra erro + "tentar de novo" em falha, em vez de estado vazio.
- [ ] **T-106 — Operação de produção (sair do free tier + backup + observabilidade)** 🔴 **(B)**
  - Render free hiberna (cron de captação e pré-computação IA não confiáveis — hoje dependem de cron externo ainda não configurado); **Postgres free expira ~30 dias sem backup** (dívida §10.2); **zero observabilidade** (sem Sentry/APM — cego a falhas em prod).
  - Escopo: plano pago (ou keep-alive externo como paliativo), rotina de backup do Postgres, e monitoramento de erros (Sentry ou equivalente). Decisões de custo/infra do dono.
  - **Dependência:** —.
  - **Pronto quando:** a API não hiberna, há backup automático do banco e erros de prod são capturados/alertados.
- [ ] **T-107 — Revalidar acerto da IA em amostra maior no provider de produção** 🟡 **(B)**
  - §3.4 exige medir a taxa de erro antes de confiar. `gpt-5.4-mini` passou no spike com **n=5** (T-48); para um diagnóstico onde "errado é pior que nada", a amostra é fina e o próprio `spikes/RESULTADOS.md` pede revalidar em amostra maior. Vale para exigências (T-49), resumo (T-50) e itens (T-64).
  - **Dependência:** —.
  - **Pronto quando:** há medição de acerto em amostra maior (ex.: 20–30 editais reais) documentada, com o modelo que está em produção.

### C — Qualidade / melhoria (junto ou depois)
- [ ] **T-109 — Fechar lacunas de teste críticas** 🟡 **(C)**
  - Backend: `itens-extracao.service` **não tem spec nenhum** (manipula IA + cache; falta a regressão do "1 chamada de IA por edital" que o irmão `exigencias.service` tem); `ia-extracao.service` (cálculo de custo USD §3.4, refusal, truncagem) sem teste; parsing XLSX de `planilha-texto` (regex) sem teste. Front: só `format` tem teste — falta o cliente HTTP (coalescência de refresh + retry 401, o ponto mais arriscado), parse do "colar itens"/`parseNum` e fechamento de 100% do cronograma; sem `@testing-library/react` (nenhum teste de componente).
  - **Dependência:** —.
  - **Pronto quando:** os pipelines de IA (itens/custo) e o refresh/401 do client têm testes; parsing XLSX e parse de itens cobertos.
- [ ] **T-110 — Correções rápidas de front + bugs latentes** 🟢 **(C)**
  - Lote barato: **`public/manifest.webmanifest`** ainda "ObraPública" + `theme_color` errado (leftover do rebrand PrumoLicita — app instalado apareceria com nome/cor errados); **`AuthProvider` desloga em QUALQUER erro de rede no boot** (deveria só em 401 real — um blip expulsa o usuário); guarda de divisão por zero em `ProntidaoPanel` (`total:0` → `NaN`); botões mortos ("Convidar membro", "Editar perfil", "Selecionar arquivos"); `window.confirm` → modal de marca em `DocumentosPage`; `SimpleGrid cols={3}` fixo (não responsivo). Backend (bugs latentes): `habilitacao-checks` monta data em fuso local (off-by-one se o TZ do servidor mudar); parsing de data/número serial do XLSX pode entregar valor errado à IA; `reordenarItens` sem transação (ordem parcial em falha).
  - **Dependência:** —.
  - **Pronto quando:** manifest corrigido, logout só em 401, guardas de null/zero e transação na reordenação; itens de a11y ajustados.

### D — O lançamento em si (além do código do app)
> Origem: relatório de 02/07/2026 — camada que nenhuma task cobria. Nota: o lado **empresarial** (CNPJ da operação, emissão de nota fiscal da assinatura, contrato) é do dono e não vira task de código; fica registrado como pré-requisito do lançamento pago junto com T-88.
- [ ] **T-121 — Landing page pública + domínio próprio** 🟡 **(A)**
  - O produto não tem porta de entrada pública: existe material de marketing em `novo design/` (HTML), mas nada publicado; sem domínio próprio/DNS. Sem landing, o cadastro (T-100) não tem de onde receber gente.
  - Escopo: publicar a landing (site estático), domínio (decisão do dono — ex.: prumolicita.com.br) com DNS apontando landing (www) e app (app.), CTA pro cadastro, links de Termos/Privacidade (T-102). Encaixa no blueprint do Render junto com a T-120.
  - **Dependência:** T-100, T-102, T-120.
  - **Pronto quando:** uma URL pública apresenta a proposta de valor e o CTA leva ao cadastro funcionando.
- [ ] **T-122 — Canal de suporte + ajuda mínima** 🟢 **(B)**
  - Cliente pagante vai ter dúvida/problema e hoje não há canal nenhum. Escopo: e-mail de suporte (ou WhatsApp — decisão do dono), link "Ajuda" visível no app, FAQ mínimo (5–10 perguntas: de onde vêm os editais, o que é a prontidão, limites da IA, cobrança).
  - **Dependência:** —.
  - **Pronto quando:** o usuário encontra dentro do app como pedir ajuda e a mensagem chega a alguém.
- [ ] **T-123 — Beta fechado com empreiteiros reais** 🔴 **(A)**
  - **O produto nunca foi usado por um usuário real** (§7). Nenhuma auditoria substitui 5–10 empreiteiros de verdade usando por 2–4 semanas — é o beta que gera a lista final do lançamento.
  - Escopo: recrutar 5–10 empreiteiros (rede do dono), acesso gratuito, roteiro leve de acompanhamento (o que buscaram, onde travaram, o que pediram), triagem do feedback em tasks priorizadas. **Pré-requisitos mínimos** (não precisa de billing/WhatsApp): T-100/T-108 (entrada), T-114/T-116/T-117 (produto que não mente), T-104/T-105/T-120 (segurança/deploy), T-106 (infra que não hiberna), T-102 (termos).
  - **Dependência:** as acima.
  - **Pronto quando:** ≥5 usuários reais completaram a jornada (buscar → aptidão → proposta) e o feedback virou tasks priorizadas no backlog.
- [ ] **T-124 — Métricas de produto (ativação, retenção, uso)** 🟡 **(B)**
  - Sem telemetria o lançamento é cego: não dá pra saber se usuários ativam, retornam ou onde abandonam — nem medir o beta (T-123).
  - Escopo: decisão do dono sobre ferramenta (Plausible/Umami/PostHog — atenção à LGPD/T-102; sem vendor, mínimo viável = eventos no próprio banco); instrumentar a jornada (cadastro, 1ª busca, edital aberto, resumo IA, proposta criada/exportada); leitura simples (query ou painel).
  - **Dependência:** T-100; T-102 (consentimento conforme a ferramenta).
  - **Pronto quando:** dá pra responder "quantos ativaram esta semana e em que passo abandonam".

---

## Épico 9 — Aprofundar o diferencial (valor pós-núcleo)

> Origem: conversa 02/07/2026 sobre o que agrega valor. Bússola: o diferencial (§1) é **diagnóstico de prontidão + tudo nascendo do edital específico** — captação é commodity. Estas tasks aprofundam esse fosso usando dados que o produto **já tem**. (Candidata futura anotada, sem task: inteligência de resultado/preço via PNCP — quem ganhou e por quanto na região, desconto médio vencedor. Exigiria spike próprio no conector, estilo T-01/T-03.)

- [ ] **T-111 — Guia de regularização: transformar "não apto" em "como ficar apto a tempo"** 🟡
  - Hoje o diagnóstico (T-45/T-51) diz "falta CNDT" e para aí. O pulo de valor: para cada certidão faltante/vencida, mostrar **onde emitir** e cruzar com o prazo do edital — converte o momento mais frustrante do produto no de maior valor. Nenhum concorrente guia o empreiteiro assim.
  - **Escopo:**
    - **Catálogo de regularização** por `CertidaoTipo` (centralizado, espírito §3.3): órgão emissor + link de emissão + observação de prazo. CND_FEDERAL → RFB, FGTS (CRF) → Caixa, TRABALHISTA (CNDT) → TST — emissão online **imediata se a situação estiver regular** (o catálogo deve dizer isso honestamente: "se houver pendência, a regularização pode levar semanas"). ESTADUAL → Sefaz da UF, FALENCIA → TJ/e-SAJ da UF (link por UF quando viável), MUNICIPAL → prefeitura (orientação genérica), REGISTRO_CONSELHO → CREA da UF/CAU.
    - **Cruzamento com o prazo do edital** no diagnóstico específico: para cada pendência, "a sessão é em N dias" + urgência. Cálculo no backend decorando a resposta do diagnóstico; front só renderiza (§3.3).
    - **Onde aparece:** semáforo da prontidão genérica (`ProntidaoPanel`), diagnóstico específico no detalhe do edital, e os cards "Renovar" (Home/Alertas) passam a linkar direto pra emissão.
  - Sem IA, sem dependência nova — catálogo estático + dado que já existe.
  - **Dependência:** T-44/T-45/T-51 (feitos).
  - **Pronto quando:** toda pendência de certidão mostra onde emitir (link) e, no contexto de um edital, se dá tempo de regularizar antes do prazo.
- [ ] **T-112 — Datas-chave do edital (sessão, visita técnica) na Agenda** 🟡
  - A T-91 registrou "sessão/impugnação/visita técnica não são captadas" — mas a extração de exigências/resumo **já extrai `datasChave`** (evento + quando) e guarda no cache (`exigencias.types.ts:54-59`, prompt em `ia-extracao.service.ts:48`). O dado existe para todo edital analisado; a Agenda não o usa. "Visita técnica obrigatória amanhã" é alerta que evita desclassificação.
  - **Nuance honesta (por que não é só plumbing):** `DataChave.quando` é **string livre** ("12/07/2026 às 09h", "facultativa"), não data estruturada. Escopo inclui um **parser best-effort determinístico** (regex dd/mm/aaaa ± hora, função pura testável): datas parseáveis e futuras viram eventos da agenda (tipo novo, ex. `data_edital`, com o rótulo do evento); não parseáveis seguem aparecendo só no ResumoIA (nada se perde). Mesmo recorte da T-91 (editais salvos/com proposta). **SEM IA nova — só lê o cache (§3.4).**
  - **Não fazer agora:** estruturar a data no schema da extração (mudaria prompt/schema → revalidação §3.4 obrigatória). Parser primeiro; se o acerto do parser se mostrar ruim na prática, aí sim avaliar a mudança de schema junto com a T-107.
  - **Dependência:** T-91 (agenda, feita), T-49/T-50 (cache, feitos).
  - **Pronto quando:** editais salvos/com proposta já analisados mostram sessão/visita técnica (quando parseáveis) na Agenda, ordenadas junto dos demais prazos.

---

## Épico 10 — Correção de domínio e confiança no dado (auditoria profunda 02/07/2026)

> Origem: **2ª auditoria** (4 frentes: correção de domínio/produto, integridade do pipeline, cliente/deploy, motores do caminho do dinheiro). A 1ª auditoria (Épico 8) achou o que falta **em volta** do produto; esta achou onde **o próprio produto mente** — a captação exclui o mercado do público-alvo, editais mortos ficam "vivos", o veredito de aptidão afirma "apto" errado, e a proposta pode subestimar valor em silêncio. **T-113 e T-114 são mais importantes que a maioria do Épico 8** — atacam a promessa central. Verificados e OK (sem task): conteúdo da IA 100% escapado no front; source maps não expostos; lógica de watermark correta nos cenários difíceis; crescimento do banco ok por anos (acelerador real é o bytea de certidões, ~10MB/usuário); ruído do favor-recall ~0 hoje (97,8% is_obra dentro de Concorrência).

### Cobertura e verdade do dado (o produto mostra as obras certas?)
- [ ] **T-113 — Spike: pregão + dispensa eletrônica (modalidades PNCP 6/7/8) — medir a lacuna de cobertura** 🔴
  - `PNCP_MODALIDADES = [4, 5]` (só Concorrência). Pela Lei 14.133: **serviços comuns de engenharia** (manutenção, reforma, recapeamento, calçamento, drenagem — o feijão-com-arroz do pequeno municipal) vão por **pregão** (6/7), e obras/serviços até ~R$ 120k (art. 75, I) saem por **dispensa eletrônica** (8). Contradições internas: o preset **"Até R$ 80 mil (ME/EPP)"** filtra uma faixa em que obra quase nunca é concorrência (base estruturalmente vazia); e o catálogo de inclusão do classificador existe pro passo "obra fora dessas modalidades" — **código morto**, o conector nunca entrega outra modalidade. Nenhum spike mediu 6/7/8.
  - Escopo: espelho do T-02 — rodar as keywords de inclusão existentes sobre pregão/dispensa (SC, 30d), contar quantos são obra/serviço de engenharia, medir ruído. **Só medir**; expandir a captação é decisão posterior com o dado na mão (e exigirá refinar a inclusão — 'implantacao'/'infraestrutura' sozinhas pegam TI).
  - **Dependência:** — (spike isolado, estilo T-01/T-03).
  - **Pronto quando:** há número documentado de oportunidades/mês perdidas por modalidade e uma recomendação fundamentada de expandir ou não.
- [ ] **T-114 — Re-sincronizar situação/prazo dos editais abertos (edital morto não é oportunidade)** 🔴
  - **Dois agentes convergiram:** a consulta é por janela de **publicação** com overlap de 2d — anulação/revogação/prorrogação acontece semanas depois e **o registro nunca é revisitado** (`situacao`/`prazoProposta` congelam; o `hasChanged` do upsert é letra morta fora do overlap). A busca não filtra situação, o card não a exibe, e a **agenda transforma prazo de edital anulado em evento de entrega**. Republicação gera novo `numeroControlePNCP` → o usuário vê a obra 2× e pode propor na versão morta. O empreiteiro pode gastar dias em licitação morta — falha de confiança de primeira ordem.
  - Escopo: passe periódico consumindo **`/v1/contratacoes/atualizacao`** do PNCP (por dataAtualizacao) sobre editais com prazo aberto (validar o endpoint num mini-spike primeiro); busca/agenda/alertas excluem (ou marcam claramente — decisão do dono) anulado/revogado/encerrado; **fix do `sort=prazo`** (hoje ASC puro entrega os prazos passados primeiro — a ordenação de urgência começa pelos mortos) e/ou filtro "somente abertos"; pré-computação de IA deixa de gastar OpenAI em edital morto.
  - **Dependência:** Épico 2.
  - **Pronto quando:** edital anulado some (ou é marcado) na busca/agenda/alertas, prorrogação atualiza o prazo, e `sort=prazo` mostra urgência real.
- [x] **T-115 — Valor sigiloso → null + inclusão vence exclusão no classificador** 🟢
  - **(a)** Orçamento sigiloso (art. 24) chega do PNCP com `valorTotalEstimado = 0` → o front mostra "R$ 0" e o filtro de faixa inclui a obra milionária **dentro** de "Até R$ 80 mil". Mapper: sigiloso/0 → `null` (a busca já trata null como favor-recall e o front como "Não informado"). O indicador `orcamentoSigilosoCodigo` está no `rawPayload`, não tipado.
  - **(b)** A exclusão roda **antes** da inclusão no classificador (`obra-classifier.ts:31`) e derruba obra real: "dragagem e **limpeza** de canais", "construção da sede da **Vigilância** Sanitária", "obra com **locação** de equipamentos" → não-obra. Contradiz o favor-recall declarado (§3.3). Inverter: inclusão > exclusão (exclusão só decide sem keyword de inclusão presente).
  - **Feito (2026-07-06):** **(a)** `mapValorEstimado` no `pncp.mapper.ts` — `valorTotalEstimado` null/0/negativo → `null` (cobre sigiloso e dado inconsistente); `orcamentoSigilosoCodigo`/`orcamentoSigilosoDescricao` tipados em `pncp.types.ts`. **(b)** classificador reordenado para **inclusão → exclusão → modalidade** (antes exclusão → modalidade → inclusão): inclusão vence exclusão e a exclusão só decide sem palavra de inclusão. `'dragagem'` somado ao catálogo de inclusão (obra de engenharia) pro exemplo "dragagem e limpeza" passar por inclusão. **Nada de migration** (só mapper/classificador). Ordem preserva os testes existentes (incl. "Locação de veículos" segue não-obra) e mantém a lista de exclusão viva. +5 testes (3 exemplos no classifier, sigiloso/negativo no mapper); suíte 253 verdes, lint limpo. **Sem verificação ao vivo** (mudança pura, sem banco).
  - **Dependência:** —.
  - **Pronto quando:** valor sigiloso aparece como "Não informado" e não entra em faixas; os exemplos acima classificam como obra (testes). ✅

### Veredito de aptidão (o diferencial não pode mentir)
- [x] **T-116 — Corrigir os furos do diagnóstico que afirmam "apto" errado** 🔴
  - **(a) Capital social percentual ignorado:** a IA extrai `percentualSobreEstimado` (`exigencias-schema.ts:91`) e **nenhum código consome** — "capital mínimo de 10% do estimado" (redação comuníssima) vira `valorMinimoReais: null` → ramo "sem mínimo" → **apto** pra quem seria inabilitado. O `valorEstimado` do edital existe pra fazer a conta (percentual × estimado).
  - **(b) "Apto" com zero verificações:** se todas as exigências caem em observações (garantia, índices, OUTRA), `itens = []` → apto com percentual 0 — e entra no filtro "só onde estou apto" e no badge (T-82). Decidir o veredito honesto (ex.: sem veredito, ou "quase" com aviso "nada verificável").
  - **(c) Menores:** tipo de certidão duplicado na saída da IA conta 2× no percentual (e gera keys duplicadas no front); certidão vencida "esconde" outra sem data do mesmo tipo (dá 'nao_atendido' onde sozinha daria 'atencao').
  - **Registrado como simplificação conhecida (decidir se entra):** capacidade técnica aceita **qualquer** atestado (não compara com a descrição exigida) e registro não distingue CREA vs CAU — ambos empurram pra apto.
  - **Feito (2026-07-06):** **(a)** `diagnosticarEdital` recebe `valorEstimado` (4º arg, após `now` pra não quebrar chamadas posicionais) e `resolverCapitalMinimo` cruza `percentualSobreEstimado × valorEstimado`; encanado nos 3 call sites (`getDiagnosticoEdital` carrega o edital, `getEditaisAptos` usa `c.edital.valorEstimado`, `aptidao.vereditosPara` faz join na relação `edital`). Se exige % mas o estimado é `null` (comum pós-T-115) → `atencao` ("confira manualmente"), nunca falso `atendido`. **(b)** novo veredito **`indefinido`** (decisão do dono, 06/07) quando `total === 0` — fora do filtro "estou apto" (T-53) e do badge de apto; front ganhou o estado nos 4 mapas de veredito + na union (`EditalCard`, `HomePage`, `SalvosPage`, `DiagnosticoEdital`, `types/edital.ts`). **(c)** dedup por tipo de certidão no motor; `avaliarCertidao` passa a escolher o **melhor status** entre todas do tipo (vencida não esconde sem-data). **Simplificações (capacidade técnica / CREA×CAU) ficaram de fora** (follow-up). **Sem migration.** +7 testes (capital %/indeterminado/dedup no diagnóstico, vencida-vs-sem-data na prontidão, `indefinido` nos services); suíte **257 verdes**, lint API+front limpos, tsc do front OK. ⚠️ **Falta sign-off no navegador** do badge `indefinido` (§4.4) — mudança verificada por unit/tsc, não por clique.
  - **Dependência:** T-45/T-51 (feitos).
  - **Pronto quando:** capital percentual é cruzado com o estimado, "apto" exige ≥1 item verificável, duplicatas não inflam o percentual — com testes de cada cenário. ✅

### Caminho do dinheiro (proposta)
- [x] **T-117 — Correção do caminho do dinheiro na proposta** 🔴
  - **(a) Item com preço e SEM quantidade soma R$ 0 em silêncio** — e `itensSemPreco` diz "completa" (`calculo.ts:72-77`); proposta subestimada em dezenas de milhares sem aviso. **Interage com o fix de hoje** (`itens-filtro` normaliza qtd 0→null de propósito): precisa de um contador/aviso de "itens incompletos" (com preço × sem quantidade) no cálculo e no editor.
  - **(b) Nenhuma transição de status é validada e proposta ENVIADA/GANHOU é 100% editável** — editar item de proposta ganha muda retroativamente o "faturado em obra"; `rascunho→ganhou` direto passa; não há registro imutável do que foi enviado. Escopo: validar transições no backend + travar edição de itens/BDI fora de rascunho (ou snapshot do enviado — decisão do dono).
  - **(c) Cronograma: soma das etapas ≠ valor global** por arredondamento independente (R$ 100,10 × 33,33/33,33/33,34 → 100,09) — apontável por comissão; resíduo na última etapa resolve.
  - **(d) Import de itens não-idempotente:** 1ª chamada é lenta (IA) → timeout+retry = planilha duplicada (e `nextOrdem` read-then-write pode duplicar ordem). Guarda: recusar/ignorar se a proposta já tem itens importados.
  - **(e) Menores:** injeção de fórmula no CSV (neutralizar células iniciando com `=`,`+`,`-`,`@` — a descrição vem de PDF via IA); `null` atravessa `@IsOptional` e vira 500 (`{"status": null}`); "100% do teto / 0%" exibido quando a proposta **estoura** o teto (arredondamento inteiro mascara a desclassificação); aritmética em centavos inteiros pra matar o meio-centavo (qtd 4dp × preço 2dp).
  - **Feito (2026-07-06):** **(a)** `calcularProposta` ganhou `incompleto` por item (tem preço, sem qtd útil) e `itensIncompletos` no total — expostos na lista e no detalhe; editor mostra aviso vermelho. **(b)** mapa de transições (`isTransicaoValida`) — para frente um passo (mata `rascunho→ganhou`), volta a rascunho sempre liberada (escape hatch); `update` valida a transição e **trava** BDI/teto/cronograma fora de rascunho; mutações de item (`add/update/remove/bulk/reordenar/importar`) exigem rascunho via `getRascunho` (400). **Decisão do dono: travar** (não snapshot). **(c)** resíduo de arredondamento na última etapa do cronograma (Σ fecha exato; sub/super-alocação preservada). **(d)** import idempotente: guard `inFlight` por proposta + recusa (409) se já tem itens; ordem começa em 0 (proposta vazia). **(e)** CSV: prefixo `'` em célula iniciando com `= + - @`; DTO usa `@ValidateIf` (não `IsOptional`) em `status`/`titulo` → `null` vira 400, não 500; comparação com teto força ≥101%/≤−1pp ao estourar; subtotal em **centavos inteiros** (qtd 4dp × preço 2dp). **Front mínimo:** editor read-only fora de rascunho (controles desabilitados + banner), aviso de itens incompletos, tratamento do 409. **Sem migration.** +17 testes; API **266 verdes**, front tsc/lint/15 vitest verdes. ⚠️ **Sign-off de UI pendente** (§4.4) — verificado por unit/tsc, não por clique.
  - **Dependência:** T-66/T-84 (feitos).
  - **Pronto quando:** itens incompletos são sinalizados, transições validadas + enviada travada, cronograma fecha exato, import idempotente — com testes.

### Pipeline e infraestrutura (complementa T-104/T-106 do Épico 8)
- [x] **T-118 — Resiliência da captação (registro-veneno, catches, concorrência, paginação)** 🟡
  - **(a) Registro-veneno congela a UF pra sempre:** `ingestWindow` sem try/catch por registro + mapper sem clamps (data inválida `?? new Date(NaN)`, `valorTotalEstimado` ≥ 10^13 estoura `numeric(15,2)`, `orgaoNome` > 255, UF sem validação) — a mesma linha ruim falha em toda tentativa e a UF para de captar, invisível. Isolar por registro (pular + logar + contar) + clamps/validação no mapper.
  - **(b) O job noturno pode morrer:** `triggerPrecomputeUf` sem `.catch` no `captacao-job.service.ts:39` (unhandled rejection pode **matar o processo**; o disparo análogo da busca tem `.catch`); `runOnce` sem try/catch por UF (uma UF ruim pula as demais da noite).
  - **(c) Concorrência cron × manual × busca na mesma UF:** upsert find-then-save → unique violation aborta a janela; `markSynced` read-modify-write sem lock pode regredir watermark. Serializar por UF (lock) ou `ON CONFLICT` no upsert.
  - **(d) Truncamento silencioso:** resposta sem `totalPaginas` para na página 1 **e o watermark avança** — única classe de falha que perde dado invisível. Reconciliar `processed × totalRegistros`.
  - **(e) Menores:** `hasChanged` não compara `rawPayload` (o payload "pra reprocessar depois" estagna); `formatPncpDate` usa data local do servidor (overlap encolhe de 2d pra ~1d perto da meia-noite UTC); dedup in-memory (`inFlight`) quebra com 2+ instâncias — dupla chamada de IA no overlap de deploy (pré-condição de escala: mover pro banco); **papercut GIN triplicou** (~15 statements destrutivos por `migration:generate` — 3 índices SQL-cru + 11 FKs só nas migrations); a defesa automática (§10.1) segue pendente.
  - **Dependência:** Épico 2.
  - **Feito (2026-07-06):** **(a)** `mapPncpRecord` clampa strings ao tamanho da coluna (orgaoNome/municipioNome 255, cnpj 14, ibge 7, modalidadeNome 100) e zera valor > `numeric(15,2)`; `ingestWindow` isola cada registro (try/catch) e **pula** os inválidos (data `NaN`, UF fora das 27 via novo `isUf`) contando `skipped` — uma linha ruim não congela mais a UF. **(b)** `runOnce` com try/catch por UF + `.catch` no `triggerPrecomputeUf` (não derruba o processo). **(c)** upsert trata unique-violation (23505) re-buscando e atualizando (corrida cron×manual×busca não aborta a janela); `markSynced` só avança o watermark, nunca regride. **(d)** `fetchModalidade` reconcilia `emitidos × totalRegistros` e lança se truncou → watermark não avança sobre dado incompleto. **(e)** `formatPncpDate` em UTC (overlap não encolhe perto da meia-noite). **Deixado para depois (documentado):** comparar `rawPayload` no `hasChanged` (jsonb reordena chaves/normaliza números → compare ingênuo causaria churn a cada sync; precisa de serialização canônica); dedup multi-instância no banco (pré-condição de escala); defesa automática do índice GIN (§10.1, exige teste com banco). **Sem migration.** +9 testes; suíte **275 verdes**, lint limpo.
  - **Pronto quando:** linha ruim não para a UF, o job noturno sobrevive a falhas isoladas, captações concorrentes não corrompem watermark, e paginação truncada não avança watermark — com testes. ✅
- [ ] **T-119 — Hardening do cliente e sessão (complementa T-104)** 🟡
  - **(a) Tokens:** refresh de 7 dias em `localStorage` com **zero CSP/helmet nas duas pontas** — um XSS = sessão + cofre de certidões. Decisão do dono: refresh em cookie `httpOnly` (mexe no backend: `/auth/refresh`/`logout` por cookie, `cookie-parser`) **ou** mínimo viável: access só em memória + CSP forte. O que não dá é localStorage + zero CSP juntos.
  - **(b) Headers:** `helmet` na API (dep — aprovar §4.2) + bloco `headers` no static site (CSP, nosniff, frame-ancestors).
  - **(c) Corrida de refresh multi-aba desloga o usuário das duas** (2 abas restauradas → 2 refresh com o mesmo token → rotation revoga → a perdedora apaga o par novo do localStorage) — e **erro de rede no refresh também desloga** (`tryRefresh().catch(() => null)` trata status 0 como inválido; o cold start do Render fabrica isso). Fix: só limpar em 401/403 real; checar se outra aba rotacionou antes de limpar; listener de `storage` (de quebra, logout passa a propagar entre abas).
  - **(d) `linkOrigem` sem validação de scheme** vira `href` (dado de milhares de sistemas municipais; `javascript:` executa) — allowlist http/https no upsert (sanitiza uma vez).
  - **(e) Upload:** magic bytes no backend (`%PDF-` etc. — hoje só mime declarado, contornável por curl) + validação de tamanho no front antes de subir 50MB à toa. Severidade sobe quando T-87/T-88 (multi-usuário) existirem.
  - **Dependência:** T-104 (irmã), Épico A.
  - **Pronto quando:** headers ativos nas duas pontas, refresh resiliente a multi-aba/rede, linkOrigem sanitizado, upload validado por conteúdo.
- [ ] **T-120 — Codificar o deploy do front no `render.yaml` (static site como código)** 🟢
  - O blueprint só tem API + banco; o static site é 100% configuração manual de painel. **Confirmado no bundle buildado:** `VITE_API_URL` ausente → fallback `http://localhost:3000` baked — recriar a infra (rotina: Postgres free expira) sobe o front "verde" apontando pra localhost, falha silenciosa. Rota direta `/editais/xyz` (link compartilhado, F5) → 404 sem rewrite de SPA codificado.
  - Escopo: serviço `static` no `render.yaml` com `envVars` (VITE_API_URL), `routes` (rewrite `/* → /index.html`) e `headers` (casa com T-119b). Bônus barato: `React.lazy` nas páginas pesadas (bundle único de 636 kB — login carrega o editor inteiro; 4G de canteiro sente).
  - **Dependência:** §8.
  - **Pronto quando:** deletar e recriar os serviços do Render a partir do blueprint reproduz o deploy inteiro funcionando, sem passo manual de painel.
