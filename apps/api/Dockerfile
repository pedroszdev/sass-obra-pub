# Imagem da API (NestJS) buildada a partir da RAIZ do monorepo.
# No Render: dockerfilePath = ./apps/api/Dockerfile e dockerContext = . (raiz).

############################
# Stage 1 — build
############################
FROM node:20-bookworm-slim AS builder

# pnpm via corepack (usa a versão fixada em "packageManager" no package.json)
RUN corepack enable

# Toolchain para compilar dependências nativas (bcrypt)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifestos primeiro, para aproveitar o cache de camadas do Docker.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json

# Instala todas as deps (inclui dev — necessárias para compilar). O bcrypt é
# compilado aqui graças a pnpm.onlyBuiltDependencies no package.json da raiz.
RUN pnpm install --frozen-lockfile

# Código-fonte e build da API.
COPY . .
RUN pnpm --filter api build

############################
# Stage 2 — runtime
############################
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app/apps/api

# Ferramentas de sistema para a extração de texto do PDF do edital (T-49):
# poppler-utils traz o pdftotext; unzip abre os editais empacotados em ZIP.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils unzip \
  && rm -rf /var/lib/apt/lists/*

# node_modules vem do builder (o store do pnpm fica na raiz; os symlinks de
# apps/api/node_modules apontam para lá, por isso copiamos os dois).
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json

# Entrypoint: aplica migrations e então sobe a API.
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Documental — o Render injeta a porta real via $PORT (a app lê process.env.PORT).
EXPOSE 3000

# Não roda como root. `node` (uid 1000) já vem na imagem oficial; o default do
# Docker é root, e aí qualquer execução de código no contêiner nasce com todos os
# privilégios dele. Não é teórico aqui: a extração de edital (T-49) passa PDF e
# ZIP de terceiro por pdftotext/unzip, binários de sistema que já tiveram CVE de
# parsing. Root não é o que impede a falha — é o que decide o tamanho do estrago.
#
# Nada exige privilégio: o entrypoint só roda typeorm e node; a porta é >1024
# (não precisa de root para bind); os temporários da extração vão para /tmp via
# mkdtemp, não para /app, que fica só de leitura para este usuário.
USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
