# CLAUDE.md

> Guia de contexto e regras para o Claude Code neste repositório.
> Leia este arquivo inteiro no início de cada sessão, junto com `BACKLOG.md`.

---

## 1. O que é este projeto

Plataforma SaaS para o **empreiteiro de obra pública**. O produto ajuda o empreiteiro a encontrar licitações de obra pública relevantes para ele, verificar se está apto a participar, montar propostas e (em fases futuras) executar a obra e se conectar com profissionais e fornecedores.

**Esta fase do desenvolvimento cobre apenas a primeira funcionalidade do MVP: Captação e busca de editais por região.** Não construa nada além desse escopo sem que eu peça explicitamente.

O diferencial do produto frente a concorrentes (ConLicitação, Effecti) é o **foco exclusivo em obra pública** e, no futuro, o **diagnóstico de prontidão** (dizer ao empreiteiro se ele está apto a uma licitação específica). Tenha isso em mente ao tomar decisões de modelagem — os dados captados vão alimentar esse diagnóstico depois.

---

## 2. Stack técnica

Monorepo gerenciado com **pnpm**.

```
/
├── apps/
│   ├── api/          # Backend — NestJS + TypeORM + PostgreSQL
│   └── web/          # Frontend — Vite + React 18 + TypeScript
├── packages/         # Código compartilhado (tipos, contratos de API)
├── CLAUDE.md
├── BACKLOG.md
└── docker-compose.yml
```

**Backend (`apps/api`)**
- NestJS (arquitetura modular)
- TypeORM como ORM
- PostgreSQL como banco (rodando via Docker em desenvolvimento)
- Migrations do TypeORM para toda mudança de schema (nunca `synchronize: true` fora de dev)

**Frontend (`apps/web`)**
- Vite + React 18 + TypeScript
- Biblioteca de componentes pronta para não desenhar do zero (a definir — me pergunte antes de escolher)
- Cliente HTTP para consumir a API do backend

**Infraestrutura**
- PostgreSQL via Docker em desenvolvimento (`docker-compose.yml`)
- Deploy a definir (Railway ou Render) — não configure deploy sem combinar comigo

---

## 3. Arquitetura inegociável

Estas decisões são fixas. **Não as altere sem me perguntar.** Se você acha que há uma abordagem melhor, me diga antes de implementar — não tome a decisão sozinho.

### 3.1. Padrão de Conector para captação (o mais importante)

A captação de editais vem de **múltiplas fontes** (PNCP, Compras.gov.br, e no futuro Portal de Compras Públicas, portais estaduais, etc.). Para que adicionar uma fonte nova seja simples, toda fonte DEVE seguir o mesmo padrão:

- Existe uma **interface comum de conector** (ex.: `EditalSourceConnector`) que define um contrato: dado um período, retorna editais no **formato interno padronizado**.
- Cada fonte tem o seu próprio conector que implementa essa interface (`PncpConnector`, `ComprasGovConnector`, ...).
- **NUNCA** acople lógica específica de uma fonte fora do conector dela. O resto do sistema (job, busca, banco) só conhece o formato padronizado, nunca os detalhes de uma fonte específica.
- Adicionar uma fonte nova = criar um novo conector que implementa a interface. Nada mais no sistema deve precisar mudar.

Esta é a decisão arquitetural mais importante do projeto. Ela é o que permite a plataforma crescer em cobertura sem reescrever a captação.

### 3.2. Modelo de dados

- A entidade central é **`Edital`**, com no mínimo: órgão, município, UF, objeto, modalidade, valor estimado, data de publicação, prazo de proposta, link para o documento original, **fonte** (de qual conector veio) e **`idExterno`** (o identificador do edital na fonte de origem).
- A combinação **`fonte` + `idExterno` é a chave de deduplicação**. Antes de inserir, sempre verificar se já existe. Se existe e mudou (prazo, valor), atualizar (upsert). Se é novo, inserir.
- Municípios e UFs devem ser **padronizados** (usar a base do IBGE). Fontes diferentes nomeiam municípios de formas diferentes — normalizar para um padrão único é essencial para a busca por região funcionar.

### 3.3. Regras de negócio centrais

- **O que conta como "edital de obra"** é definido por um catálogo configurável (modalidades de obra/engenharia + palavras-chave de inclusão/exclusão no objeto). Não deixe esse critério espalhado pelo código — mantenha centralizado e fácil de ajustar.
- Recomendação: ao captar, **guarde também os editais que não são de obra, marcados como tal**, em vez de descartá-los. Assim, ajustar o filtro depois não exige reprocessar tudo da fonte.

---

## 4. Regras de comportamento (como você deve trabalhar)

Estas regras existem para me manter no controle da arquitetura e do que entra no projeto. Siga todas.

### 4.1. Antes de codar
- **Sempre me mostre o plano antes de implementar** qualquer task que não seja trivial. Liste os arquivos que vai criar/alterar e a abordagem. Espere meu OK.
- Para tasks grandes, use o **plan mode** e aguarde aprovação antes de executar.
- Trabalhe **uma task do `BACKLOG.md` por vez**. Não avance para a próxima sem eu pedir.

### 4.2. Dependências
- **NÃO instale nenhuma dependência nova sem me perguntar antes.** Diga qual lib, por quê, e se há alternativa já no projeto. Espere meu OK.
- Prefira sempre o que já está no projeto a adicionar algo novo.

### 4.3. Escopo
- **NÃO refatore código fora do escopo da task atual.** Se você vê algo que merece refatoração, me avise como sugestão — não faça por conta própria.
- **NÃO crie funcionalidades que eu não pedi.** Se a task é a captação, não comece a fazer alertas ou tela de login "porque vai precisar depois".
- Mantenha o escopo desta fase: **apenas captação e busca de editais**. Nada de diagnóstico de prontidão, alertas, cobrança, etc., nesta fase.

### 4.4. Qualidade
- **Cada task = um commit pequeno e descritivo.** Não acumule várias tasks num commit gigante.
- **Sempre rode lint e testes antes de dizer que a task está pronta.** Se algo falha, conserte antes de me entregar.
- Escreva testes para a lógica crítica: conectores, deduplicação, normalização e filtro de obra. Essas são as partes onde um bug passa despercebido e contamina os dados.
- Trate erros explicitamente, especialmente em chamadas de API externa (timeout, rate limit, resposta inesperada). A captação não pode quebrar silenciosamente.

### 4.5. Quando tiver dúvida
- **Em dúvida sobre arquitetura ou regra de negócio, PERGUNTE. Não invente.** É melhor uma pergunta a mais do que uma decisão errada que eu descubro três semanas depois.
- Se uma instrução minha conflita com este arquivo, me avise do conflito em vez de escolher sozinho qual seguir.

---

## 5. Convenções de código

- **Idioma:** código (nomes de variáveis, funções, classes) em **inglês**; mensagens voltadas ao usuário final em **português do Brasil**.
- **Nomes de entidades de domínio** podem manter o termo em português quando não há tradução natural clara (ex.: `Edital`, `Orgao`), para alinhar com o vocabulário do negócio — mas seja consistente.
- Siga o estilo idiomático do NestJS no backend (módulos, services, controllers, DTOs) e dos Hooks/componentes funcionais no React.
- Tipos compartilhados entre back e front ficam em `packages/` para não duplicar.
- Use DTOs e validação (class-validator) nos endpoints — nunca confie em input não validado.

---

## 6. Fluxo de trabalho com Git

- Um commit por task do backlog, com mensagem descritiva referenciando a task (ex.: `feat(api): T-12 conector PNCP de busca de editais`).
- Não faça force push em branch compartilhada.
- Antes de abrir mão de um trabalho que funciona, garanta que está commitado.

---

## 7. Comandos úteis

> Atualize esta seção conforme o projeto cresce.

```bash
# instalar dependências (raiz do monorepo)
pnpm install

# subir o banco em Docker
docker-compose up -d

# rodar o backend em dev
pnpm --filter api start:dev

# rodar o frontend em dev
pnpm --filter web dev

# rodar migrations
pnpm --filter api migration:run

# rodar testes
pnpm --filter api test

# rodar lint
pnpm lint
```

---

## 8. Sobre as fontes de dados (contexto de domínio)

Contexto para você entender o que está construindo. **Camadas 1 e 2 são o escopo atual.**

**Camada 1 — fontes oficiais com API (escopo atual):**
- **PNCP (Portal Nacional de Contratações Públicas):** fonte primária. Hub nacional que, por lei (14.133/2021), recebe editais de todos os portais. API pública e documentada, retorno em JSON.
- **Compras.gov.br (ComprasNet / SIASG):** portal federal com API de dados abertos madura. Segunda fonte.

**Camada 2 — grandes portais municipais (escopo atual, depois da camada 1):**
- **Portal de Compras Públicas:** maior portal independente, forte em municípios pequenos e médios. Aceita integração via API/webservices.
- **Portais estaduais** (BEC-SP, etc.): só os dos estados onde há usuários, definidos conforme a base.

**Importante sobre cobertura:** o PNCP, em teoria, concentra tudo (os outros portais são obrigados a alimentá-lo). Na prática há atraso e nem todo município cumpre. Por isso as fontes da camada 2 complementam — mas a arquitetura de conector torna adicioná-las simples.

**Fora de escopo por enquanto:** diários oficiais municipais e raspagem de portais sem API. Não construa nada relacionado a isso nesta fase.

---

## 9. O que NÃO fazer nesta fase (resumo)

- ❌ Não construa autenticação/login elaborado, alertas, diagnóstico de prontidão, cobrança ou qualquer funcionalidade além de captação e busca.
- ❌ Não adicione fontes da camada 3 (diários oficiais, raspagem).
- ❌ Não instale dependências sem perguntar.
- ❌ Não refatore fora do escopo da task.
- ❌ Não tome decisões de arquitetura sozinho — pergunte.
- ❌ Não configure deploy/produção sem combinar.

---

*Mantenha este arquivo atualizado conforme decisões forem tomadas. Ele é a fonte de verdade sobre como trabalhamos neste repo.*
