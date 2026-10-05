#!/bin/sh
# Job controlado de migracao (unico ponto que mexe no schema em producao).
#
# - roda FORA do boot da aplicacao (servico one-shot do Compose / servico com
#   replicas: 0 no Swarm, escalado para 1 so durante a migracao);
# - nunca roda em paralelo com outra copia: execute um job por vez;
# - `prisma migrate deploy` aplica apenas migracoes pendentes (nunca `db push`);
# - admin e criado uma unica vez (o script nao recria nem re-promove).
set -eu

echo "[migrate] aplicando migracoes pendentes..."
npx prisma migrate deploy

echo "[migrate] verificando administrador inicial..."
node scripts/setup-admin.js

echo "[migrate] concluido."
