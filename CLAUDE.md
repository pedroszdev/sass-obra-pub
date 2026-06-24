# CLAUDE.md

> Guia de contexto e regras para o Claude Code neste repositório.
> Leia este arquivo inteiro no início de cada sessão, junto com `BACKLOG.md`.
> **Atualizado em 23/06/2026** — núcleo (captação + busca + UI) concluído; próximo foco: Épico 5 (prontidão + IA).

---

## 1. O que é este projeto

Plataforma SaaS para o **empreiteiro de obra pública**. Ajuda o empreiteiro a encontrar licitações (editais) de obra pública relevantes para a sua região, verificar se está apto a participar, e (em fases futuras) montar propostas, executar a obra e se conectar com profissionais e fornecedores.

**Diferencial frente a concorrentes** (ConLicitação, Effecti, Licitei): foco **exclusivo em obra pública** + o **diagnóstico de prontidão** (dizer ao empreiteiro se ele está apto a uma licitação específica). Captação é commodity; o diagnóstico é o que ninguém faz.

Promessa central da fase atual, já cumprida: *"tem obra na minha região, no meu tamanho, pra eu participar?"* — com dados reais do PNCP.

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
- **Frontend:** Vite + React 18 + TypeScript + **Mantine v8** (biblioteca de componentes) + react-router.
- **Infra:** Render (API em Docker + Postgres gerenciado), deploy contínuo no push para `main`. Migrations rodam no start (idempotentes).

---

## 3. Arquitetura inegociável

Decisões fixas. **Não as altere sem perguntar.** Se achar que há abordagem melhor, diga antes de implementar.

### 3.1. Padrão de Conector para captação
- Toda fonte de editais implementa a interface comum **`EditalSourceConnector`** (dado um período → retorna editais no formato interno padronizado).
- Adicionar fonte nova = criar nova classe de conector. **NUNCA** acoplar lógica específica de uma fonte fora do conector dela. O resto do sistema só conhece o formato padronizado.
- É a decisão que permite crescer em cobertura (Camada 2: Portal de Compras Públicas) sem reescrever a captação.

### 3.2. Modelo de dados
- Entidade central **`Edital`**: campos mapeados do PNCP + `isObra` + `rawPayload` (jsonb) + `objetoBusca` (tsvector PT para full-text).
- Deduplicação por **`fonte` + `idExterno`** (= `numeroControlePNCP`) com upsert (só atualiza se mudou).
- Municípios padronizados pelo **IBGE** (5.571 semeados). PNCP já fornece `codigoIbge` 100%.
- Índices: `UNIQUE(fonte, idExterno)`, composto `(uf, isObra, dataPublicacao)`, GIN full-text.

### 3.3. Regras de negócio centrais
- **Catálogo de obra** centralizado e configurável (modalidades + palavras inclui/exclui). Não espalhar pelo código.
- Filosofia de classificação: **favor recall** — na dúvida, marcar como obra (falso negativo é pior que falso positivo: o empreiteiro nunca fica sabendo da obra que perdeu).
- Guardar editais **não-obra marcados** (não descartar) — permite reclassificar sem re-buscar.
- **Captação orientada à demanda:** só capta UFs com usuário ativo + UFs buscadas (T-34). Mantém o banco enxuto.

### 3.4. Regras para uso de IA (Épico 5 — novo)
A IA entra para o diagnóstico de prontidão e o resumo de edital. **Provider: OpenAI** (decisão do dono em 24/06/2026 — usa a chave OpenAI disponível; modelo flagship atual `gpt-5.5`, structured outputs estritos via JSON Schema). *Antes desta data o plano era a API Anthropic; trocado a pedido do dono.* Regras fixas (valem para qualquer provider):
- **Cache obrigatório:** extrair exigências / gerar resumo custa chamada de API por edital. Guardar o resultado, NUNCA reprocessar o mesmo edital.
- **Validar acerto antes de confiar:** não mostrar diagnóstico/resumo ao usuário sem antes medir a taxa de erro em editais reais (spikes T-47/T-48). Diagnóstico errado é PIOR que diagnóstico nenhum.
- **Pré-computar, não on-the-fly:** filtro de aptidão sobre muitos editais não pode disparar uma chamada de IA por edital na busca. Processar em background.

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
- Respeite a ordem das camadas no Épico 5: as que não usam IA vêm primeiro.

### 4.4. Qualidade
- **Cada task = um commit pequeno e descritivo** referenciando a task (ex.: `feat(api): T-40 perfil de habilitação`).
- **Sempre rode lint e testes antes de dizer que terminou.** Conserte o que falhar.
- Escreva testes para a lógica crítica: conectores, dedup, classificação, normalização, busca, e (Épico 5) extração de IA e cruzamento de prontidão.
- Trate erros explicitamente em chamadas externas (API PNCP, API de IA): timeout, rate limit, resposta inesperada.

### 4.5. Quando tiver dúvida
- **Em dúvida sobre arquitetura ou regra de negócio, PERGUNTE. Não invente.**
- Se uma instrução minha conflita com este arquivo, avise do conflito em vez de escolher sozinho.

---

## 5. Convenções de código
- Código (variáveis, funções, classes) em **inglês**; mensagens ao usuário final em **português do Brasil**.
- Entidades de domínio podem manter termo em português quando não há tradução natural (`Edital`, `Orgao`). Seja consistente.
- Estilo idiomático do NestJS (módulos, services, controllers, DTOs) e Hooks/componentes funcionais no React.
- DTOs + validação (class-validator) nos endpoints. Nunca confiar em input não validado.
- **Dívida conhecida:** tipos compartilhados hoje vivem no front, deveriam estar em `packages/` (§10). Ao criar tipos novos compartilhados, preferir `packages/`.

---

## 6. Estado atual do projeto (23/06/2026)

**Concluído e em produção:**
- **Épico 0** — Fundação: spikes PNCP validados; repo, backend, deploy no Render.
- **Épico A** — Auth: cadastro/login/refresh/logout + `/users/me` (JWT, refresh rotativo).
- **Épico 1** — Dados: `Edital`, `sync_states`, catálogo de obra, `municipios` (IBGE).
- **Épico 2** — Captação: conector PNCP (paginação, retry/backoff, rate limit), dedup/upsert, filtro de obra, job agendado, monitoramento (`sync_runs`), disparo manual (`POST /captacao/run`), captação sob demanda por busca (T-34).
- **Épico 3** — Busca/API: `GET /editais` (UF, município, valor, período, texto, paginação) + `GET /editais/:id` + índices.
- **Épico 4** — Interface: 9 telas em Mantine; busca e detalhe ligadas à API real; login; estados loading/vazio/erro; responsividade + PWA básico; favoritar + aba Salvos.

**Métricas:** ~2.879 linhas backend / ~4.245 front; 93 testes passando; banco dev com 837 editais reais.

**Próximo:** Épico 5 (diagnóstico de prontidão + resumo com IA) — ver `BACKLOG.md`.

---

## 7. Telas mockadas (IMPORTANTE — não são bugs)

As seguintes telas existem como **casca visual mockada, sem backend** — criadas de propósito como lembrete do que falta construir:
- Orçamentos, Documentos, Agenda, Perfil, Onboarding.
- As seções "Resumo com IA" e "Prontidão" dentro da tela de detalhe do edital.

**Regras sobre elas:**
- NÃO assuma que estão prontas — são placeholders.
- Ao trabalhar no Épico 5, várias destas ganham backend (documentos → T-42; prontidão → T-46/T-52; resumo → T-50).
- NÃO as remova nem "conserte" sem que seja a task certa do backlog.
- Enquanto mockadas, está tudo bem — o produto não está sendo mostrado a usuários ainda.

---

## 8. Deploy e operação
- API: `https://obrapub-api.onrender.com` — deploy contínuo no push; migrations no start.
- **Render free:** o serviço hiberna (~15 min) → o `@Cron` da captação NÃO é confiável. Por isso existem o endpoint manual (`POST /captacao/run`) e a captação por busca. Postgres free expira ~30 dias.
- Variáveis a setar no painel em prod: `WEB_ORIGIN` (CORS do front) e `CAPTACAO_TRIGGER_TOKEN`.
- **Front ainda sem deploy contínuo** — telas novas só vão ao ar quando o static site for publicado.

---

## 9. O que NÃO fazer / fora de escopo agora
- ❌ Não mexa nas telas mockadas fora da task certa do Épico 5 (§7).
- ❌ Não construa a Camada 2 de captação (Portal de Compras Públicas) sem spike próprio.
- ❌ T-16 (Compras.gov.br) está despriorizada — subconjunto do PNCP.
- ❌ Não instale dependências sem perguntar.
- ❌ Não refatore fora do escopo da task.
- ❌ Não tome decisões de arquitetura sozinho — pergunte.
- ❌ Não use IA sem cache e sem validação prévia de acerto (§3.4).

---

## 10. Dívidas técnicas conhecidas (registradas, não urgentes)
1. **Papercut do índice GIN:** todo `migration:generate` recria um `DROP` do índice GIN (full-text). Removido à mão em cada migration. *Melhoria pendente:* defesa automática (teste que falha se o índice some) em vez de disciplina manual.
2. **Banco crescendo (T-34 + Postgres free):** captação por busca só faz o banco crescer. Prever política de retenção (descartar editais encerrados/antigos) antes de virar problema.
3. **Telas mockadas (§7):** risco de parecerem prontas. Mitigado enquanto não há usuário real.
4. **Select de município:** usa subconjunto empacotado no front (stopgap até um endpoint `GET /geo/municipios`).
5. **Tipos compartilhados no front, não em `packages/`** (convenção §5 adiada).
6. **PWA básico** (só manifest); offline/instalação completa exigiria `vite-plugin-pwa`.
7. **Classificador "favor recall":** gera algum ruído no banco. Medir o ruído real quando houver usuário vendo os editais.

---

*Mantenha este arquivo atualizado conforme decisões forem tomadas. Ele é a fonte de verdade sobre como trabalhamos neste repo.*
