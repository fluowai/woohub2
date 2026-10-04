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
| 5. API pública /api/v1 + OpenAPI | entregue (`a5efe15`): 12 rotas em `src/app/api/v1`, envelope `src/lib/v1/http.ts`, spec `src/lib/v1/openapi.ts` |
| 6. Frontend Woohub | **em andamento** — tema/marca, UI pt-BR e páginas comerciais prontos; faltam termos/privacidade em pt-BR e tradução das superfícies legadas |
| 7. Cobrança | pendente (interface de gateway pronta em `quota`/`subscriptions`) |
| 8. Docker/docs/testes/piloto | pendente |

## Frontend (Fase 6) — o que já mudou

- Marca **Woohub** e idioma **pt-BR**: `src/app/layout.tsx` (`lang="pt-BR"`, `locale: "pt_BR"`,
  título/descrição em português), `src/app/page.tsx` (landing), login/cadastro, dashboard,
  notificações, navbar, sidebar/mobile-nav, docs/swagger.
- Paleta laranja/branco/preto em `src/app/globals.css` (`--primary` = `oklch(0.646 0.222 41.116)`,
  fundo quente claro, dark com primary âmbar) + `.text-gradient` âmbar; favicon laranja
  (`src/app/icon.tsx`). Gradientes `to-blue-500` → `to-amber-500`.
- Páginas comerciais novas: `/dashboard/billing` (planos, assinatura, uso com barras),
  `/dashboard/team` (membros), `/dashboard/api-keys` (CRUD de chaves, segredo exibido 1x),
  ligadas no menu (`sidebar-nav.tsx` e `mobile-nav.tsx`, com `allowedRoles`).
- Defaults de produto renomeados: nome do bot/pacote de adesivo `Woohub Bot`/`Woohub`,
  `appName` padrão `Woohub`. Créditos upstream preservados (links GitHub, comentários,
  `REPO_NAME` do verificador de atualizações continua `WA-AKG`).
- Ainda em inglês: `src/app/privacy`, `src/app/terms` (páginas legais), textos internos de
  `src/lib/swagger.ts` e parte das mensagens de erro de rotas legadas.

## Próximos passos imediatos

1. Concluir a Fase 6: termos/privacidade em pt-BR, textos restantes das telas legadas.
2. **Fase 7**: interface de gateway de pagamento (ou ativação manual documentada).
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
