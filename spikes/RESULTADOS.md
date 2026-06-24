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

## T-47 — Extração de texto do PDF do edital (Épico 5, camada 3)

> Spike: `spikes/pncp-pdf.mjs`. Amostra: **40 editais de obra** mais recentes do banco de dev (SC). Data: 2026-06-24.
> Objetivo: saber que % dos editais reais dá para extrair texto — pré-requisito da extração de exigências por IA (T-48/T-49).

- **O PDF do edital NÃO vem no `linkSistemaOrigem`** (esse aponta pro sistema de origem — Comprasnet/Portal — e às vezes vem vazio). O arquivo vem de um **endpoint separado de arquivos** do PNCP, derivado do `numeroControlePNCP`:
  `GET https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` → lista JSON de documentos, cada um com `url` de download e `tipoDocumentoNome` (ex.: "Edital").
- **Boa parte vem empacotada em ZIP** (edital + anexos), não como PDF solto — o `content-type` é `application/octet-stream`; o `content-disposition` revela `.zip` (magic bytes `PK`). É preciso descompactar e achar o PDF do edital dentro (na amostra, **6 de 39** vieram em ZIP).
- **Extração com `pdftotext` (poppler)** — zero dependência npm no spike.

**Resultado (40 editais):**

| Categoria | Qtd | % |
|---|---|---|
| ✅ Edital completo, texto extraível (caminho feliz da IA) | 28 | **70%** |
| 🟡 Só resumo/aviso curto publicado (texto OK, mas sem edital completo) | 11 | 27,5% |
| 🔴 Escaneado/imagem (precisaria de OCR) | 0 | **0%** |
| ⚪ Sem PDF útil (ZIP só com `.docx`) | 1 | 2,5% |
| ✖ Erro de rede/HTTP | 0 | 0% |

- **OCR não é problema hoje:** **0%** escaneados na amostra. Os PDFs do PNCP são nativos (texto real, acentuado, legível por máquina). OCR fica como task futura, não bloqueia o épico.
- **Editais completos têm ~162 mil chars de média** — é grande, vai precisar de **chunking** (ou de mandar só as seções de habilitação) na chamada de IA.
- **O gargalo real não é técnico, é de dados:** ~27% das contratações publicam no PNCP só um **resumo de 1 página** (relação de itens / aviso), não o edital completo. Confirmado inspecionando os casos (Brusque, Volta Redonda): o endpoint de arquivos retorna **um único** documento curto. Não é doc errado escolhido — é o que o órgão publicou. (O mesmo órgão tem licitações com edital completo e outras só com resumo → é por licitação.)

**Impactos nas próximas tasks:**
- **T-49 (serviço de extração):** baixar via endpoint de **arquivos** (não `linkOrigem`); tratar **ZIP** (descompactar, achar o PDF do edital); extrair texto. **Cache obrigatório** (CLAUDE.md §3.4). Decidir a abordagem **Node-native** de extração (ex.: `pdfjs-dist`/`pdf-parse`) ou chamar `pdftotext` no container — **decisão da T-49, pedir dep antes**.
- **T-48 (IA extrai exigências):** rodar nos **editais completos** (os ~70%); medir taxa de acerto à mão. Editais "só resumo" (~27%) não têm o que extrair — tratar como **"diagnóstico indisponível"**, nunca inventar.
- **Tamanho do texto:** prever **chunking**/seleção de seções (habilitação) — 162k chars não cabem confortáveis num prompt único.
- **Melhoria futura possível:** para os "só resumo", o edital completo pode estar no `linkOrigem` (portal do órgão) — fonte secundária de PDF, fora do escopo do spike.

---

## T-48 — IA extrai exigências de habilitação (Épico 5, camada 3)

> Spike: `spikes/edital-ia.mjs`. 5 editais reais completos (SC/RJ). Data: 2026-06-24.
> **Provider de IA: OpenAI `gpt-5.5`** (decisão do dono em 24/06 — antes era Anthropic; ver CLAUDE.md §3.4). Structured outputs estritos (JSON Schema). Chave em `spikes/.env`.
> Objetivo: medir a taxa de acerto da IA extraindo exigências de habilitação **antes** de construir o serviço (T-49).

- **Método:** texto do edital via a pipeline do T-47 (arquivos PNCP → PDF/ZIP → `pdftotext`) → enviado ao `gpt-5.5` com um JSON Schema de exigências (certidões fiscais/trabalhista/falência, registro CREA/CAU, capacidade técnica, capital social, garantia, outros). A IA é instruída a **não inventar** e a citar um **trecho literal** do edital como evidência de cada item.
- **Resultado:** **5/5 extrações corretas e detalhadas.** Pegou as 6 certidões padrão, CREA/CAU, capacidade técnica com quantitativos (ex.: "93,74 m²"), capital social/PL ("5% do valor estimado", "PL 10%"), índices contábeis (LG/SG/LC > 1) e garantia de proposta (1%).
- **Verificação anti-alucinação (automática):** o spike confere se cada `trecho` citado existe no texto do edital. Resultado bruto: 26/47 (55%) batem **literalmente** — MAS o 55% mede *fidelidade da citação*, não acerto. Inspeção dos "não-batidos" (editais 3/5, que deram 0/9 e 0/10): **todos os requisitos existem mesmo no edital** (contagem por keyword: FGTS, CNDT, falência, CREA/CAU, CAT/atestado, quantitativos "93,74"/"33,49 m²" — todos presentes). A IA apenas **parafraseou/condensou** a citação (ex.: resumiu "regularidade fiscal perante as Fazendas Federal, Estadual e Municipal" em vez de copiar item a item) e às vezes **juntou** dois itens num trecho. **Conclusão: zero alucinação — todo requisito citado está no edital; o acerto da extração é ~100% nos 5.** A conferência final item-a-item fica como sign-off humano.
- **Custo:** ~**$0,15–$0,50 por edital** (`gpt-5.5` a $5/$30 por MTok), ~$2 nos 5. Editais grandes (370p) custam mais, mas pegar o documento certo (edital, não o projeto) **barateia**.
- **Comparação de modelos (mesmos 5 editais):** rodado também com **`gpt-5.4-mini`** ($0,75/$4,50 por MTok). Resultado: **mesmo acerto, zero alucinação** (cruzado contra o texto-fonte por keyword), trecho-literal ~56% (mesmo artefato de paráfrase do `gpt-5.5`), por **~$0,04/edital — ~8× mais barato** (~$0,20 nos 5 vs ~$1,58 do `gpt-5.5`). **Insumo de escolha pro T-49:** o mini é candidato forte pra produção (extração roda por edital, com cache → custo manda). Validar de novo em amostra maior antes de fixar.

**Custo por edital × por usuário (estimativa, insumo T-49/T-50):**
- O **cache obrigatório (§3.4)** faz o custo ser **por edital (uma vez)**, não por usuário. O cruzamento perfil × exigências (T-51) é **lógica pura → $0 de IA**.
- **Unitário:** ~**$0,04/edital** (`gpt-5.4-mini`) · ~$0,32 (`gpt-5.5`). Cobrir o corpus atual de SC (~575 editais com texto) = **~$23 uma vez** (mini) / ~$184 (5.5), + ~$18/mês (mini) de novos editais por UF ativa.
- **Por usuário:** estado estável ≈ **$0 marginal** (lê do cache); o **1º usuário de uma região nova** "paga" os editais que abrir (~$2 se navegar 50, no mini), e a partir daí ficam cacheados pra todos; diluído na base, cai pra **~$0,02–0,23/usuário/mês** conforme o nº de usuários cresce. **O custo escala com nº de editais, não de usuários.**
- **Resumo com IA (T-50)** é uma **2ª chamada** por edital (também cacheada) → ~dobra no mini (~$0,08/edital pra prontidão + resumo).
- **Alavanca:** extrair **sob demanda** (só editais abertos/favoritados) em vez do corpus inteiro corta o custo inicial — paga-se só pelos editais que importam.

**Achado crítico (vira regra do T-49) — seleção do documento:**
- O PNCP frequentemente lista **vários arquivos todos com `tipoDocumentoNome: "Edital"`** (ex.: `EXECUTIVO.pdf` = projeto de 370p, `ART.pdf`, `EDITAL.pdf`). Pegar o primeiro/maior pode trazer o **projeto executivo**, que **não tem** seção de habilitação → a IA corretamente devolve tudo vazio (**não foi erro da IA**: o documento não continha o que extrair).
- **Correção (aplicada no spike, obrigatória no T-49):** escolher pelo **título** que diz "edital" **excluindo** nomes de projeto/anexo (`executivo`, `projeto`, `memorial`, `planilha`, `ART`, `orçamento`, `anexo`, `mapa`, `planta`, `caderno`, `estudo`). Com isso o Sangão/SC saiu de "tudo vazio" para a extração completa e correta — e mais barata (193k vs 632k chars).

**Impactos no T-49 (serviço de extração):**
- **Seleção de documento robusta** é tão importante quanto o prompt — sem ela, o diagnóstico fica vazio (falso "nada exigido"). Considerar fallback: se o doc escolhido não tem termos de habilitação, tentar outro doc da lista.
- **Cache obrigatório do resultado** por edital (§3.4) — cada edital processado uma única vez (custo de API por edital).
- **Texto grande cabe** no contexto do `gpt-5.5` (~1.05M tokens) — não truncar cegamente por nº de chars (trunca a seção de habilitação). Preferir o edital focado; se precisar, localizar a seção em vez de cortar no meio.
- **Editais "só resumo" (~27%, T-47)** não têm edital completo → tratar como **"diagnóstico indisponível"**, nunca inventar.
- **Schema de saída** alinhado ao catálogo da T-44 facilita o cruzamento (T-51).
- **Citação verbatim:** se o `trecho` for usado como evidência clicável/verificável, instruir a IA a **copiar literalmente** (no spike ela parafraseou ~45% dos trechos); senão, tratar `trecho` como resumo. Vale manter a verificação automática de trecho como guarda anti-alucinação.

**Veredito:** a extração por IA é **boa o suficiente para seguir** (camada 3). A qualidade do `gpt-5.5` na seção de habilitação é alta e **verificada** (todo requisito citado existe no edital — zero alucinação na amostra). O risco real provou ser a **engenharia de dados** (qual PDF ler), não a IA. *Sign-off humano final recomendado: abrir os 5 PDFs e conferir item a item — os trechos citados tornam isso rápido.*

---

## Como reproduzir

```bash
node spikes/pncp.mjs        # T-01/T-02: PNCP — volume e completude de obra em SC
node spikes/compras-gov.mjs # T-03: Compras.gov.br vs PNCP
node spikes/pncp-pdf.mjs    # T-47: extração de texto do PDF do edital (AMOSTRA=N ajusta)
node spikes/edital-ia.mjs   # T-48: IA extrai exigências (precisa OPENAI_API_KEY em spikes/.env; OPENAI_MODEL=gpt-5.4-mini, ALVO=N, ONLY_ID=...)
```

> Os spikes são código de exploração descartável. As decisões que eles embasaram estão aqui e no `BACKLOG.md`.
