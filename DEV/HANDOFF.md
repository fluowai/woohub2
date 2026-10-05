# HANDOFF

Dev server: `npm run dev` -> `http://localhost:3000` (requires local `.env`; first line of
`src/server/index.ts` imports `next/dist/server/node-environment` -- see WORKLOG 2026-10-05).
MySQL still down -> scheduler/queue log `Can't reach database server`.

## Situação

Repositório **WA-AKG v1.6.4** recebido como archive (sem `.git`); transformado na plataforma
comercial **Woohub**. Git portátil (MinGit) em `C:\Users\paulo\.local\mingit`
(identidade `Woohub Dev <dev@woohub.local>`).

## Estado dos checks (2026-10-05)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **57/57** (5 arquivos) |
| `npm run lint` | **464 problemas / 285 errors** (baseline 473/296 → reduziu) |
| `npm run build` | **exit 0** |
| Docker/MySQL | **indisponíveis** no ambiente → stack e migrações não executadas |

## Fases

| Fase | Estado |
|---|---|
| 1. Diagnóstico + segurança | entregue (`c91b8a0`) |
| 2. Empresas/migração/isolamento | entregue (`dac6e4f`) + páginas SUPERADMIN (`6bace93`) |
| 3. Planos/cotas/assinaturas | entregue (`dea5abe`) + páginas SUPERADMIN (`6bace93`) |
| 4. Fila/agendamento/webhooks | entregue (`e30fa90`) |
| 5. API pública /api/v1 + OpenAPI | entregue (`a5efe15`) + complemento (`f720c82`) |
| 6. Frontend Woohub pt-BR | entregue (`0c9ed1c`, `3c85af6`, `c24135a`) |
| 7. Cobrança | entregue (`36d9ca7`) — webhook assinado, dedup, checkout honesto |
| 8. Docker/docs/testes/piloto | entregue (`eb76b83`, `131514f`) + docs (`BACKUP_RECOVERY`, `RETENTION`, `FINAL_REPORT`) |

## O que mudou desde o último handoff

- **Fase 8 — deploy**: stack renomeada para **`woo-woohub`**; imagens com tag fixa
  (`woohub/app:1.6.4`, `mysql:8.0.46`, `node:22.17.1-alpine` — sem `latest`); `replicas: 1`;
  banco sem porta publicada (rede interna); job único de migração `scripts/migrate.sh`
  (`prisma migrate deploy` + admin idempotente) — **sem `prisma db push` no boot**;
  healthcheck público `GET /api/system/health`; rotação de logs; limites CPU/memória;
  `TZ=America/Sao_Paulo`; guia completo em `docs/DEPLOY.md` (inclui Compose × Swarm).
- **Fase 2/P0 — admin**: páginas `/dashboard/audit`, `/dashboard/tenants`,
  `/dashboard/plans`, `/dashboard/subscriptions` + rota `GET/POST /api/audit`
  (SUPERADMIN); flags `superadminOnly` sincronizadas nos dois navs (o mobile não tinha
  a flag em "Usuários").
- **Cobrança**: `verifyMercadoPagoSignature` agora valida a assinatura via SDK e aplica a
  janela de replay **normalizando ts em segundos e milissegundos** (a doc do MP usa segundos
  e o SDK JS calcula em ms — delegar a tolerância ao SDK rejeitaria webhooks reais).
- **Escopos**: escrita em `/api/contacts*` exige `instances:write` (antes bastava escopo de
  leitura); `/api/audit`, `/api/payments`, `/api/invoices`, `/api/jobs` entraram nos
  prefixos administrativos (chave de cliente nunca alcança).
- **Testes**: `tests/payments.test.ts` e `tests/v1-access.test.ts` (assinatura,
  classificação/dedup, escopos, idempotência); `vitest.config.ts` ganhou resolução de
  `next-auth` + env de teste (nenhum teste conecta em banco).
- **pt-BR**: tradução de Usuários, Configurações e Monitor; fuso padrão `America/Sao_Paulo`.

## Pendências conhecidas (não mascaradas)

1. **Sem Docker/MySQL no ambiente** → stack, migrações reais e drill de backup
   permanecem não executados (`docs/DEPLOY.md`, `docs/BACKUP_RECOVERY.md`).
2. **Sem gateway configurado** → checkout `503 gateway_not_configured`; ativação manual
   auditada até credenciamento + teste sandbox.
3. **Expurgo de dados é manual** (`docs/RETENTION.md`): não há job de retenção de
   mensagens/mídia/auditoria; só logs de webhook (30 dias) e rotação de contêiner.
4. **Tradução parcial**: restam `src/app/privacy`, `src/app/terms`, textos internos de
   `src/lib/swagger.ts` e páginas legadas não críticas (labels, scheduler, webhooks…).
5. **CI** (`.github/workflows/ci.yml`) existe mas não foi executado (sem GitHub Actions aqui).

## Próximos passos recomendados

1. Ambiente com Docker/MySQL: `docker compose up -d` → drill de backup/restauração →
   registrar em `DEV/VERIFY.md`.
2. Credenciamento MercadoPago + webhook público + pagamento sandbox (fecha Fase 7 em produção).
3. Tarefas de expurgo agendadas (retention) antes de piloto com clientes reais.
4. Backlog: tradução das telas legadas restantes, CSP em `next.config.ts`,
   automação de retenção, gateway Stripe.

## Mapas úteis

- API pública (Fase 5): envelope `{ data, meta? }` / erro `{ error: { code, message }, request_id }`
  em `src/lib/v1/http.ts`; escopos em `src/lib/access.ts:requiredScopeFor`;
  contrato em `GET /api/v1/openapi.json` (público).
- Fila (Fase 4): `src/lib/queue.ts` (worker único 1 s, lock otimista) +
  `src/modules/whatsapp/scheduler.ts`.
- Cobrança: `src/lib/payments.ts` + rotas `src/app/api/payments/*` (webhook é público via
  `PUBLIC_API_EXACT` em `src/proxy.ts`).
- Operação: `docs/DEPLOY.md`, `docs/BACKUP_RECOVERY.md`, `docs/RETENTION.md`,
  `FINAL_REPORT.md` (pendências externas + plano de piloto).

## Bloqueios externos

- Docker daemon indisponível e MySQL ausente → validação de implante/migração pendente.
- Sem credenciais de gateway → ativação de assinatura manual auditada (modo piloto).
