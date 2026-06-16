#!/bin/sh
set -e

# Aplica migrations pendentes (idempotente — o TypeORM ignora as já aplicadas)
# e só então sobe a API. Roda no startup porque o plano free do Render não
# oferece preDeployCommand; com instância única isso é seguro.
echo "→ Aplicando migrations..."
./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js

echo "→ Subindo a API..."
exec node dist/main.js
