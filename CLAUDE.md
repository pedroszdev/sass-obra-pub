# CLAUDE.md

> Guia de contexto e regras para o Claude Code neste repositório.
> Leia este arquivo inteiro no início de cada sessão, junto com `BACKLOG.md`.
> **Atualizado em 17/07/2026** — os 13 épicos do backlog estão fechados (orçamento, monetização, duas varreduras de segurança). O que era "a próxima informação útil vem de fora do código" **chegou**: o **primeiro teste do produto em produção** (QA end-to-end, na pele de um empreiteiro) virou o **Épico 14** (§6, `BACKLOG.md`). Veredito: o núcleo funciona ponta a ponta e impressiona; **0 críticos, 1 alto** (congelamento/loop de render — T-166), 2 médios, ~8 baixos. Todos exigiram um humano clicando — nenhum apareceu nas varreduras ou nos e2e.

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
- Deduplicação por **`fonte` + `idExterno`** (= `numeroControlePNCP`) com upsert (só atualiza se mudou). ⚠️ **A identidade é o número de controle, NÃO o texto do objeto (T-176):** o PNCP pode ter dois `numeroControlePNCP` para o mesmo objeto (republicação/retificação, lote distinto, dupla publicação do órgão) — aí a busca mostra duas linhas com o mesmo título. **Isso é dado da fonte, não falha de dedup** (a busca é `findAndCount` sem JOIN; o `UNIQUE(fonte, idExterno)` impede duplicata do mesmo controle). Deduplicar por objeto+município+data foi **descartado** (decisão do dono): esconderia editais genuinamente distintos, contra o favor-recall (§3.3).
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

## 6. Estado atual do projeto (17/07/2026)

> **Os 13 épicos originais estão fechados; o primeiro teste em produção abriu o Épico 14** (T-166–T-179, `BACKLOG.md`). Além dele, sobraram 3 tasks soltas — ver "Próximo", no fim desta seção.

**Concluído e em produção:**
- **Épico 0** — Fundação: spikes PNCP validados; repo, backend, deploy no Render.
- **Épico A** — Auth: cadastro/login/refresh/logout + `/users/me` (JWT, refresh rotativo).
- **Épico 1** — Dados: `Edital`, `sync_states`, catálogo de obra, `municipios` (IBGE).
- **Épico 2** — Captação: conector PNCP (paginação, retry/backoff, rate limit), dedup/upsert, filtro de obra, job agendado, monitoramento (`sync_runs`), disparo manual (`POST /captacao/run`), captação sob demanda por busca (T-34).
- **Épico 3** — Busca/API: `GET /editais` (UF, município, valor, período, texto, paginação) + `GET /editais/:id` + índices.
- **Épico 4** — Interface: telas em Mantine; busca e detalhe ligadas à API; login; estados loading/vazio/erro; responsividade + PWA básico; favoritar + Salvos.
- **Épico 5** — Diagnóstico de prontidão + IA: perfil de habilitação (certidões/atestados, PDF em bytea), alerta de vencimento, checklist genérico de prontidão, extração de exigências por IA (com cache + registro de custo), resumo de edital por IA, diagnóstico específico por edital, filtro "só obras em que estou apto", pré-computação em background (T-54).
- **Épico 6** — Orçamento integrado ao edital (T-60–T-71): proposta vinculada ao edital, itens **extraídos da planilha por IA** (com import manual como fallback — o spike T-63 mediu que só 27% dos editais têm planilha extraível), motor de cálculo puro no backend (§3.3), BDI percentual, comparação com o teto e exportação (CSV + PDF por impressão). **A jornada achar → habilitar → propor está fechada.**
- **Épico 7** — Redesign PrumoLicita: backend das telas do Figma, incluindo Agenda (T-91), Alertas (T-90) e o cronograma físico-financeiro simples (T-93).
- **Épico 8** — Prontidão para lançamento: LGPD (T-102), e-mail transacional (T-101), verificação de e-mail (T-132), rate limit em 3 dimensões (T-104), observabilidade (T-106).
- **Épico 9** — Aprofundamento do diferencial.
- **Épico 10** — Correção de domínio e confiança no dado (auditoria de 02/07).
- **Épico 11** — Monetização: trial de 7 dias sem cartão, Stripe Billing + Checkout + Customer Portal, webhook como fonte da verdade, paywall, reconciliação, cancelamento/reembolso.
- **Épico 12** — Varredura de segurança (13/07) e **Épico 13** — varredura OWASP (16/07). Ver abaixo.

**Correções recentes (25/06/2026):** datas exibidas no fuso de Brasília (os timestamps vêm UTC e o front mostrava o dia errado em prazos noturnos — `format.ts`); seletor de município passou a listar as 27 UFs via `GET /geo/municipios` (front consome via `useMunicipios`, cache por UF); removidos os campos técnicos (Identificador/Capturado em/Atualizado em) do detalhe do edital; testes do front agora em **vitest**.

**Atualização do backlog (07/07/2026):** criado o **Épico 11 — Monetização** (trial + paywall: T-127–T-131) e a **T-126** (criação/login com Google). Removidas **T-92** (OTP WhatsApp), **T-121** (landing), **T-123** (beta fechado) e **T-124** (métricas). Ver `BACKLOG.md`.

**Varredura completa (13/07/2026) — Épico 12 no `BACKLOG.md`:** análise de segurança/autorização/regras do código inteiro. **Nenhum buraco de autorização** (todo `:id` é escopado ao usuário do JWT; DTOs com limites; rate limit em 3 dimensões; refresh em cookie httpOnly; upload por magic bytes). Corrigidos: busca de aptidão que varria a tabela de exigências inteira (caminho de OOM), mime do cofre gravado do cliente, HTML não escapado nos e-mails, **e-mail em produção (SMTP bloqueado no Render free → Resend por HTTPS) + envio que travava o cadastro**, boas-vindas ausente no cadastro pelo Google, e três defeitos de front (quantidade não editável na planilha, menu que não fecha no celular, cadastro cortado no celular). **Sem pendências:** T-151 (multer com CVE), T-152 (cookie `SameSite=Lax`), T-153 (endurecimento de auth) e T-154 (retenção) foram todas fechadas em 14/07 — ver `BACKLOG.md`.

**Varredura completa (16/07/2026) — OWASP, código inteiro. Épico 13 no `BACKLOG.md`.** Foram DUAS passadas, e a diferença entre elas é a lição que fica. A primeira varreu os **pontos de entrada** (controllers, guards, autorização, DTOs, injeção, dependências) e não achou nada explorável — mesmo veredito do Épico 12. A segunda abriu os **serviços por dentro** e achou duas falhas reais, uma delas ALTA — nenhuma delas mora num controller, por isso a primeira não as via. **"Varredura limpa" só vale para o que foi de fato aberto; a lista de "confirmados sadios" abaixo é um recorte, não um alvará.**

**Corrigidas:**
- **T-159 — Account pre-hijacking no vínculo do Google (ALTO, `7a47f7d`).** O caminho "e-mail conhecido → vincula" (T-126) aceitava qualquer conta local com o mesmo e-mail, sem exigir que ela tivesse provado posse do endereço. Como o cadastro por e-mail é **auto-login** (a conta existe com senha e `email_verified` nulo sem ninguém abrir a caixa), dava para cadastrar o e-mail de alguém, esperar a pessoa entrar pelo Google — ela caía na conta do atacante, sem nenhum sinal, e a povoava com CNPJ/certidões/propostas — e voltar depois com a senha, que continuava valendo. Agora o vínculo de conta **não verificada** revoga senha + sessões (com log), e todo vínculo marca `email_verified` (o id_token já atesta). Conta **já verificada** segue preservando a senha: aí a mesma pessoa provou os dois caminhos, que é a decisão original do dono. **Efeito colateral aceito:** quem cadastrou por e-mail, nunca verificou e entra pelo Google perde a senha e precisa redefini-la — os dois estados são idênticos no banco e não há como distinguir a vítima do atacante.
- **T-160 — Scheme perigoso no link do documento (MÉDIO, `02f710f`).** A T-142 pôs a URL do feed (verbatim, `a.url ?? a.uri`) num `href`, e ela pulava as **duas** guardas da T-119d: o `fetchEditalDocuments` é busca ao vivo e não passa pelo `sanitizeUrl` do mapper, e o front usava `pdf.url` cru — onze linhas abaixo do próprio `httpHref`. A guarda ficou no **`EditalDocumentosService`**, não no conector: é o ponto por onde TODO conector serve a tela (no conector valeria só para o PNCP, e a Camada 2 do §9 reabriria o furo). ⚠️ **O React NÃO protege:** o 18.3.1 só emite aviso de *dev* para href `javascript:` e renderiza o atributo assim mesmo — o aviso some no build de produção.

**Endurecimentos (nenhum era buraco):** allowlist de `https:` no fetch de documento (`common/url-documento.ts`, contra SSRF); `MaxLength(72)` nas senhas de *leitura* (login e senha atual — as de escrita já tinham pelo `@IsSenhaForte`); `.gitignore` para fatura/recibo da Stripe na raiz; **T-161** `clamp` no nome de arquivo do cofre, que vinha do cliente para um `varchar(255)` e derrubava o upload em 500 (`3d75af1`); e **T-162**, o contêiner da API deixou de rodar como **root** (`78a4d7c` — `USER node`; ⚠️ **não validado com build**, não havia daemon Docker no ambiente).

**Também fechados:** **T-163** — o `render.yaml` parou no Épico 0 (declarava 11 envs, o código lê ~34): sem `WEB_ORIGIN` um deploy novo pelo blueprint subia **verde e morto**, com CORS em `localhost`; agora as necessárias vão com `sync: false` (o Render pede o valor) e as de calibragem ficam comentadas com o que degrada. **T-164** — `compararPlanos` não conferia se as moedas dos dois planos batiam. **T-165** — teste **instável** no cadastro: ele corria o `register` contra um cronômetro de 1s, mas o `register` faz bcrypt (12 rounds), que sob os workers paralelos do jest passa de 1s — falhava 1 em 3 rodadas dizendo `cadastro travou no e-mail`, quando o e-mail não tinha nada a ver. ⚠️ **Nunca meça tempo de parede sobre bcrypt**: o mock que nunca resolve já é o instrumento, e o timeout do jest é o juiz.

⚠️ **`applyDefined` (propostas/company-profile) só é seguro por causa do `forbidNonWhitelisted: true`** no ValidationPipe global (`main.ts`): ele itera `Object.keys(patch)` e escreve em `target[key]`, e um `__proto__` no body é rejeitado com 400 antes de chegar lá. **Tirar esse flag transforma os dois em poluição de protótipo.**

**Confirmados sadios (o que foi aberto):** escopo por usuário em todo `:id`; `Raw()` sempre com parâmetro nomeado; `esc()` em todo dado de terceiro nos e-mails (o `subject` cru não injeta header — Resend é JSON, nodemailer codifica); `aud`+`nonce`+`email_verified` no **verifier** do Google; webhook da Stripe com assinatura sobre corpo cru + idempotência + guarda de ordem; `calcularAcesso`/`fimDoAcesso` falham **fechado** (dúvida nunca vira exclusão); exclusão de inativos desligada por padrão e à prova de env inválida; retenção preserva edital com vínculo (o De Morgan está certo); IA **sem tool calling** e com saída travada por `json_schema` strict — injeção de prompt distorce só a extração do próprio edital hostil; `sendDefaultPii: false` e nenhum PII nos `capturarErro`; front sem token no storage; `pnpm audit --prod` limpo (multer 2.2.0); nenhum segredo no histórico do git.

⚠️ **Duas ressalvas de precisão** (a redação anterior induzia ao erro): **não** é "zero SQL cru" — o `retencao.service.ts` usa `.query()` com interpolação; é seguro (só constantes, e o `corte` vai por `$1`), mas existe e merece olhar. E "zero sink de XSS no front" era verdade só no sentido estrito de `dangerouslySetInnerHTML`: o `href` acima era um vetor real.

**Decisão registrada:** os cookies de repasse do Google seguem `SameSite=None` — trocá-los por `Lax` reintroduz a quebra de login no Safari (§8, T-156); o CSRF de sabotagem que isso deixa aberto é aceito conscientemente.

**Decisão registrada (T-175, 19/07):** o **cadastro mantém o 409 "E-mail já cadastrado"** — a enumeração de conta que isso permite é **aceita conscientemente**. O auto-login do cadastro (T-100) é incompatível com não-enumeração (e-mail novo loga, existente não → a diferença de resposta é o oráculo); fechar de verdade exigiria matar o auto-login. Login (`Credenciais inválidas`) e recuperação de senha já são neutros, o brute-force é barrado (T-104) e o pre-hijacking já foi fechado (T-159) — o 409 só revela existência, dado de baixo valor num B2B. **Não "conserte" trocando por mensagem neutra:** não fecha o vazamento (status/timing) e piora a UX.

**Próximo: o Épico 14 (achados do primeiro teste em produção) reabriu o backlog.** Os 13 épicos originais estão fechados, mas o QA end-to-end de 17/07 gerou **T-166–T-179** (§6, `BACKLOG.md`). Ordem sugerida pela severidade do próprio relatório:

- **T-166 — Congelamento/loop de render** 🔴 — o **único ALTO**, e o que mais afastaria o cliente ("o site quebrou"). Repro: BDI negativo no orçamento (blur → 400 → trava) e `/perfil` reincidente. É a recomendação de topo.
- **T-167 / T-168** 🟠 — perde-tudo no F5 do onboarding e busca sem validar mín > máx.
- **T-169–T-179** 🟢 — baixos/polimento (mensagens cruas em inglês, deslogado pós-checkout, textos legais em rascunho, etc.).

**Épico 15 — Área de Admin (backoffice do dono), planejado, não iniciado** (T-180–T-198, `BACKLOG.md`). `/admin` só do dono: leitura diária (contas, captação, custo de IA, webhooks Stripe) + operar o beta (estender trial, cortesia, reenviar e-mail) sem SQL manual. **Vem depois do Épico 14** — salvo se o beta fechado começar antes, aí T-180–T-185 viram pré-requisito e sobem. Decisões de arquitetura fixas no épico: role `ADMIN` só por seed, `AdminGuard` no módulo, **não-admin recebe 404** (não 403), auditoria por padrão, rota `/admin` lazy (o primeiro code-splitting do front).

Tasks soltas ainda de pé (não pertencem a nenhum épico):

- **T-140 — Classificar obra por intenção de execução (IA)** 🔴 — a única que aprofunda o **diferencial**. Destrava pregão/dispensa e fecha uma lacuna que a T-113 **mediu** (não supôs).
- **T-55 — Pré-computação na busca** 🟢 ⏳ adiada por custo de IA nos testes.
- **T-16 — Conector Compras.gov.br** 🔴 ⏸️ despriorizada: é subconjunto do PNCP (§9).

**A T-87 (Equipe & convites) foi DESCARTADA em 16/07 (decisão do dono)** — ver `BACKLOG.md`.

⚠️ **O núcleo do produto se provou no primeiro teste real, mas a confiabilidade PERCEBIDA não** — o congelamento (T-166) e a perda de dados no onboarding (T-167) são o que faria um empreiteiro leigo largar. O risco agora não é falta de funcionalidade; é estabilidade e polimento antes do primeiro cliente pagante.

---

## 7. Telas mockadas — NÃO HÁ MAIS NENHUMA (16/07/2026)

> **Esta seção virou histórico.** Ela existia para avisar "não conserte, é placeholder de fase". **Toda tela do produto consome API real hoje** — a última casca (Orçamentos) caiu com o Épico 6, e Agenda (T-91) e Alertas (T-90) com o Épico 7.
>
> Mantida por dois motivos: registrar **como** as cascas morreram (nem todas viraram backend — duas foram REMOVIDAS, e o porquê importa), e impedir que alguém as recrie.

**Como cada casca terminou:**
- **Viraram backend real:** Orçamentos (Épico 6), Agenda (T-91), Alertas (T-90), Onboarding (T-108), Configurações → Dados da empresa (T-99), e Documentos/Prontidão/Resumo com IA (Épico 5). As três abas restantes de Configurações (Dados da empresa, Notificações, Segurança) consomem API real.
- **Foram REMOVIDAS** — o caso que interessa, abaixo.
- **Equipe & Plano foi REMOVIDA (16/07, decisão do dono)** — não virou backend, saiu da tela. O card dizia "gerenciar a assinatura chega em breve" e "o acesso está liberado": as duas frases viraram MENTIRA quando o Épico 11 entrou (a assinatura vive em `/assinatura`, e o paywall barra quem não paga). Assinatura tem entrada própria no menu do usuário; convite de equipe (T-87) segue no backlog, agora sem casca na tela. **Não a recrie como placeholder.**
- **Os canais WhatsApp e Push saíram de Notificações (16/07)** pelo mesmo motivo: switch que não entrega nada é promessa. Sobrou o e-mail, que funciona. O campo `whatsapp` CONTINUA no `NotificationPrefs` (tirá-lo seria migration + mudança de contrato por um canal que pode voltar) — só não tem mais tela.
- Já ganharam backend no Épico 5: Documentos (cofre), Prontidão (genérica e específica), Resumo com IA.

**Regras sobre as mockadas:** não há mais nenhuma — ver o aviso no topo desta seção. As regras antigas ("não assuma que estão prontas", "não conserte fora da task certa") saíram junto com os mocks: mantê-las faria você desconfiar de tela que funciona.

📌 **Dívida deixada para trás:** `apps/web/src/mocks/index.ts` (98 linhas) é **código morto** — nenhum arquivo o importa. O cabeçalho dele ainda afirma que "as telas de Agenda, Perfil e Onboarding não têm endpoints", o que é falso desde a T-91/T-108. Apagar é seguro; ficou fora do escopo da varredura que descobriu isso (§4.3).

---

## 8. Deploy e operação
- **Domínio próprio (13/07/2026) — requisito de funcionamento, não de marca:** front em `app.prumolicita.com.br` e API em `api.prumolicita.com.br` (custom domain no Render). Os dois PRECISAM ser o mesmo site. Com os endereços `*.onrender.com` eles eram **sites diferentes** (`onrender.com` está na public suffix list), então todo cookie da API virava **cookie de terceiro** para o front — Safari bloqueia por padrão, Firefox particiona, Chrome bloqueia com a proteção ligada. Isso derrubou o login com Google ("Login com Google expirou") **e** o refresh de sessão (T-119a: cookie gravado, nunca enviado → `401` no `/auth/refresh` e logout aos 15 min). Nenhuma linha de código depende do domínio (tudo sai de `WEB_ORIGIN` e `VITE_API_URL`) — mas **não volte a servir front e API em sites diferentes**. Passo a passo em `DEPLOY.md`.
  - **Rewrite do static site NÃO é proxy:** testado — apontar `/api/*` para a API devolve `200` com corpo vazio, sem preservar status nem corpo. Não é caminho.
- API: `https://api.prumolicita.com.br` — deploy contínuo no push; migrations no start.
- **Render free:** o serviço hiberna (~15 min) → o `@Cron` da captação NÃO é confiável. Por isso existem o endpoint manual (`POST /captacao/run`) e a captação por busca. Postgres free expira ~30 dias.
- **Notificações por e-mail (T-103 + T-135):** `@Cron` diário **+** disparo manual `POST /notificacoes/run` (mesmo token `CAPTACAO_TRIGGER_TOKEN`) — para um cron externo disparar, já que o `@Cron` hiberna. Manda (a) o **resumo de urgência** (certidão vencendo/vencida + prazo próximo, T-103) e (b) a **"melhor obra pra você hoje"** (1 obra APTA nova da região, T-135), só a usuários com e-mail **verificado + toggle ligado**, sem duplicar (tabela `notification_log`, chave estável por alerta/edital). WhatsApp fica pendente de provedor.
- Variáveis a setar no painel em prod: `WEB_ORIGIN` (CORS do front), `CAPTACAO_TRIGGER_TOKEN`, e a chave da **OpenAI** (`OPENAI_API_KEY`).
- ⚠️ **O `render.yaml` parou no Épico 0 (T-163, achado em 16/07):** ele declara **11** variáveis e o código lê **~34**. Quem recriar o serviço pelo Blueprint recebe um app que **sobe e não funciona**: sem `WEB_ORIGIN` o `main.ts` cai no default `http://localhost:5173`, então o CORS rejeita o front de verdade — e o callback do Google e o `success_url` da Stripe apontam para localhost também. Faltam ainda `OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_*` (4), `GOOGLE_CLIENT_ID`, `SENTRY_DSN`, `IA_BUDGET_*`, `EXCLUSAO_INATIVOS_DIAS`, `RETENCAO_DIAS`. **O ambiente atual está configurado à mão e funciona** — a armadilha é o reprovisionamento, e o sintoma (CORS) não aponta para a causa.
- **Sessão: os DOIS tokens são cookies httpOnly (T-155).** `obrapub_at` (access, 15 min, `path=/`) e `obrapub_rt` (refresh, 7 dias, `path=/auth`), ambos `httpOnly` + `SameSite=Lax` (+`Secure` em prod). **Nenhum token vai no corpo** de login/cadastro/refresh, e o front NÃO guarda token — o navegador manda os cookies sozinho (`credentials: 'include'`). Um XSS não encontra credencial para roubar. No `localStorage` sobrou só um **marcador** de sessão (`obrapub.sessao`), que não dá acesso a nada.
  - ⚠️ **A troca:** auth por cookie abre CSRF (o navegador anexa a credencial sozinho, mesmo em requisição vinda de outro site). Quem fecha é o **`SameSite=Lax`** — e ele só funciona porque front e API são **o mesmo site** (§8). **Nunca crie um GET que altere estado**: `Lax` manda o cookie em navegação de topo por GET, e esse GET viraria um buraco de CSRF. (Auditado em 14/07: nenhum GET muta estado.)
  - O `Authorization: Bearer` segue aceito como fallback (curl/ops/testes) — não enfraquece nada: quem não lê o cookie também não monta o header.
- **Login com Google (T-126, opcional):** `GOOGLE_CLIENT_ID` na API e `VITE_GOOGLE_CLIENT_ID` no front — **mesmo valor**, o client id OAuth ("Web application") do Google Cloud Console. **Ausente → login social desligado:** o botão não renderiza e `POST /auth/google` responde 503. O produto segue inteiro com e-mail e senha.
  - ⚠️ **O vínculo por e-mail NÃO confia em senha de conta não verificada** (16/07): ao entrar pelo Google com um e-mail que já tem conta local, se essa conta tiver senha e `email_verified` **nulo**, a senha e as sessões dela são **revogadas** antes do vínculo. Não é zelo: o cadastro por e-mail é auto-login, então qualquer um cria conta com o e-mail de qualquer um sem abrir a caixa — e sem isto bastava cadastrar o e-mail da vítima e esperar ela entrar pelo Google para herdar a conta já povoada (account pre-hijacking). Quem prova posse do e-mail no vínculo é o Google, e prova para quem está entrando **agora**. Conta já verificada preserva a senha normalmente. **Não "simplifique" removendo a checagem** — o efeito visível (quem nunca verificou perde a senha e redefine) é o preço, e é intencional: os dois estados são idênticos no banco.
- **Login com Google por redirect (T-126b):** entrar/cadastrar não abre popup e **não usa o SDK**. O botão navega para `GET /auth/google/start` (na **API**), que sorteia o nonce, grava o cookie `obrapub_gnonce` e manda o usuário ao Google (`response_type=id_token` + `response_mode=form_post` — sem troca de code, logo **sem client secret**). O Google faz POST do `id_token` em `POST /auth/google/callback`, que confere o nonce, cria a sessão (cookie de refresh) e devolve o navegador em `WEB_ORIGIN/entrando`.
  - **Cadastre no Google Cloud Console:** *Authorized redirect URI* `http://localhost:3000/auth/google/callback` (dev) e `https://api.prumolicita.com.br/auth/google/callback` (prod); *JavaScript origin* `https://app.prumolicita.com.br` (para o botão do SDK que sobrou no Perfil).
  - **O front precisa do rewrite de SPA** (`/*` → `/index.html`) no static site, senão `/entrando` dá 404.
  - **Os cookies de sessão que o callback grava são `SameSite=None`, NÃO Lax (T-156):** a resposta do callback é a um POST **cross-site** do Google (accounts.google.com → nossa API), e um cookie `Lax` setado nesse contexto é **descartado** por Safari e navegadores que bloqueiam terceiros — do mesmo jeito que o cookie do nonce precisa ser `None`. Foi o que quebrou o login com Google quando o refresh virou `Lax` (T-152) e o access idem (T-155). Os cookies do callback são de **repasse** (`setRefreshCookieHandoff`/`setAccessCookieHandoff`): duram só até o `/entrando` chamar `/auth/refresh` (same-site), que os rotaciona para os cookies `Lax` normais. NÃO troque o callback para `Lax` achando que "unifica".
  - **Por que o fluxo começa na API, e não num fetch do front:** o cookie do nonce só sobrevive se for gravado com a API no topo. Gravado a partir do front (outro site) ele é cookie **de terceiro** — Safari/Firefox o descartam, e o login quebra com "Login com Google expirou". Já aconteceu; não volte a buscar o nonce por fetch.
  - O popup do SDK sobrevive só no Perfil, para reautenticar na exclusão de conta (`POST /auth/google`, JSON).
- **E-mail transacional (T-101) — em prod é HTTPS, não SMTP:** o **Render bloqueia a saída nas portas de SMTP (25/465/587) no plano free** (set/2025) — por SMTP o e-mail NÃO SAI de lá (`Connection timeout`), com host/credencial corretos. Não tente consertar por SMTP; é a rede do Render. O `MailService` tem 3 caminhos, nesta ordem: (1) **`RESEND_API_KEY` → Resend por HTTPS** (porta 443, `fetch` nativo, sem SDK) — o caminho de produção; (2) `SMTP_HOST` (+`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`) → SMTP, para plano pago/outro host/Mailtrap; (3) nenhum dos dois → **log-only** (dev): o e-mail é só logado. `MAIL_FROM` precisa ser de **domínio verificado** na Resend, senão ela recusa com 403.
- **E-mail NUNCA bloqueia a resposta HTTP:** cadastro, reenvio de verificação, "esqueci a senha" e boas-vindas disparam o envio em segundo plano (`emSegundoPlano`, em `auth.service.ts`). Antes o envio era aguardado e um provedor pendurado travava a requisição inteira — a conta era criada e o usuário via a tela girando para sempre. O e-mail é efeito colateral do cadastro, não parte dele.
- **Cancelamento no Portal (T-144, correção 15/07):** quem cancela no Customer Portal continua com status `active` na Stripe — ela NÃO muda para `canceled` (o status só vira canceled no fim do período). Quem detecta é `agendadaParaCancelar()` (`stripe-mapper.ts`), que alimenta o `cancelAtPeriodEnd` da entidade/resposta; a tela então mostra "Cancelada · acesso até X" em vez de "renova em X". Sem isso, nada mudava na plataforma ao cancelar.
  - ⚠️ **São DOIS sinais, não um — não "simplifique" para o booleano.** Nas versões atuais da API, cancelar pelo Portal agenda o fim via **`cancel_at`** (timestamp) e deixa **`cancel_at_period_end = false`**. Por isso `agendadaParaCancelar()` aceita qualquer um dos dois (`cancel_at_period_end === true || cancel_at != null`) — para o nosso uso ("não vai renovar, acesso até o fim") os dois significam o mesmo. Ler só o booleano legado faz o cancelamento passar batido e a plataforma seguir dizendo "renova em X" a quem já cancelou. Foi o bug observado em prod: `cancelAtPeriodEnd=false` no log, cancelamento correto na Stripe.
- **Fim de assinatura (T-144):** cancelar NÃO corta na hora — o acesso vale até o `currentPeriodEnd` (a `calcularAcesso` já honra `canceled` com período pago em aberto; a tela e a Privacidade dizem isso). **Retenção de conta inativa (dono, 15/07): 90 dias após o acesso terminar.** A exclusão automática (`ExclusaoInativosService`, cascade completo — a operação mais IRREVERSÍVEL do sistema) fica **DESLIGADA por padrão**: só roda com `EXCLUSAO_INATIVOS_DIAS` setado (ausente/0 = não apaga nada, como o teto de IA). `@Cron` semanal **+** `POST /assinaturas/exclusao-inativos/run` (token de ops). `fimDoAcesso`/`inativoHaMaisDe` (puros) nunca marcam para exclusão quem ainda tem acesso nem quem tem data de fim desconhecida.
- **Paywall (T-130):** `SubscriptionGuard` barra as rotas do PRODUTO (editais, propostas, favoritos, company-profile, agenda, alertas) quando não há trial ativo nem assinatura ativa → **402** com o motivo. Aplicado POR CONTROLLER junto do `JwtAuthGuard` (`@UseGuards(JwtAuthGuard, SubscriptionGuard)`), **não** global: um `APP_GUARD` roda antes dos guards de controller e não veria o `req.user`. **FORA do paywall** (a whitelist é a ausência do guard): `users/me` (o front precisa dele para saber que está bloqueado), `assinaturas/*` (trancar o caminho de pagar = porta sem maçaneta), auth/health/geo. Carência de `past_due` = **3 dias** (decisão do dono). O front lê `assinatura.acessoPermitido` do `/users/me` e mostra a tela de bloqueio (`PaywallGate`) — mas quem BARRA de fato é o 402 do backend (§3.3).
- **Cobrança — Stripe (T-128):** `STRIPE_SECRET_KEY` (use a **restrita `rk_`**, não a secreta `sk_`) e os preços dos dois planos, `STRIPE_PRICE_ID` (mensal) + `STRIPE_PRICE_ID_ANUAL` (T-131). **Ausentes → cobrança em 503** e o resto do produto segue (mesma degradação da IA/Google/e-mail). A chave restrita precisa de **leitura em Prices, Invoices e Payment Methods** — a tela de assinatura lê preço, faturas e cartão. Regras que a Stripe impõe e que o código respeita: **nunca** passar `payment_method_types` (mata os métodos dinâmicos e a conversão — quem escolhe os meios é o Dashboard, hoje só cartão); usar **Billing + Checkout** (`mode: 'subscription'`), nunca um loop de renovação próprio; **sem `automatic_tax`** (o Stripe Tax não cobre o Brasil); **sem `trial_period_days`** (o trial é nosso, T-127). Todo `Customer` carrega o `userId` em `metadata` — o webhook (T-129) NÃO pode descobrir o dono pelo e-mail, que a pessoa troca dentro do Checkout. Gestão da assinatura = **Customer Portal** da Stripe (`POST /assinaturas/portal`), não tela nossa.
- **Planos e preços (T-131) — o PREÇO nunca é escrito do nosso lado.** Nem no banco, nem no JSX: valor gravado aqui divergiria do que a Stripe cobra de fato no dia em que o Dashboard mudasse, e a tela mentiria para o cliente. `GET /assinaturas/precos` lê os dois preços da Stripe (cache de 5 min) e o front renderiza o que vier — mudar o valor no Dashboard reflete na tela **sem deploy**. A economia do anual ("2 meses grátis") é calculada dos dois preços, e arredonda os meses **para baixo**: prometer mais do que se entrega é propaganda enganosa.
  - **O plano vem do `recurring.interval` do preço (`month`/`year`), NÃO da comparação com os `STRIPE_PRICE_ID_*`.** O id muda quando você troca um price no Dashboard; o fato de o plano ser anual não. Assim o `stripe-mapper.ts` continua puro (sem depender de env) — e recorrência que não reconhecemos vira `null`, que faz o `montarPatch` **preservar o plano local** em vez de chutar.
  - ⚠️ **O plano PRECISA entrar na chave de idempotência do Checkout.** A Stripe devolve a **resposta original** para uma chave já usada: com a chave antiga (`checkout:user:assinatura`), quem abrisse o checkout no mensal, voltasse e escolhesse o anual receberia de volta a sessão do MENSAL — e pagaria o plano que não escolheu.
  - **Trocar de plano é o Portal**, não `subscriptions.update` nosso (ele já faz o rateio certo — e a gestão é dela, §9). **Exige habilitar "atualizar assinatura" com os dois preços no Dashboard**, senão o botão abre um Portal que não troca nada.
  - **"Assinante desde" vem do `start_date` da Stripe, não de coluna nossa:** uma coluna nova nasceria NULA para todo mundo que já assinou e exigiria backfill; a Stripe já sabe a data e está certa retroativamente.
  - **O PDF da fatura é RECIBO, não NFS-e** (§9): o botão na tela diz "Recibo". Rotulá-lo de "NF" prometeria um documento fiscal que o cliente não recebe ali — a nota de serviço o dono emite à mão, fora do sistema.
- **Reconciliação (T-143) — a rede de segurança do webhook:** o webhook é entrega best-effort e o Render free HIBERNA — um evento perdido deixa um cliente que PAGOU preso no paywall. `POST /assinaturas/reconciliar` (token de ops, sem JWT) + `@Cron` relê o estado ATUAL de cada assinatura na Stripe (`subscriptions.retrieve`, a fonte da verdade) e corrige o que divergir. Sem guarda de ordem (o retrieve é sempre o mais recente); preserva o `pastDueDesde` (a regra é compartilhada com o webhook via `montarPatch`). Disparo manual porque o cron do free tier não é confiável.
- **Webhook da Stripe (T-129) — a FONTE DA VERDADE do pagamento:** `POST /assinaturas/webhook`, **público** (a Stripe não tem JWT nosso) e autenticado pela **assinatura criptográfica** (`STRIPE_WEBHOOK_SECRET`). É aqui, e SÓ aqui, que alguém vira `active` — `success_url` não prova pagamento (o usuário pode digitá-lo na barra). Três coisas que a Stripe FAZ e o código trata: (1) **reentrega** o mesmo evento → idempotência pela PK `stripe_events.id`; (2) entrega **FORA DE ORDEM** → carimbo `stripe_atualizado_em`, evento velho não sobrescreve estado novo; (3) manda corpo de terceiro → verificação sobre o **corpo CRU** (`rawBody: true` no `main.ts` — **não remova**: com o corpo parseado e re-serializado a verificação falha SEMPRE).
  - ⚠️ **`current_period_end` NÃO é campo do topo da assinatura** na API atual — a Stripe o moveu para dentro dos **itens** (`items.data[0]`). Ler do topo devolve `undefined` e grava `null`: quem cancela perderia o acesso na hora em vez de mantê-lo até o fim do que pagou.
- **Observabilidade (T-106):** **Sentry** (`@sentry/nestjs`). `SENTRY_DSN` no painel → erros reportados; **ausente → desligado** (o SDK fica inerte, não quebra o boot — mesma degradação da IA/Google/e-mail). `sendDefaultPii: false` de propósito (LGPD/T-102: nada de e-mail, CNPJ ou documento no relatório). O `SentryGlobalFilter` pega o que sobe por uma requisição; o que **engolimos** (e-mail best-effort, jobs de fundo) é reportado à mão por `capturarErro()` (`common/observabilidade.ts`) — foi um desses que ficou dias invisível (o SMTP bloqueado). **`src/instrument.ts` é importado ANTES de tudo no `main.ts`; não mova.**
- **Saúde de domínio (T-106):** `GET /health` = processo + banco. **`GET /health/captacao` = o produto está VIVO?** (última captação bem-sucedida < 48h). Servidor de pé não é pipeline viva: os dois primeiros respondem "ok" com a captação parada há dias. **Aponte o monitor externo no `/health/captacao`.**
- **Retenção de dados (T-154):** `@Cron` semanal **+** disparo manual `POST /captacao/retencao/run` (mesmo token `CAPTACAO_TRIGGER_TOKEN`). Descarta editais **encerrados há mais de 90 dias** (`RETENCAO_DIAS` para calibrar) **e sem vínculo**; nos encerrados **com vínculo** (favorito/proposta) a linha FICA e só o `raw_payload` é zerado. **NUNCA apague um edital vinculado:** `favoritos` e `propostas` têm FK com `ON DELETE CASCADE` — apagar o edital apaga a **proposta do usuário** (preços, BDI, cronograma). Os PDFs do cofre não entram em retenção por idade (são do usuário; somem na exclusão de conta).
- **Teto de custo de IA (T-133, opcionais):** `IA_BUDGET_DAILY_USD` e `IA_BUDGET_MONTHLY_USD` (USD). Ausentes/0 = **sem teto** (comportamento padrão). Ao estourar, os gatilhos de IA respondem 503 e a pré-computação em massa é pulada até o período virar. Gasto acumulado em `GET /captacao/ia-custo` (mesmo token de `CAPTACAO_TRIGGER_TOKEN`).
- **Front:** verificar se o deploy contínuo do static site está configurado antes de contar com telas novas no ar.

---

## 9. O que NÃO fazer / fora de escopo agora
- ❌ Não mexa nas telas mockadas fora da task certa (§7).
- ❌ Não construa a Camada 2 de captação (Portal de Compras Públicas) sem spike próprio.
- ❌ T-16 (Compras.gov.br) está despriorizada — subconjunto do PNCP.
- ❌ **Orçamento (Épico 6): NÃO replicar OrçaFáscio.** Nada de base SINAPI completa (87 mil composições), composições analíticas, BDI decomposto TCU, Curva ABC ou BIM. O diferencial é o orçamento nascer do edital, não profundidade de SINAPI. Começar simples (cálculo direto, BDI percentual). Detalhes em `BACKLOG.md` (Épico 6).
  - **Revisão (30/06/2026, decisão do dono):** o redesign PrumoLicita adotou o frame "Gestor de proposta", que inclui um **cronograma físico-financeiro SIMPLES** (distribuir a obra em meses por percentual). Isso **revoga a antiga proibição de cronograma** — mas só a versão simples (T-93), nunca o cronograma TCU completo/decomposto. O resto da lista acima segue fora de escopo.
- ✅ **Paywall (Épico 11, decisão do dono 07/07/2026):** o produto deixa de ser aberto — o acesso passa a exigir **trial ativo ou assinatura ativa** (não é mais "qualquer cadastrado usa"). O "pode usar?" é decidido **no backend** (§3.3); o front só renderiza o bloqueio. Ainda não implementado — ver `BACKLOG.md` (T-127–T-131, T-143, T-144).
  - **Gateway: STRIPE** (decisão do dono, 13/07/2026 — substitui o Asaas/Pagar.me do plano original), com **Stripe Billing + Checkout** (nunca um loop de renovação próprio) e o **Customer Portal** para gerir a assinatura. **Trial de 7 dias SEM cartão**, criado no nosso banco (nada é criado na Stripe até haver intenção de compra). **Só cartão na recorrência:** conta Stripe brasileira **não tem Pix Automático** (Pix só avulso) e o boleto, embora recorrente, não aceita estorno e leva dias para compensar — decisão do dono foi ficar só no cartão. **NFS-e fica fora do sistema** (a Stripe não emite nota de serviço; o dono emite manualmente). Detalhes e armadilhas (raw body no webhook, `payment_method_types` proibido, chave restrita `rk_`) no `BACKLOG.md`, Épico 11.
- ❌ Não instale dependências sem perguntar.
- ❌ Não refatore fora do escopo da task.
- ❌ Não tome decisões de arquitetura sozinho — pergunte.
- ❌ Não use IA sem cache e sem validação prévia de acerto (§3.4).

---

## 10. Dívidas técnicas conhecidas (registradas)
1. **Papercut do índice GIN:** todo `migration:generate` recria um `DROP` do índice GIN (full-text). Removido à mão em cada migration. *Melhoria pendente:* defesa automática (teste que falha se o índice some) em vez de disciplina manual.
2. ~~**Banco crescendo:** captação por busca (T-34) + PDFs em bytea aceleram o uso do Postgres free.~~ ✅ **Resolvida (14/07/2026, T-154):** rotina de retenção (90 dias) apaga edital encerrado sem vínculo e zera o `raw_payload` dos vinculados. Os PDFs do cofre seguem fora (são do usuário). Ver §8.
3. **Object storage:** PDFs em bytea é o stopgap certo agora; migrar para object storage (S3 etc.) é a evolução quando escalar.
4. **Tipos compartilhados no front, não em `packages/`** (convenção §5 adiada).
5. ~~**Select de município:** usa subconjunto empacotado no front~~ — ✅ **resolvido (25/06/2026):** `GET /geo/municipios?uf=` lista as 27 UFs a partir da base do IBGE; o front consome via `useMunicipios` (cache por UF) e o `data/cidades.ts` foi removido.
6. **PWA básico** (só manifest); offline/instalação completa exigiria `vite-plugin-pwa`.
7. **Classificador "favor recall":** gera algum ruído no banco. Medir o ruído real quando houver usuário vendo os editais.
8. **Custo de IA em produção:** monitorar via o registro de tokens/custo no banco, especialmente quando UFs novas entram e disparam pré-computação em massa.

---

*Mantenha este arquivo atualizado conforme decisões forem tomadas. Ele é a fonte de verdade sobre como trabalhamos neste repo.*
