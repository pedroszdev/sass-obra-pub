# Resultados dos Spikes — Épico 0 (Validação)

> Síntese do que os spikes T-01, T-02 e T-03 provaram, e como isso impacta as próximas tasks.
> Código: `spikes/pncp.mjs` (T-01/T-02) e `spikes/compras-gov.mjs` (T-03). Zero dependências, `node spikes/<arquivo>.mjs`.
> Região de teste: **SC**. Janela: **30 dias**. Data dos testes: 2026-06-15.

---

## Resumo executivo

- **O PNCP é a fonte primária e praticamente completa.** Volume forte (≈23 Concorrências/dia só em SC) e **100% de completude** nos campos que importam (município, UF, código IBGE, valor).
- **O Compras.gov.br agrega pouco para obra municipal.** Seu módulo da Lei 14.133 é um **subconjunto do PNCP** (~3,5% do volume em SC) e o módulo legado (8.666) está dormente.
- **Decisão (dono, pós-T-03):** despriorizar o conector Compras.gov.br (T-16) e tornar o **Portal de Compras Públicas** a 2ª fonte (camada 2). Compras.gov.br vira opcional/futuro (só se houver foco em obra federal).

---

## T-01 — A API do PNCP funciona

- **Endpoint:** `GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao`
- **Parâmetros:** `dataInicial`/`dataFinal` (formato `AAAAMMDD`), `codigoModalidadeContratacao` (obrigatório), `pagina`, `tamanhoPagina` (máx. 50), `uf` (opcional).
- **Resultado:** HTTP 200, retorno JSON com envelope `{ data, totalRegistros, totalPaginas, ... }`. ~9.570 editais em 7 dias (modalidade Pregão, Brasil todo).
- **Campos do registro** (mapeiam direto na entidade `Edital` da T-07):

| Campo PNCP | Campo `Edital` (T-07) |
|---|---|
| `orgaoEntidade.razaoSocial` | órgão |
| `unidadeOrgao.municipioNome` | município |
| `unidadeOrgao.ufSigla` | UF |
| `unidadeOrgao.codigoIbge` | (padronização regional — T-10) |
| `objetoCompra` | objeto |
| `modalidadeNome` / `modalidadeId` | modalidade |
| `valorTotalEstimado` | valor estimado |
| `dataPublicacaoPncp` | data de publicação |
| `dataEncerramentoProposta` | prazo de proposta |
| `linkSistemaOrigem` | link do documento original |
| `numeroControlePNCP` | **`idExterno`** (chave de dedup com `fonte`) |
| (fixo) | `fonte = 'PNCP'` |

## T-02 — Volume e completude de OBRA (SC, 30 dias)

- **Filtro de obra usado:** modalidade **Concorrência** (`modalidadeId` 4 = Eletrônica, 5 = Presencial). Sob a Lei 14.133, Pregão é para "bens e serviços comuns"; obras de engenharia vão por Concorrência.
- **Volume:** **686 editais** (661 Eletrônica + 25 Presencial), **~22,9/dia**.
- **Completude:** `municipioNome`, `ufSigla`, `codigoIbge` e `valorTotalEstimado` preenchidos em **100%** dos 686 registros.
- **Cross-check por palavra-chave no objeto:** **91%** bateram (piso). Amostra mostrou que **Concorrência não é 100% obra** (pega também serviço de engenharia) e que a lista de palavras precisa de cuidado — um caso real de obra ("Implantação de infraestrutura viária...") não bateu por falta dos termos "infraestrutura"/"implantação".
- **Rate limit:** o PNCP retorna **HTTP 429** sob muitas requisições (bloqueou na pág. 13). O spike só completou após **retry com backoff**.

## T-03 — Compras.gov.br vs PNCP (sobreposição × complemento)

- **Portal antigo (`compras.dados.gov.br`) descontinuado** (301). A API viva é **`dadosabertos.compras.gov.br`** (OpenAPI; envelope `{ resultado, totalRegistros, totalPaginas, paginasRestantes }`).
- **Dois módulos relevantes:**

| Módulo | Endpoint | O que é | Veredito |
|---|---|---|---|
| Contratações | `/modulo-contratacoes/1_consultarContratacoes_PNCP_14133` | Lei 14.133 | **Subconjunto do PNCP** — compartilha `numeroControlePNCP`; só **23** Concorrências Eletrônicas em SC vs **661** do PNCP (~3,5%). Cobre só o que passou pela plataforma federal |
| Legado | `/modulo-legado/1_consultarLicitacao` | Lei 8.666 / SIASG | **Dormente** — escopo federal (chaveado por `uasg`, sem UF), 0 registros recentes |

- **Pegadinha de modalidade:** o `codigoModalidade` desta API tem **numeração própria** (ex.: `3` = Concorrência Eletrônica), diferente do `modalidadeId` do PNCP (`4`). A equivalência fica no campo `modalidadeIdPncp`. `tamanhoPagina < 10` retorna HTTP 400.

---

## Impactos nas próximas tasks (ler antes de implementar)

- **T-07 (entidade `Edital`):** usar o mapa de campos da T-01 acima. `numeroControlePNCP` → `idExterno`; `fonte = 'PNCP'`.
- **T-09 (catálogo de obra):** o critério é **modalidade (Concorrência) + palavras-chave no objeto**. Modalidade sozinha não basta. A lista de palavras precisa cobrir termos como "infraestrutura", "implantação", "pavimentação", "drenagem" — e ser ajustável (é o ponto central da task).
- **T-10 (base IBGE):** **mais fácil que o previsto** — o PNCP já entrega `codigoIbge` 100% preenchido. A tabela IBGE serve para validar/enriquecer, não para adivinhar município por nome.
- **T-13 (paginação e limites):** **obrigatório** tratar rate limit (HTTP 429) com throttle + backoff. Não é opcional — o spike já bateu no limite.
- **T-14 (dedup):** chave = `fonte` + `idExterno` (`numeroControlePNCP`).
- **T-16 / camada 2:** **despriorizada** (ver decisão). Camada 2 = Portal de Compras Públicas, que precisa de **spike próprio** antes de virar conector.
- **T-17 (normalização):** com fonte única (PNCP) é leve; a parte "entre fontes" ativa quando entrar a 2ª fonte.

---

## Como reproduzir

```bash
node spikes/pncp.mjs        # T-01/T-02: PNCP — volume e completude de obra em SC
node spikes/compras-gov.mjs # T-03: Compras.gov.br vs PNCP
```

> Os spikes são código de exploração descartável. As decisões que eles embasaram estão aqui e no `BACKLOG.md`.
