# HANDOFF

## Situação

Repositório **WA-AKG v1.6.4** recebido como archive (sem `.git`, sem git instalado na máquina).
Git portátil (MinGit) provisionado em `C:\Users\paulo\.local\mingit` para permitir commits
(o zip fica em `%LOCALAPPDATA%\Temp\opencode\mingit.zip`).

## Baseline (commit `333485f`)

- `tsc --noEmit`: **passou** (exit 0)
- `next build`: **passou** (exit 0)
- `eslint`: **falha preexistente** — 473 problemas (296 erros, 177 warnings)
- Banco MySQL local: **indisponível** (Docker Desktop sem daemon) → migrações geradas offline com `prisma migrate diff`; testes de integração com banco real pendentes de ambiente.

## Fases

| Fase | Estado |
|---|---|
| 1. Diagnóstico + segurança | entregue (commit `c91b8a0`) |
| 2. Empresas/migração/isolamento | entregue (`dac6e4f`): schema, autorização, Socket.IO, proxy, `scripts/migrate-tenancy.js` |
| 3. Planos/cotas/assinaturas | entregue (`dea5abe`): `src/lib/quota.ts` + endpoints de planos/assinaturas/membros/uso |
| 4. Fila/agendamento/webhooks | entregue (`e30fa90`): `src/lib/queue.ts` (MessageJob) + scheduler único + webhook via fila |
| 5. API pública /api/v1 + OpenAPI | entregue: 12 rotas em `src/app/api/v1`, envelope `src/lib/v1/http.ts`, spec `src/lib/v1/openapi.ts` |
| 6. Frontend Woohub | pendente |
| 7. Cobrança | pendente (interface de gateway pronta em `quota`/`subscriptions`) |
| 8. Docker/docs/testes/piloto | pendente |

## Próximos passos imediatos

1. Commitar a Fase 5 (API pública v1).
2. **Fase 6**: frontend Woohub (pt-BR, fundo claro, laranja/branco/preto).
3. Aplicar a migração real: `npx prisma migrate deploy` →
   `node scripts/migrate-tenancy.js` (dry-run) → `--apply`.
4. Operação: criar planos (`POST /api/plans`) e atribuir
   (`POST /api/subscriptions`) — sem gateway, ativação é manual auditada.

## API pública (Fase 5) — mapa

- Envelope: sucesso `{ data, meta? }`; erro `{ error: { code, message }, request_id }`
  (`src/lib/v1/http.ts`). O proxy emite o mesmo envelope para 401/403/429/cota em `/api/v1`.
- Rotas: `/api/v1`, `/api/v1/openapi.json`, `/api/v1/usage`,
  `/api/v1/instances[...]` (lista, criar, detalhe, remover, qr, actions, messages, contacts),
  `/api/v1/webhooks[...]` (CRUD + logs). Escopos em `src/lib/access.ts:requiredScopeFor`.
- Documentação: `GET /api/v1/openapi.json` (OpenAPI 3.1, pt-BR, público).

## Fila (Fase 4) — como funciona

- `MessageJob` no banco, worker único de 1 s com lock otimista; réplica única.
- `type`: `send_message` | `webhook`. `correlationId`: `scheduled:<id>`,
  `broadcast:<logId>`, `webhook:<webhookId>:<eventId>` ou nulo (fire and forget).
- Ver `src/lib/queue.ts` (fila/worker) e `src/modules/whatsapp/scheduler.ts`
  (agendador único — `src/lib/cron.ts` foi removido por duplicar envios).

## Bloqueios externos

- Sem MySQL local → validação de migração em banco real pendente.
- Sem gateway de pagamento/credenciais → ativação de assinatura fica manual auditada.
