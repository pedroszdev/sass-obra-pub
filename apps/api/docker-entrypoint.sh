#!/bin/sh
set -e

# Aplica migrations pendentes (idempotente — o TypeORM ignora as já aplicadas)
# e só então sobe a API. Roda no startup porque o plano free do Render não
# oferece preDeployCommand; com instância única isso é seguro.
echo "→ Aplicando migrations..."
./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js

# Popula municípios (idempotente; pula se já completo). Best-effort: não bloqueia
# a subida da API se falhar.
echo "→ Semeando municípios (se necessário)..."
node dist/geo/seed-municipios.js || echo "  seed de municípios falhou; seguindo."

echo "→ Subindo a API..."
exec node dist/main.js
