# Deploy (T-06)

A API roda no **Render** como imagem **Docker**, com **Postgres gerenciado**.
Tudo é descrito no [`render.yaml`](./render.yaml) (infra como código). Deploy
contínuo: cada push na `main` redeploya.

> ⚠️ **Plano free do Render:** o web service **hiberna após ~15 min** sem tráfego
> (a 1ª requisição depois disso tem *cold start* de alguns segundos) e o
> **Postgres free expira ~30 dias** após criado. Para algo estável/permanente,
> suba os planos pagos (ou migre para o Railway — a mesma imagem Docker serve).

---

## Passo a passo (você, no painel do Render)

1. Crie a conta em <https://render.com> e conecte sua conta do **GitHub**.
2. **New → Blueprint** e selecione este repositório.
3. O Render lê o `render.yaml` e mostra o que vai criar: o serviço `obrapub-api`
   e o banco `obrapub-db`. Clique em **Apply**.
4. Aguarde o primeiro build/deploy. Não há nada para digitar: as variáveis de
   banco vêm do próprio Postgres e os segredos JWT são **gerados pelo Render**.
5. Ao terminar, abra a URL do serviço e teste:
   - `https://<sua-url>.onrender.com/health` → deve responder `{"status":"ok",...}`.

Pronto: `/health` público, banco conectado e migrations aplicadas.

---

## Como funciona por dentro

- **Build:** `apps/api/Dockerfile` (multi-stage) builda a partir da **raiz** do
  monorepo (`dockerContext: .`), compila o `bcrypt` nativo e gera o `dist/`.
- **Migrations:** o `docker-entrypoint.sh` roda `typeorm migration:run` (sobre o
  data-source **compilado**) **antes** de subir a API. É idempotente — migrations
  já aplicadas são ignoradas. (Roda no startup porque o plano free não tem
  `preDeployCommand`; com instância única é seguro.)
- **Porta:** a API lê `process.env.PORT`, que o Render injeta automaticamente.
- **Banco:** conexão pelo **host interno** do Render (mesma região), sem SSL.

---

## Variáveis de ambiente (definidas pelo `render.yaml`)

| Variável | Origem |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | do Postgres `obrapub-db` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | gerados pelo Render |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | `15m` / `7d` |
| `CAPTACAO_TRIGGER_TOKEN` | gerado pelo Render (gatilho da captação) |
| `WEB_ORIGIN` | URL do front em produção (CORS) — defina no painel |

> **`WEB_ORIGIN`** não está no `render.yaml` porque depende da URL do front
> (static site). Defina-o no painel da API com a URL exata do front, **com
> `https://` e sem barra final** (ex.: `https://app.prumolicita.com.br`).
> Sem isso o navegador bloqueia o front por CORS.

---

## Domínio próprio — NÃO é cosmético, a sessão depende dele

Front e API **precisam ser o mesmo site**, senão a sessão quebra. Não é preferência
de marca: é o que faz o produto funcionar.

**O que acontecia com os endereços `*.onrender.com`:** `onrender.com` está na
[public suffix list](https://publicsuffix.org/), então `sass-obra-pub.onrender.com`
e `obrapub-api.onrender.com` são **sites diferentes** para o navegador. Todo cookie
da API vira **cookie de terceiro** para o front — e Safari bloqueia por padrão,
Firefox particiona, Chrome bloqueia para quem ligou a proteção. Consequências reais,
já vistas em produção:

- **Login com Google:** o cookie do nonce sumia → "Login com Google expirou".
- **Sessão (T-119a):** o cookie de refresh é gravado mas **nunca é enviado** → o
  `POST /auth/refresh` responde `401` e o usuário é deslogado quando o access token
  expira (15 min).

**A configuração correta** — dois subdomínios do MESMO domínio:

| Serviço | Domínio | DNS (CNAME) |
|---|---|---|
| Front (static site) | `app.prumolicita.com.br` | → `sass-obra-pub.onrender.com` |
| API (web service) | `api.prumolicita.com.br` | → `obrapub-api.onrender.com` |

Assim os dois são `prumolicita.com.br`: o cookie da API deixa de ser de terceiro e
volta a trafegar em qualquer navegador. **Nenhuma mudança de código** — só:

- **API** → `WEB_ORIGIN` = `https://app.prumolicita.com.br`
- **Front** → `VITE_API_URL` = `https://api.prumolicita.com.br` **+ redeploy do
  static site** (no Vite a variável entra no *build*; salvar no painel não basta)
- **Front → Redirects/Rewrites** → `/*` → `/index.html`, ação **Rewrite** (sem isso
  `/entrando`, `/login` etc. dão 404 — o roteamento é client-side)
- **Google Cloud Console** → *Authorized redirect URI*
  `https://api.prumolicita.com.br/auth/google/callback` e *JavaScript origin*
  `https://app.prumolicita.com.br`

> ⚠️ **Rewrite não serve de proxy.** Já testamos apontar `/api/*` do static site
> para a API (para forjar uma origem só sem domínio): o Render devolve **200 com
> corpo vazio**, sem preservar status nem corpo. Não insista nesse caminho.

---

## Disparar a captação manualmente

O `@Cron` diário (3h) **não dispara de forma confiável no plano free** (o serviço
hiberna). Para popular/atualizar o banco sob demanda há um endpoint protegido:

```bash
# Pegue o token em: painel do Render → obrapub-api → Environment → CAPTACAO_TRIGGER_TOKEN
curl -X POST https://obrapub-api.onrender.com/captacao/run \
  -H "x-captacao-token: <TOKEN>"
# → 202 { "status": "accepted" }  (roda em segundo plano)
```

- A captação busca só as **UFs de usuários ativos** (lê a `uf` dos usuários).
  Cadastre ao menos um usuário com a UF desejada **antes** de disparar.
- A 1ª vez numa UF é **backfill** (últimos 30 dias); depois é incremental.
- O endpoint responde `202` na hora e roda em background — acompanhe pelos
  **logs** do serviço ou pela tabela `sync_runs`; em ~1–2 min a busca já mostra
  os editais. Respostas: `401` (token errado), `409` (já rodando), `503` (token
  não configurado).
- Dá para automatizar apontando um **cron externo** (ex.: cron-job.org) para esse
  endpoint — isso também mantém o serviço acordado.

---

## Testar a imagem localmente (opcional)

Com o Postgres de dev no ar (`docker compose up -d`):

```bash
# build a partir da raiz do repo
docker build -f apps/api/Dockerfile -t obrapub-api .

# roda na MESMA rede do Postgres de dev, alcançando-o pelo nome do container.
# (Confira o nome da rede com: docker network ls | grep obra)
docker run --rm -p 3000:3000 --network sassobrapub_default \
  -e DATABASE_HOST=obrapub-postgres \
  -e DATABASE_PORT=5432 -e DATABASE_USER=obrapub \
  -e DATABASE_PASSWORD=obrapub -e DATABASE_NAME=obrapub \
  -e JWT_ACCESS_SECRET=dev -e JWT_REFRESH_SECRET=dev \
  obrapub-api

curl http://localhost:3000/health
```

> No **macOS/Windows** (e no Linux só com `--add-host=host.docker.internal:host-gateway`)
> dá para usar `DATABASE_HOST=host.docker.internal` em vez da rede do compose.

---

## Notas

- A imagem inclui `devDependencies` (mais simples e confiável). Para enxugar
  depois, dá para usar `pnpm deploy --prod` — nesse caso, mover `dotenv` para
  `dependencies` (o data-source o importa).
- Conexão **externa** ao Postgres (fora do Render) exige SSL — não é o caso aqui.
- Se a sua versão do Render não aceitar `runtime: docker`, troque por `env: docker`.
