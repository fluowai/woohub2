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
| 3. Planos/cotas/assinaturas | entregue: `src/lib/quota.ts` + endpoints de planos/assinaturas/membros/uso |
| 4. Fila/agendamento/webhooks | entregue: `src/lib/queue.ts` (MessageJob) + scheduler único + webhook via fila |
| 5. API pública /api/v1 + OpenAPI | pendente |
| 6. Frontend Woohub | pendente |
| 7. Cobrança | pendente (interface de gateway pronta em `quota`/`subscriptions`) |
| 8. Docker/docs/testes/piloto | pendente |

## Próximos passos imediatos

1. Commitar a Fase 4 (fila + scheduler único + webhook durável).
2. **Fase 5**: rotas `/api/v1/*` (instâncias, mensagens, contatos, webhooks,
   uso) com OpenAPI pt-BR e mapeamento limpo de erros de cota (402/403).
3. Aplicar a migração real: `npx prisma migrate deploy` →
   `node scripts/migrate-tenancy.js` (dry-run) → `--apply`.
4. Operação: criar planos (`POST /api/plans`) e atribuir
   (`POST /api/subscriptions`) — sem gateway, ativação é manual auditada.

## Fila (Fase 4) — como funciona

- `MessageJob` no banco, worker único de 1 s com lock otimista; réplica única.
- `type`: `send_message` | `webhook`. `correlationId`: `scheduled:<id>`,
  `broadcast:<logId>`, `webhook:<webhookId>:<eventId>` ou nulo (fire and forget).
- Ver `src/lib/queue.ts` (fila/worker) e `src/modules/whatsapp/scheduler.ts`
  (agendador único — `src/lib/cron.ts` foi removido por duplicar envios).

## Bloqueios externos

- Sem MySQL local → validação de migração em banco real pendente.
- Sem gateway de pagamento/credenciais → ativação de assinatura fica manual auditada.
