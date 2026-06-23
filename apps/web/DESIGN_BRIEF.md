# Briefing — Telas de busca de editais (para o claude.ai/design)

> Cole este documento inteiro no claude.ai/design como contexto inicial.
> Ele descreve o produto, a stack a usar, o contrato real da API e as telas a desenhar.
> Tudo o que for texto de interface deve ser em **português do Brasil**.

---

## 1. Produto e usuário

Plataforma SaaS para o **empreiteiro de obra pública**. Esta parte do produto ajuda o
empreiteiro a **encontrar licitações (editais) de obra pública** relevantes para a região
dele. O diferencial é o **foco exclusivo em obra pública**.

**Usuário:** dono de empreiteira / engenheiro orçamentista. Não é designer nem técnico de TI.
A tela precisa ser **clara e objetiva** — clareza importa mais que sofisticação visual.
Ele quer responder rápido: "tem obra na minha região, no meu tamanho de empresa, pra eu
participar?".

---

## 2. Stack obrigatória (use exatamente isto)

- **React 18** + **TypeScript**
- **Mantine v8** (`@mantine/core`, `@mantine/hooks`) como biblioteca de componentes — use os
  componentes do Mantine (AppShell, Card, Table, TextInput, Select, NumberInput, Pagination,
  Badge, Group, Stack, Skeleton, etc.). **Não** traga outra lib de UI.
- **react-router-dom v6** para navegação (lista → detalhe).
- Cliente HTTP via `fetch` nativo (sem axios/react-query — manter simples).

Formatação para o usuário brasileiro:
- **Valores em R$** (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- **Datas em pt-BR** (`dd/MM/yyyy`).
- Textos, rótulos e mensagens **em português do Brasil**.

---

## 3. Contrato da API (dados reais que as telas consomem)

A API é REST, protegida por **JWT** (header `Authorization: Bearer <token>`). Para o
protótipo no claude.ai/design, **pode usar dados mockados** com o formato abaixo — o
importante é que as telas sejam desenhadas em cima desta estrutura exata.

### 3.1. Busca — `GET /editais`

**Parâmetros de query (todos opcionais):**

| Param         | Tipo     | Regra / observação                                            |
|---------------|----------|---------------------------------------------------------------|
| `uf`          | string   | UF de 2 letras maiúsculas (ex.: `SC`). Uma das 27 UFs.        |
| `q`           | string   | Busca textual no objeto do edital (ex.: "pavimentação"). ≤200 |
| `codigoIbge`  | string   | Código IBGE do município, 7 dígitos (ex.: `4205407`)          |
| `valorMin`    | number   | Valor mínimo estimado, em reais. ≥ 0                          |
| `valorMax`    | number   | Valor máximo estimado, em reais. ≥ 0                          |
| `dataInicio`  | string   | Data ISO 8601 (filtra `dataPublicacao` ≥)                     |
| `dataFim`     | string   | Data ISO 8601 (filtra `dataPublicacao` ≤)                     |
| `page`        | number   | Página (default 1)                                            |
| `pageSize`    | number   | Itens por página (default 20, máx. 100)                       |

**Resposta — envelope paginado:**

```ts
interface EditalSearchResult {
  data: EditalListItem[];
  total: number;     // total de itens (para a paginação)
  page: number;
  pageSize: number;
}

interface EditalListItem {
  id: string;                    // UUID
  fonte: 'PNCP';                 // de qual portal veio o edital
  orgaoNome: string;             // ex.: "Prefeitura Municipal de Florianópolis"
  orgaoCnpj: string | null;
  uf: string;                    // ex.: "SC"
  municipioNome: string;         // ex.: "Florianópolis"
  codigoIbge: string | null;
  objeto: string;                // descrição da obra/licitação (texto longo)
  modalidadeNome: string;        // ex.: "Concorrência - Eletrônica"
  valorEstimado: number | null;  // em reais; pode ser null (formatar como "Não informado")
  dataPublicacao: string;        // ISO 8601
  prazoProposta: string | null;  // ISO 8601 — prazo final pra enviar proposta
  linkOrigem: string | null;     // URL do documento original na fonte
  situacao: string | null;       // ex.: "Divulgada no PNCP"
  isObra: boolean;               // sempre true nesta busca (a API já filtra só obras)
}
```

Ordenação padrão: **mais recentes primeiro** (por `dataPublicacao` desc).

### 3.2. Detalhe — `GET /editais/:id`

Retorna **um** edital completo. `id` inválido → 400; inexistente → 404.

```ts
interface EditalDetail extends EditalListItem {
  modalidadeId: number;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
}
```

---

## 4. Telas a desenhar

### Tela 1 — Busca de editais (lista + filtros)

Layout em `AppShell` do Mantine: cabeçalho simples com o nome do produto, painel de filtros
(lateral em desktop, recolhível/topo em mobile) e a lista de resultados.

**Painel de filtros:**
- **UF** — `Select` com as 27 UFs.
- **Município** — por enquanto o filtro é pelo **código IBGE** (7 dígitos). Pode desenhar um
  `Select`/autocomplete de município (lista de cidades da UF) — deixe claro no design que ele
  resolve para `codigoIbge`. Se simplificar, um campo único de código também serve.
- **Faixa de valor** — dois `NumberInput` (mín. e máx., em R$). Inclua um **preset opcional
  "Até R$ 80 mil (ME/EPP)"** — é o limite do benefício para micro e pequena empresa
  (LC 123/2006). É só um atalho de filtro, não um cálculo.
- **Período** — intervalo de datas de publicação (`dataInicio`/`dataFim`).
- Botões **Aplicar** e **Limpar**.

**Busca textual:** um campo de busca no topo (`q`) com **debounce** (~400ms), placeholder tipo
"Buscar no objeto: pavimentação, escola, ponte…".

**Lista de resultados:** cards (recomendado) ou tabela. Cada item mostra, com destaque:
- **Objeto** (título principal, pode truncar em 2–3 linhas)
- **Órgão** (`orgaoNome`) + **Município/UF**
- **Valor estimado** formatado em R$ (ou "Não informado" se `null`)
- **Prazo da proposta** (`prazoProposta`) — destaque se estiver próximo
- **Modalidade** (`modalidadeNome`) como `Badge`
- O card inteiro é clicável → vai pro detalhe (`/editais/:id`)

**Paginação:** componente `Pagination` do Mantine, usando `total` e `pageSize`.

### Tela 2 — Detalhe do edital

Acessada ao clicar num card. Mostra **todos** os campos do `EditalDetail` de forma organizada
(órgão + CNPJ, município/UF, modalidade, valor, datas de publicação e prazo, situação, fonte).
O **objeto** completo em destaque. Botão primário **"Abrir documento na fonte"** que leva ao
`linkOrigem` (abre em nova aba). Botão de voltar para a lista.

### Estados (valem para as duas telas)

- **Carregando:** `Skeleton` dos cards / do detalhe.
- **Vazio:** "Nenhum edital encontrado com esses filtros." + sugestão de ampliar a busca.
- **Erro:** mensagem amigável + botão "Tentar de novo".

---

## 5. O que NÃO incluir

- Sem login/cadastro nesta tela (já existe em outra parte do app).
- Sem favoritar, alertas, "diagnóstico de prontidão", cobrança ou qualquer coisa além de
  **buscar e ver editais**.
- Sem outras fontes além de PNCP (a `fonte` é só informativa).
