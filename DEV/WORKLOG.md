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

## Fase 3 — Planos, cotas e assinaturas

`src/lib/quota.ts`:

- 3 modos explícitos por empresa: `pilot` (sem assinatura → sem cotas, piloto),
  `active` (limites do plano) e `suspended` (assinatura vencida → 403
  `subscription_inactive`).
- Estados da assinatura: TRIALING/ACTIVE ativos; PAST_DUE ativo dentro da janela
  de carência (`graceEndsAt`); CANCELED ativo até `currentPeriodEnd` quando
  `cancelAtPeriodEnd`; demais → suspensa.
- Contadores: `messages_sent` incrementado **uma vez, na aceitação do envio**;
  `requests` (só `/api/v1`) contado em memória e gravado a cada 60 s
  (`startUsageFlusher`, iniciado no bootstrap e descarregado no SIGINT/SIGTERM) —
  no máximo 1 minuto de uso perdido num crash, sempre a favor do cliente;
  `instances`/`users` são medidos ao vivo (sem drift).
- Cache de assinatura de 30 s no caminho quente (sem SQL por requisição) e
  `invalidateQuotaCache()` chamado em mudanças de plano/assinatura.

Aplicações:

- Envio de mensagens: wrapper de `socket.sendMessage` em
  `src/modules/whatsapp/instance.ts` chama `assertSendQuota(tenantId)` antes do
  anti-spam — cobre API, bot, agendador e autoresposta com uma única contagem.
- Criação de instância: `POST /api/sessions` → `assertInstanceQuota` → 403/402.
- Requisições públicas: `src/proxy.ts` chega a `checkRequestQuotaForTenant` em
  `/api/v1` antes do handler (limites em cache, sem SQL no caminho quente).
- Rotas de envio `send` e `media` traduzem `QuotaError` para 402/403
  (as demais rotas legadas devolvem a mensagem com 500 — mapeamento limpo fica
  no `/api/v1`, Fase 5).

Endpoints novos:

- `GET|POST /api/tenants/members` e `DELETE /api/tenants/members/[userId]`
  (gestão de equipe com `members:read|write`, quota `maxUsers`, auditoria,
  proteção contra remover o último dono).
- `GET /api/tenants/usage` (plano, limites e uso do período).
- `GET|POST /api/plans`, `PATCH /api/plans/[id]` (catálogo; criação/edição só
  para SUPERADMIN; sem preços inventados — `priceCents` é definido pelo operador).
- `GET|POST /api/subscriptions` e `PATCH /api/subscriptions/[tenantId]`
  (ativação **manual auditada**, enquanto não há gateway de pagamento).
- `/api/tenants`, `/api/plans` e `/api/subscriptions` entram nos prefixos
  administrativos: chaves de cliente são recusadas neles.

Robustez: `process.on("unhandledRejection")` loga e mantém o gateway de pé
(uma negação de cota num envio em background não derruba todas as instâncias).

Verificação: `tsc` ok, `build` ok, `lint` **465 problemas (293 errors, 172 warnings)**
— sem regressão. **Não executado**: teste com banco real (sem MySQL/Docker no ambiente).

## Fase 4 — Fila durável, scheduler único e webhooks confiáveis

Scheduler único (antes havia **dois** loops disputando a mesma fila de
`ScheduledMessage`, o que podia enviar a mesma mensagem duas vezes):

- `src/lib/cron.ts` **removido** e a chamada `initScheduler()` saiu de
  `src/modules/whatsapp/manager.ts`.
- `src/modules/whatsapp/scheduler.ts` é o único agendador: tick de 30 s, timezone
  `process.env.TZ || "America/Sao_Paulo"`, avança `sendAt` do recorrente **antes** de
  enfileirar (assim um restart não reenvia), marca `FAILED` quando o cron é inválido e
  mantém `PENDING` enquanto a instância estiver offline (reavaliado no próximo tick).

Fila durável (`MessageJob`, `src/lib/queue.ts`):

- `enqueueSendJob` grava a intenção no banco; o worker (`startJobWorker`, 1 s) reivindica
  com lock otimista (`PENDING → RUNNING` + `lockedBy/lockedAt`) — seguro com um único
  processo, e `requeueStuckJobs` (a cada 60 ticks) recupera jobs órfãos de um crash.
- Retries com backoff exponencial (5 s → 5 min) e `30 s` quando a instância está
  indisponível; `DEAD` após `maxAttempts`; `FAILED` permanente quando a cota nega
  (não adianta repetir).
- Efeitos por `correlationId`: `scheduled:<id>` atualiza a linha de agendamento
  (SENT/FAILED; recorrente já avançou o `sendAt`), `broadcast:<logId>` atualiza
  `BroadcastRecipient`/`BroadcastLog` e emite `broadcast.progress`.
- `resolveJobTenant` — `MessageJob.tenantId` é FK obrigatória, então uma sessão legada
  sem empresa tem o tenant do dono provisionado no momento do enfileiramento.

Broadcast passou a ser fila, não loop em memória:
`POST /api/messages/[sessionId]/broadcast` cria o `BroadcastLog` + destinatários e
enfileira **um job por destinatário** (com jitter) — reinício no meio do broadcast
retoma de onde parou. `recipients` agora exige ao menos um item.

Webhooks confiáveis (entrega durável):

- `deliverWebhook` deixou de dormir dentro de um `for` com `setTimeout` (perdido no
  restart): agora enfileira um job `type: "webhook"` por entrega, com
  `correlationId webhook:<webhookId>:<eventId>` e `maxAttempts` do próprio webhook.
- O worker executa **uma tentativa por job**, rele `url`/`secret` do banco na hora
  (nada de credencial no payload, e webhook desativado/apagado descarta a entrega) e
  usa a escada de backoff histórica 1 s / 5 s / 25 s antes de `DEAD`.
- Cada tentativa continua registrando sua linha em `WebhookLog` com `eventId` estável
  (mesma política de dedupe do consumidor).
- Bootstrap em `src/server/index.ts` sobe o worker junto com o flusher de uso,
  parando em SIGINT/SIGTERM.

Verificação: `tsc` ok, `build` ok, `lint` **464 problemas (292 errors, 172 warnings)**
(queda vinda da remoção de `cron.ts`) — sem regressão.
**Não executado**: teste com banco real (sem MySQL/Docker no ambiente).

## Fase 5 — API pública `/api/v1` + OpenAPI pt-BR

Envelope único (`src/lib/v1/http.ts`):

- Sucesso `{ data, meta? }`; erro `{ error: { code, message, details? }, request_id }`.
- `v1ErrorResponse` mapeia `HttpError` (400/401/403/404/409/422), `QuotaError`
  (402/403), `ZodError` (400 `validation_error`) e qualquer resto em 500
  `internal_error` (logado, nunca vazado). Nenhuma rota v1 devolve 200 com falha.
- `src/proxy.ts` passa a responder **401/403/429/cota** no mesmo envelope quando o
  caminho é `/api/v1` (o painel continua no formato legado), e o documento OpenAPI
  ficou público (só ele, sem dados de tenant).

Rotas entregues (12 arquivos, todas com escopo exigido em `requiredScopeFor`):

| Rota | Método | Escopo |
|---|---|---|
| `/api/v1` | GET | — (info: versão, escopos, limites, códigos de erro) |
| `/api/v1/openapi.json` | GET | público |
| `/api/v1/usage` | GET | `instances:read` (modo, plano, limites, uso) |
| `/api/v1/instances` | GET/POST | `instances:read` / `instances:write` |
| `/api/v1/instances/{id}` | GET/DELETE | `instances:read` / `instances:write` (remoção só do dono, auditada) |
| `/api/v1/instances/{id}/qr` | GET | `instances:read` (QR bruto + base64) |
| `/api/v1/instances/{id}/actions` | POST | `instances:write` (`start/stop/restart/logout/pair`) |
| `/api/v1/instances/{id}/messages` | GET/POST | `messages:read` / `messages:send` |
| `/api/v1/instances/{id}/contacts` | GET | `contacts:read` |
| `/api/v1/webhooks` | GET/POST | `webhooks:read` / `webhooks:write` |
| `/api/v1/webhooks/{id}` | GET/PATCH/DELETE | `webhooks:read` / `webhooks:write` |
| `/api/v1/webhooks/{id}/logs` | GET | `webhooks:read` |

Comportamentos relevantes:

- `src/lib/v1/instance.ts` resolve a instância por `id` **ou** `session_id`, confere
  acesso (`canAccessSession`) e normaliza o destino (`5511...` → `@s.whatsapp.net`).
- Envio de **texto** é síncrono; envio de **mídia por URL** devolve **202 + `job_id`**
  e vai para a fila `MessageJob` (download com SSRF no worker, cota conferida de novo
  na entrega). Instância desconectada → 409 `instance_not_connected`.
- Webhooks: escopo por empresa, `secret` nunca sai na resposta (só
  `secret_configured`), eventos validados contra `WEBHOOK_EVENT_TYPES` (fonte única
  em `src/lib/webhook.ts`), URLs só http/https.
- Chave **vinculada a uma instância**: não cria instâncias (`403`) e o webhook criado
  por ela é forçado a apontar para a própria instância (fecha buraco do binding que
  só olha o caminho).
- `GET /api/v1/openapi.json` é servido por `src/lib/v1/openapi.ts` — OpenAPI 3.1 em
  português, com envelope, códigos de erro, escopos e exemplos.
- Correção: `/api/messages/[sessionId]/[jid]/send` passava a `message` como string
  para `ChatService.sendTextMessage`, que espera `{ text }` — o envio pela API legada
  era corrompido pelo spread. Corrigido (a ação do painel já usava `{ text }`).

Verificação: `tsc` ok, `build` ok (12 rotas `/api/v1*` registradas), `lint` **464
problemas (292 errors, 172 warnings)** — código novo com `eslint` limpo.
**Não executado**: chamada HTTP real contra banco (sem MySQL/Docker no ambiente).
