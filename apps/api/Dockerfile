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

ENTRYPOINT ["./docker-entrypoint.sh"]
