# WORKLOG

Registro cronológico. Commits por etapa.

## 333485f — Baseline: WA-AKG v1.6.4 (pre-Woohub)

Snapshot de referência recebido do upstream (archive, sem metadados de commit originais).

Checks de baseline:

- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
- `npm run lint` → exit 1, **473 problemas (296 errors, 177 warnings)** — preexistente

## Fase 1 — Segurança antes da camada comercial

Schema comercial (bases da Fase 2 entregues junto, pois a segurança por chave depende de Tenant/ApiKey):

- `prisma/schema.prisma`: `Tenant`, `TenantMember`, `ApiKey`, `Plan`, `Subscription`,
  `Invoice`, `PaymentEvent`, `UsageCounter`, `AuditLog`, `MessageJob`, `IdempotencyRecord`;
  `Session.tenantId`, `Webhook.tenantId`, `WebhookLog.eventId/attempt/nextAttemptAt`,
  enums de assinatura/job; `SystemConfig` com `telemetryEnabled`, timezone
  `America/Sao_Paulo`, appName `Woohub`.
- Migrações versionadas: `prisma/migrations/0_init` (baseline) e
  `prisma/migrations/0001_commerce`, geradas offline com `prisma migrate diff`.

Segurança:

- `src/lib/security/crypto.ts` — AES-256-GCM com envelope `v1.kid.iv.tag.ct`, AAD por linha,
  chave só em ambiente, anel de chaves para rotação, falha dura em produção sem chave.
- `src/lib/security/api-keys.ts` — geração com `crypto.randomBytes` (não `Math.random`),
  formato `whk_<publicId>_<secret>`, armazenamento apenas do SHA-256, comparação constant-time,
  redação para logs.
- `src/lib/security/rate-limit.ts` — janela deslizante em memória (réplica única).
- `src/lib/security/ssrf.ts` — validação de host/DNS/faixas privadas, redirecionamento manual,
  limites de tempo e bytes.
- `src/lib/permissions.ts` — matriz explícita por papel; escopos de chave restritos.
- `src/lib/access.ts` — autenticação central + escopo exigido por rota + binding de instância.
- `src/lib/audit.ts` — auditoria append-only.
- `src/server/socket.ts` — handshake autenticado (cookie JWT ou API key), salas por empresa,
  revalidação em cada `join-session`, bloqueio de impersonation em `join-user-room`.
- `src/lib/realtime.ts` — nomenclatura/validação de salas e revogação.
- `src/proxy.ts` — rate limit (429), validação real de chave (401), escopo (403),
  headers de identidade sobrescritos, proteção de login/cadastro.
- `src/lib/api-auth.ts` — reescrito sobre o novo contexto; isolamento por tenant em
  `canAccessSession` / `isSessionOwner` / `getAccessibleSessions`; auditoria de SUPERADMIN.
- `src/modules/whatsapp/auth/usePrismaAuthState.ts` — credenciais Baileys criptografadas;
  erro de leitura/decrypt aborta a inicialização (nunca recria credencial em silêncio);
  falha de gravação é retentada e reportada.
- `src/modules/whatsapp/instance.ts` — rejeição de `saveCreds` tratada e logada.
- `src/lib/webhook.ts` — entrega com SSRF, sem redirect, retries com backoff, `eventId`
  estável por entrega, escopo por tenant (removido vazamento para SUPERADMIN).
- `src/modules/whatsapp/chat.service.ts`, `scheduler.ts` — download de mídia com SSRF/limites.
- Rotas de mídia — listagem por instâncias acessíveis; arquivo sem instância identificável → 404.
- `src/server/index.ts` — CORS do Socket.IO com allow-list (nunca `*`), heartbeat externo
  opcional e desligado por padrão com dados documentados.
- `/api/auth/register` — provisiona tenant + auditoria.
- `/api/api-keys` (novo) e `/api/user/api-key` (legado adaptado: segredo mostrado só na criação).
- `.env.example` — reescrito em pt-BR, sem segredos, com as novas variáveis.
- `DEV/` — documentação durável criada.

Verificação desta etapa: `tsc` ok, `build` ok, `lint` sem novos erros
(296 → 293 errors; total 473 → 477 problemas — o aumento veio de warnings em
imports não usados, corrigidos na etapa seguinte).

## Fase 2 (dados) — migração de tenancy + compatibilidade de chaves legadas

- `scripts/migrate-tenancy.js` — backfill idempotente com **dry-run por padrão** e `--apply`:
  1. cria `Tenant` + `TenantMember` para cada usuário sem empresa;
  2. preenche `Session.tenantId` e `Webhook.tenantId` a partir do dono;
  3. converte `User.apiKey` (plaintext `wag_...`) em `ApiKey` com `sha256`,
     preservando a mesma chave do cliente;
  4. relata sessões com acesso de usuários de outra empresa, webhooks que a
     proteção SSRF passará a bloquear e chaves legadas restantes
     (`--clear-plaintext` apaga os plaintexts após validação).
- Chaves legadas continuam aceitas durante a janela de depreciação:
  `isLegacyKeyFormat`/`redactLegacyKey` em `src/lib/security/api-keys.ts`,
  consulta por hash em `src/lib/access.ts` e `src/server/socket.ts`
  (escopos padrão de cliente; endpoints administrativos seguem bloqueados).
- Observabilidade: `logger.error` nos `catch` das rotas de chave (antes engoliam o erro).
- Limpeza de imports/diretives não usados nas rotas de chave, `webhook.ts`,
  `crypto.ts`, `socket.ts` e `access.ts` (`fallbackTenantRole` agora é a fonte
  única do papel de quem provisiona a empresa).

Verificação: `tsc` ok, `build` ok, `lint` **465 problemas (293 errors, 172 warnings)**
(vs. 477/293/184 antes desta etapa e 473/296 no baseline upstream).
