# -----------------------------------------------------------------------------
# Woohub — imagem de produção (multi-stage)
# Node fixado em patch (22.17.1, LTS compatível com Next 16 / Prisma 5).
# Build fora do deploy: `docker build -t woohub/app:1.6.4 .` e depois
# `docker push` — o deploy usa somente a imagem já construída.
# -----------------------------------------------------------------------------
FROM node:26.13.0-alpine AS builder
RUN apk add --no-cache openssl ca-certificates
WORKDIR /app

# Dependency layer — cache-friendly: only rerun when package*.json changes
COPY package*.json ./
COPY patches ./patches/
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Source & build
COPY . .
RUN npx prisma generate && npm run build

# Strip devDeps from node_modules after build, then re-add the two tools the
# runtime actually needs, pinned: tsx (server entry) and prisma CLI (job de
# migracao roda `prisma migrate deploy` a partir desta mesma imagem).
RUN npm prune --omit=dev && npm install --no-save tsx@4.21.0 prisma@5.22.0

# Production image
FROM node:26.13.0-alpine AS runner
RUN apk add --no-cache openssl ca-certificates wget
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/scripts ./scripts

# Key-issuance tooling must NOT ship in the production image (an operator with
# container access could mint their own license). The runtime gate only needs
# scripts/license-entrypoint.ts.
RUN rm -f scripts/license-sign.ts scripts/setup-test-user.ts scripts/test_endpoints.sh

# Non-root runtime user. Named volumes (app_data, uploads_data) inherit the
# ownership of these directories on first mount.
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data /app/uploads \
    && chown -R app:app /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=America/Sao_Paulo
EXPOSE 3000

USER app

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/system/health || exit 1

# Sem `prisma db push`, sem migracao e sem criacao de admin no boot:
# migracao e admin sao responsabilidade do job unico (scripts/migrate.sh).

# License gate: valida a licenca ANTES de subir a app / rodar a migracao.
# `-- "$@"` repassa o CMD (ou o `command:` da stack) para o gate, que o executa
# so depois de validar. Sem CMD, o gate sobe src/server/index.ts.
# Public key Ed25519 via LICENSE_PUBLIC_KEY (env) ou scripts/license.pub.
ENTRYPOINT ["sh", "-c", "exec node node_modules/tsx/dist/cli.mjs scripts/license-entrypoint.ts -- \"$@\"", "woohub-gate"]
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server/index.ts"]
