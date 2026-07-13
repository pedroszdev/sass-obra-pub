# CLAUDE.md

> Guia de contexto e regras para o Claude Code neste repositório.
> Leia este arquivo inteiro no início de cada sessão, junto com `BACKLOG.md`.
> **Atualizado em 24/06/2026** — produto-núcleo + diagnóstico de prontidão (IA) concluídos. Próximo foco: Épico 6 (orçamento integrado ao edital).

---

## 1. O que é este projeto

Plataforma SaaS para o **empreiteiro de obra pública**. Ajuda o empreiteiro a encontrar licitações (editais) de obra pública relevantes para a sua região, verificar se está apto a participar, gerar resumo do edital por IA, e (Épico 6) montar a proposta de preço vinculada ao edital.

**Diferencial frente a concorrentes** (ConLicitação, Effecti, Licitei, e — em orçamento — OrçaFáscio): foco **exclusivo em obra pública** + **diagnóstico de prontidão** (dizer ao empreiteiro se ele está apto a uma licitação específica) + tudo nascendo do **edital específico já captado**, não de telas genéricas. Captação é commodity; o diagnóstico e a integração ao edital são o que ninguém faz.

Jornada do produto: **achar a obra → ver se está apto (prontidão) → entender o edital (resumo IA) → montar a proposta (orçamento)**.

---

## 2. Stack técnica

Monorepo gerenciado com **pnpm**.

```
/
├── apps/
│   ├── api/          # Backend — NestJS + TypeORM + PostgreSQL
│   └── web/          # Frontend — Vite + React 18 + TS + Mantine v8 + react-router
├── packages/         # Código compartilhado (tipos) — ver dívida §10
├── CLAUDE.md
├── BACKLOG.md
└── docker-compose.yml
```

- **Backend:** NestJS (modular) + TypeORM + PostgreSQL (Docker em dev). Migrations para toda mudança de schema (nunca `synchronize: true` fora de dev).
- **Frontend:** Vite + React 18 + TypeScript + **Mantine v8** + react-router.
- **IA:** **OpenAI** (gpt-5.4-mini em produção, gpt-5.5 flagship). *(Trocado de Anthropic → OpenAI em 24/06.)*
- **Infra:** Render (API em Docker + Postgres gerenciado), deploy contínuo no push para `main`. Migrations rodam no start (idempotentes).

---

## 3. Arquitetura inegociável

Decisões fixas. **Não as altere sem perguntar.** Se achar que há abordagem melhor, diga antes de implementar.

### 3.1. Padrão de Conector para captação
- Toda fonte de editais implementa a interface comum **`EditalSourceConnector`** (dado um período → retorna editais no formato interno padronizado).
- Adicionar fonte nova = criar nova classe de conector. **NUNCA** acoplar lógica específica de uma fonte fora do conector dela.
- É a decisão que permite crescer em cobertura (Camada 2: Portal de Compras Públicas) sem reescrever a captação.

### 3.2. Modelo de dados
- Entidade central **`Edital`**: campos do PNCP + `isObra` + `rawPayload` (jsonb) + `objetoBusca` (tsvector PT, full-text).
- Deduplicação por **`fonte` + `idExterno`** (= `numeroControlePNCP`) com upsert (só atualiza se mudou).
- Municípios padronizados pelo **IBGE** (5.571 semeados). PNCP fornece `codigoIbge` 100%.
- Índices: `UNIQUE(fonte, idExterno)`, composto `(uf, isObra, dataPublicacao)`, GIN full-text.

### 3.3. Regras de negócio centrais
- **Catálogo de obra** centralizado e configurável (modalidades + palavras inclui/exclui). Não espalhar pelo código.
- Classificação: **favor recall** — na dúvida, marcar como obra (falso negativo é pior que falso positivo).
- Guardar editais **não-obra marcados** (não descartar) — permite reclassificar sem re-buscar.
- **Captação orientada à demanda:** só capta UFs com usuário ativo + UFs buscadas (T-34). Banco enxuto.
- **Cálculo no backend, front só renderiza:** prontidão (T-45) e orçamento (T-66) calculam no servidor, com função pura e `now` injetável. O front nunca recalcula — evita divergência entre tela e sistema.

### 3.4. Regras para uso de IA (Épicos 5 e 6) — FIXAS
A IA (OpenAI) faz: resumo de edital, extração de exigências de habilitação (diagnóstico de prontidão), e extração de itens da planilha (orçamento). Regras inegociáveis:
- **Cache obrigatório:** extrair/resumir custa chamada de API por edital. Guardar o resultado, NUNCA reprocessar o mesmo edital. Registrar tokens + custo (USD) por chamada no banco.
- **Validar acerto antes de confiar:** não mostrar saída de IA ao usuário sem antes medir a taxa de erro em editais reais (spikes estilo T-47/T-48/T-63). Saída de IA errada é PIOR que ausência dela.
- **Validar no provider que está em produção:** se trocar de modelo/provider, refazer a medição de acerto com o que está em prod — não presumir que a validação anterior se transfere.
- **Pré-computar, não on-the-fly:** trabalho de IA sobre muitos editais (ex.: diagnóstico em massa) roda em background pelo job de captação (T-54), nunca na hora da busca.

---

## 4. Regras de comportamento (como você deve trabalhar)

### 4.1. Antes de codar
- **Sempre mostre o plano antes de implementar** qualquer task não-trivial. Liste arquivos a criar/alterar e a abordagem. Espere meu OK.
- Para tasks grandes, use **plan mode** e aguarde aprovação.
- Trabalhe **uma task do `BACKLOG.md` por vez**. Não avance sem eu pedir.

### 4.2. Dependências
- **NÃO instale dependência nova sem perguntar antes.** Diga qual, por quê, e se há alternativa já no projeto. Espere meu OK.
- Prefira o que já está no projeto.

### 4.3. Escopo
- **NÃO refatore fora do escopo da task atual.** Se vê algo que merece refatoração, avise como sugestão.
- **NÃO crie funcionalidades que eu não pedi.**
- Respeite a ordem das camadas nos épicos: as que não usam IA / mais simples vêm primeiro; validar IA com spike antes de construir em cima.

### 4.4. Qualidade
- **Cada task = um commit pequeno e descritivo** referenciando a task (ex.: `feat(api): T-60 entidade Proposta`).
- **Sempre rode lint e testes antes de dizer que terminou.** Conserte o que falhar.
- Escreva testes para a lógica crítica: conectores, dedup, classificação, normalização, busca, extração de IA, cruzamento de prontidão, cálculo de orçamento.
- Trate erros explicitamente em chamadas externas (API PNCP, API OpenAI): timeout, rate limit, resposta inesperada.
- **Sign-off de UI:** telas novas precisam de validação no navegador (clique humano), não só build/lint verdes. Backend testado e2e não prova que a tela funciona na mão do usuário.

### 4.5. Quando tiver dúvida
- **Em dúvida sobre arquitetura ou regra de negócio, PERGUNTE. Não invente.**
- Se uma instrução minha conflita com este arquivo, avise do conflito em vez de escolher sozinho.

---

## 5. Convenções de código
- Código (variáveis, funções, classes) em **inglês**; mensagens ao usuário final em **português do Brasil**.
- Entidades de domínio podem manter termo em português quando não há tradução natural (`Edital`, `Orgao`, `Proposta`). Seja consistente.
- Estilo idiomático do NestJS (módulos, services, controllers, DTOs) e Hooks/componentes funcionais no React.
- DTOs + validação (class-validator) nos endpoints. Nunca confiar em input não validado.
- **Dívida conhecida:** tipos compartilhados hoje vivem no front, deveriam estar em `packages/` (§10). Ao criar tipos novos compartilhados, preferir `packages/`.

---

## 6. Estado atual do projeto (24/06/2026)

**Concluído e em produção:**
- **Épico 0** — Fundação: spikes PNCP validados; repo, backend, deploy no Render.
- **Épico A** — Auth: cadastro/login/refresh/logout + `/users/me` (JWT, refresh rotativo).
- **Épico 1** — Dados: `Edital`, `sync_states`, catálogo de obra, `municipios` (IBGE).
- **Épico 2** — Captação: conector PNCP (paginação, retry/backoff, rate limit), dedup/upsert, filtro de obra, job agendado, monitoramento (`sync_runs`), disparo manual (`POST /captacao/run`), captação sob demanda por busca (T-34).
- **Épico 3** — Busca/API: `GET /editais` (UF, município, valor, período, texto, paginação) + `GET /editais/:id` + índices.
- **Épico 4** — Interface: telas em Mantine; busca e detalhe ligadas à API; login; estados loading/vazio/erro; responsividade + PWA básico; favoritar + Salvos.
- **Épico 5** — Diagnóstico de prontidão + IA: perfil de habilitação (certidões/atestados, PDF em bytea), alerta de vencimento, checklist genérico de prontidão, extração de exigências por IA (com cache + registro de custo), resumo de edital por IA, diagnóstico específico por edital, filtro "só obras em que estou apto", pré-computação em background (T-54).

**Correções recentes (25/06/2026):** datas exibidas no fuso de Brasília (os timestamps vêm UTC e o front mostrava o dia errado em prazos noturnos — `format.ts`); seletor de município passou a listar as 27 UFs via `GET /geo/municipios` (front consome via `useMunicipios`, cache por UF); removidos os campos técnicos (Identificador/Capturado em/Atualizado em) do detalhe do edital; testes do front agora em **vitest**.

**Atualização do backlog (07/07/2026):** criado o **Épico 11 — Monetização** (trial + paywall + gateway Asaas/Pagar.me: T-127–T-131) e a **T-126** (criação/login com Google). Removidas **T-92** (OTP WhatsApp), **T-121** (landing), **T-123** (beta fechado) e **T-124** (métricas). Ver `BACKLOG.md`.

**Próximo:** Épico 6 (orçamento integrado ao edital) — ver `BACKLOG.md`.

---

## 7. Telas mockadas (IMPORTANTE — não são bugs)

Telas que existem como **casca visual mockada, sem backend** — lembrete propositais do que falta. Estado em 24/06:
- Ainda mockadas: **Configurações → aba Equipe & Plano** (placeholder "em breve" honesto até T-87/88). _(Orçamentos: Épico 6; **Agenda**: T-91; **Notificações + Segurança**: T-89; **Alertas**: T-90.)_ **Onboarding** deixou de ser mock (T-108, 07/07): persiste perfil + região/municípios e roteia o recém-cadastrado. **Configurações → Dados da empresa** deixou de ser mock (T-99, 08/07): consome perfil/atestados/municípios reais (read-only, edita no onboarding).
- Já ganharam backend no Épico 5: Documentos (cofre), Prontidão (genérica e específica), Resumo com IA.

**Regras sobre as mockadas:**
- NÃO assuma que estão prontas — são placeholders.
- NÃO as remova nem "conserte" sem ser a task certa do backlog.
- Enquanto mockadas, está tudo bem — o produto ainda não foi mostrado a usuários reais.

---

## 8. Deploy e operação
- API: `https://obrapub-api.onrender.com` — deploy contínuo no push; migrations no start.
- **Render free:** o serviço hiberna (~15 min) → o `@Cron` da captação NÃO é confiável. Por isso existem o endpoint manual (`POST /captacao/run`) e a captação por busca. Postgres free expira ~30 dias.
- **Notificações por e-mail (T-103 + T-135):** `@Cron` diário **+** disparo manual `POST /notificacoes/run` (mesmo token `CAPTACAO_TRIGGER_TOKEN`) — para um cron externo disparar, já que o `@Cron` hiberna. Manda (a) o **resumo de urgência** (certidão vencendo/vencida + prazo próximo, T-103) e (b) a **"melhor obra pra você hoje"** (1 obra APTA nova da região, T-135), só a usuários com e-mail **verificado + toggle ligado**, sem duplicar (tabela `notification_log`, chave estável por alerta/edital). WhatsApp fica pendente de provedor.
- Variáveis a setar no painel em prod: `WEB_ORIGIN` (CORS do front), `CAPTACAO_TRIGGER_TOKEN`, e a chave da **OpenAI** (`OPENAI_API_KEY`).
- **Login com Google (T-126, opcional):** `GOOGLE_CLIENT_ID` na API e `VITE_GOOGLE_CLIENT_ID` no front — **mesmo valor**, o client id OAuth ("Web application") do Google Cloud Console. **Ausente → login social desligado:** o botão não renderiza e `POST /auth/google` responde 503. O produto segue inteiro com e-mail e senha.
- **Login com Google por redirect (T-126b):** entrar/cadastrar não abre popup e **não usa o SDK**. O botão navega para `GET /auth/google/start` (na **API**), que sorteia o nonce, grava o cookie `obrapub_gnonce` e manda o usuário ao Google (`response_type=id_token` + `response_mode=form_post` — sem troca de code, logo **sem client secret**). O Google faz POST do `id_token` em `POST /auth/google/callback`, que confere o nonce, cria a sessão (cookie de refresh) e devolve o navegador em `WEB_ORIGIN/entrando`.
  - **Cadastre no Google Cloud Console**, como *Authorized redirect URI*: `http://localhost:3000/auth/google/callback` (dev) e `https://obrapub-api.onrender.com/auth/google/callback` (prod).
  - **O front precisa do rewrite de SPA** (`/*` → `/index.html`) no static site, senão `/entrando` dá 404.
  - **Por que o fluxo começa na API, e não num fetch do front:** o cookie do nonce só sobrevive se for gravado com a API no topo. Gravado a partir do front (outro site) ele é cookie **de terceiro** — Safari/Firefox o descartam, e o login quebra com "Login com Google expirou". Já aconteceu; não volte a buscar o nonce por fetch.
  - O popup do SDK sobrevive só no Perfil, para reautenticar na exclusão de conta (`POST /auth/google`, JSON).
- **E-mail transacional (T-101):** SMTP vendor-agnostic via `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true`/`false`), `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. **Sem `SMTP_HOST` → log-only** (dev): o e-mail é só logado, não enviado (não quebra o fluxo). Usado no "esqueci a senha" (link com token de uso único, 1h).
- **Teto de custo de IA (T-133, opcionais):** `IA_BUDGET_DAILY_USD` e `IA_BUDGET_MONTHLY_USD` (USD). Ausentes/0 = **sem teto** (comportamento padrão). Ao estourar, os gatilhos de IA respondem 503 e a pré-computação em massa é pulada até o período virar. Gasto acumulado em `GET /captacao/ia-custo` (mesmo token de `CAPTACAO_TRIGGER_TOKEN`).
- **Front:** verificar se o deploy contínuo do static site está configurado antes de contar com telas novas no ar.

---

## 9. O que NÃO fazer / fora de escopo agora
- ❌ Não mexa nas telas mockadas fora da task certa (§7).
- ❌ Não construa a Camada 2 de captação (Portal de Compras Públicas) sem spike próprio.
- ❌ T-16 (Compras.gov.br) está despriorizada — subconjunto do PNCP.
- ❌ **Orçamento (Épico 6): NÃO replicar OrçaFáscio.** Nada de base SINAPI completa (87 mil composições), composições analíticas, BDI decomposto TCU, Curva ABC ou BIM. O diferencial é o orçamento nascer do edital, não profundidade de SINAPI. Começar simples (cálculo direto, BDI percentual). Detalhes em `BACKLOG.md` (Épico 6).
  - **Revisão (30/06/2026, decisão do dono):** o redesign PrumoLicita adotou o frame "Gestor de proposta", que inclui um **cronograma físico-financeiro SIMPLES** (distribuir a obra em meses por percentual). Isso **revoga a antiga proibição de cronograma** — mas só a versão simples (T-93), nunca o cronograma TCU completo/decomposto. O resto da lista acima segue fora de escopo.
- ✅ **Paywall (Épico 11, decisão do dono 07/07/2026):** o produto deixa de ser aberto — o acesso passa a exigir **trial ativo ou assinatura ativa** (não é mais "qualquer cadastrado usa"). O "pode usar?" é decidido **no backend** (§3.3); o front só renderiza o bloqueio. Gateway BR (Asaas/Pagar.me) abstraído por adapter (§3.1). Ainda não implementado — ver `BACKLOG.md` (T-127–T-131).
- ❌ Não instale dependências sem perguntar.
- ❌ Não refatore fora do escopo da task.
- ❌ Não tome decisões de arquitetura sozinho — pergunte.
- ❌ Não use IA sem cache e sem validação prévia de acerto (§3.4).

---

## 10. Dívidas técnicas conhecidas (registradas)
1. **Papercut do índice GIN:** todo `migration:generate` recria um `DROP` do índice GIN (full-text). Removido à mão em cada migration. *Melhoria pendente:* defesa automática (teste que falha se o índice some) em vez de disciplina manual.
2. **Banco crescendo:** captação por busca (T-34) + PDFs em bytea (Épico 5) aceleram o uso do Postgres free. **Task de retenção** (descartar editais/arquivos encerrados/antigos) precisa ser formalizada no backlog — ainda pendente.
3. **Object storage:** PDFs em bytea é o stopgap certo agora; migrar para object storage (S3 etc.) é a evolução quando escalar.
4. **Tipos compartilhados no front, não em `packages/`** (convenção §5 adiada).
5. ~~**Select de município:** usa subconjunto empacotado no front~~ — ✅ **resolvido (25/06/2026):** `GET /geo/municipios?uf=` lista as 27 UFs a partir da base do IBGE; o front consome via `useMunicipios` (cache por UF) e o `data/cidades.ts` foi removido.
6. **PWA básico** (só manifest); offline/instalação completa exigiria `vite-plugin-pwa`.
7. **Classificador "favor recall":** gera algum ruído no banco. Medir o ruído real quando houver usuário vendo os editais.
8. **Custo de IA em produção:** monitorar via o registro de tokens/custo no banco, especialmente quando UFs novas entram e disparam pré-computação em massa.

---

*Mantenha este arquivo atualizado conforme decisões forem tomadas. Ele é a fonte de verdade sobre como trabalhamos neste repo.*
