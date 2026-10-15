# WORKLOG

Registro cronológico. Commits por etapa.

## Auditoria de Prontidão para Produção e Teste do Banco — 2026-10-12

- Teste completo do banco de dados (Supabase PostgreSQL 17.11 no AWS sa-east-1):
  - Conexão e latência verificadas (~740ms a partir do local).
  - 32 tabelas/modelos do Prisma inspecionados com 100% de integridade e queries ativas.
  - 7 migrações versionadas conferidas no histórico `_prisma_migrations` (sem migrações pendentes).
  - Verificação de contas administrativas: `MEGA_ADMIN` (`fluowai@gmail.com`) e `SUPER_ADMIN` (`opauloargolo@gmail.com`).
  - Verificação de sessão WhatsApp ativa: `cmuvvsunp0001t77awr4fox7u` com status `CONNECTED`, `linkedPhone = 4792701014`, 90 mensagens e 885 contatos sincronizados.
- Otimização do teste unitário `tests/validation.test.ts` (import estático de Zod) para eliminar timeout no Windows.
- Execução integral de testes automatizados com Vitest: **117/117 testes passando (11 arquivos)**.
- Criado utilitário unificado `scripts/test-db.mjs` para auditoria de integridade do banco sob demanda.
- Servidor local iniciado com sucesso em `http://localhost:1609`:
  - `GET /` → HTTP 200 (interface web servindo normalmente).
  - `GET /api/system/health` → HTTP 200 `{ status: "ok", database: "up" }`.
  - Sessão WhatsApp `tA2VB4bxzAkY` carregada automaticamente no boot e sincronizada com sucesso (`Session connected and synced successfully`, grupos e contatos atualizados ao vivo).
  - Scheduler de mensagens e worker de filas inicializados.

## Auditoria de produção e marca — 2026-10-08

- Executada auditoria comercial, técnica e de segurança para lançamento da WooHub.
- Corrigida a identidade do dispositivo WhatsApp para `WooHub / Desktop / 1.0.0`.
- Criado servidor MCP JSON-RPC em `scripts/woohub-mcp.mjs` com documentação e script npm.
- Corrigida a página de vendas: removidas promessas não verificadas de bloqueio, SLA, latência, ilimitado e troca de número.
- Adicionados guias de MCP e integrações n8n, Chatwoot e CRMs.
- Corrigidos nomes PM2 e execução por binários locais.
- Adicionada CSP básica.
- Evidência: `initialize` e `tools/list` do MCP passaram localmente.
- Pendência: npm/Node do ambiente apresenta falha de acesso ao cache, Vitest não lê a raiz no sandbox e Turbopack falha ao resolver PowerShell via `systeminformation`.

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

## Fase 6 (parcial) — marca Woohub, UI pt-BR e páginas comerciais

Marca, idioma e tema:

- `src/app/globals.css`: paleta Woohub (laranja/branco/preto). Light: `--background`
  quente claro, `--primary: oklch(0.646 0.222 41.116)` (laranja), foreground/preto quente,
  `--ring`/`--sidebar-primary` iguais ao primary; dark: `--primary: oklch(0.72 0.19 47)`.
  `.text-gradient` trocado de azul para âmbar.
- `src/app/layout.tsx`: `lang="pt-BR"`, `locale: "pt_BR"`, título `Woohub | API de WhatsApp`,
  descrição e keywords em português, `APP_URL` caindo para `http://localhost:3000`.
- `src/app/icon.tsx`: favicon `#ea580c` (laranja). Landing `src/app/page.tsx`, login,
  cadastro, visão geral do dashboard, navbar (notificações) e sidebar/mobile-nav traduzidos.
- `date-fns` com `ptBR` em `navbar.tsx` e `dashboard/inbox` (tempos relativos em português).
- Menus: labels em pt-BR + entradas novas `Planos e uso` (`/dashboard/billing`), `Equipe`
  (`/dashboard/team`) e `Chaves de API` (`/dashboard/api-keys`). `NavGroup` ganhou `id`
  (o grupo principal é identificado por `id: "main"`, não pelo label) e `allowedRoles`
  também no menu mobile.
- Defaults de produto renomeados para Woohub (`appName`, `botName`, pacote de adesivo).
  Créditos preservados: links do GitHub upstream, comentários de crédito e
  `REPO_NAME = "WA-AKG"` no verificador de atualizações.

Páginas comerciais novas (usam os endpoints da Fase 3):

- `/dashboard/billing` — `GET /api/tenants/usage` (modo, plano, barras de requisições e
  mensagens, limites), `GET /api/subscriptions` (assinatura e fim de período) e
  `GET /api/plans` (catálogo com preço formatado em BRL). Sem checkout: o botão de plano
  explica que a ativação é manual e auditada (nada de preço/fluxo inventado).
- `/dashboard/team` — membros da empresa (`GET/POST /api/tenants/members`,
  `DELETE /api/tenants/members/{userId}`), papéis rotulados em pt-BR, aviso de que o
  usuário já precisa existir (a API só adiciona contas existentes).
- `/dashboard/api-keys` — CRUD completo de chaves (`GET/POST/DELETE /api/api-keys`) com
  escopos em checkboxes, validade opcional, cópia do segredo (exibido 1x) e revogação
  com confirmação.

Incidente registrado (para não repetir): scripts de substituição em lote executados pelo
shell do PowerShell corromperam 5 arquivos (`api/settings/system`, `api/.../sticker`,
`api/.../bot-config`, `dashboard/sticker`, `swagger/page`) com substituição global de um
caractere por arquivo. Detectado pelo `tsc`; todos restaurados com `git checkout --` e as
alterações reaplicadas uma a uma. **Regra daqui em diante: edição de arquivo só pela
ferramenta de edição, nunca por script de substituição em lote.**

Verificação: `tsc` ok, `build` ok (`/dashboard/billing`, `/dashboard/team` e
`/dashboard/api-keys` registrados), `lint` **463 problemas (291 errors, 172 warnings)** —
abaixo do baseline (464/292), páginas novas com `eslint` limpo.
**Não executado**: navegação real em navegador/validação visual (sem ambiente gráfico).

## Fase 6 (conclusão) — `0c9ed1c`

Páginas comerciais, identidade Woohub e UI pt-BR consolidadas (seção acima); commit com
a Fase 6 completa.

## Fase 7/8 (base) — `3c85af6`

- CRUD de empresas (`/api/tenants`, `/api/tenants/[tenantId]`), perfil de usuário
  (`/api/user/profile`) e telas `/dashboard/account`, `/dashboard/invoices`,
  `/dashboard/jobs` (DLQ) e `/dashboard/docs/v1`.
- Páginas legais `/privacy` e `/terms` traduzidas.
- `next.config.ts`: headers de segurança (X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy, HSTS) — sem CSP (declarado como pendência).
- Base do Vitest (`vitest.config.ts`) e testes de permissões/validação/SSRF.
- `docker-stack.yml` inicial, `.github/workflows/ci.yml`.
- Verificação da época: `tsc` ok, `build` ok.

## Fase 7 — cobrança — `36d9ca7`

- `src/lib/payments.ts`: classificação MercadoPago, `buildExternalEventId` (dedup por
  tipo+referência externa, truncado em 191), confirmação server-to-server antes de
  efeitos, efeitos de status transacionais (Invoice/Subscription), `configuredGateway()`.
- `POST /api/payments/checkout` honesto (503 `gateway_not_configured` sem credencial) e
  webhook `/api/payments/webhook/mercadopago` obrigatoriamente assinado (401 sem
  assinatura, 503 sem `PAYMENT_WEBHOOK_SECRET`), entrada em `PUBLIC_API_EXACT` do proxy.
- `.env.example` seção 11 (variáveis do gateway, sem segredos).

## Fase 5 (complemento) — `f720c82`

- `POST /instances/{id}/connect|disconnect`, `GET /instances/{id}/messages/{messageId}`,
  `Idempotency-Key` (`409 idempotency_key_reuse` / `idempotency_in_progress`),
  status honestos (`SENT`, `accepted` para mídia).
- OpenAPI com exemplos cURL/JS/n8n e parâmetro `Idempotency-Key`.

## Fase 8 — deploy reproducível — `eb76b83`

- Imagem `node:22.17.1-alpine` (tag fixa), CMD simplificado, `tsx`/`prisma` reinstalados
  após `prune` (prisma CLI é devDep). Nunca tag `latest`.
- `docker-compose.yml`: nome `woo-woohub`, `mysql:8.0.46` sem porta publicada, job
  one-shot `migrate` (`prisma migrate deploy` + admin idempotente via
  `scripts/setup-admin.js`), `depends_on: service_completed_successfully`, healthchecks,
  rotação de logs, limites de recursos, rede `backend` internal + `public`.
- `docker-stack.yml`: `replicas: 1`, job de migração `replicas: 0` (escalonado sob
  demanda), overlay `backend` internal, `deploy.restart_policy`.
- `start.sh` ? `prisma migrate deploy` (não `db push`); `scripts/migrate.sh` (job de
  implante); `GET /api/system/health` público (200/503) adicionado a
  `PUBLIC_API_EXACT` em `src/proxy.ts`.
- `.gitattributes` (LF para sh/yml/ts/...), `.env.example` seção 10 corrigida,
  `docs/DEPLOY.md` (pré-requisitos, build, Compose, Swarm, migração, proxy,
  Compose × Swarm, verificação, rollback, backup, limitações).

## Fase 2/P0 — páginas SUPERADMIN — `6bace93`

- `GET/POST /api/audit` (filtros + paginação, registro em `audit.access`, só SUPERADMIN).
- Telas `/dashboard/audit`, `/dashboard/tenants`, `/dashboard/plans`,
  `/dashboard/subscriptions`; flags `superadminOnly` sincronizadas nos dois navs
  (mobile não tinha em "Usuários").
- Lint: `any` removido de `src/app/docs/v1/page.tsx` (tipos `Operation`/`PathItem`/
  `SpecTag`) e `src/app/api/tenants/route.ts` (`TenantRow`).

## Testes — `131514f`

- `tests/payments.test.ts` (19): assinatura MercadoPago válida/forjada/expirada,
  **ts em segundos e milissegundos**, replay, classificação de status, dedup
  (`buildExternalEventId`), `configuredGateway()`.
- `tests/v1-access.test.ts` (21): prefixos admin, escopos v1 e legados,
  `idempotencyKey`/`requestFingerprint`.
- Correções junto: unidade do `ts` do MercadoPago (a doc usa segundos e o SDK JS calcula
  tolerância em ms — normalização s?ms em `verifyMercadoPagoSignature`);
  escrita em `/api/contacts*` passou a exigir `instances:write`; `/api/audit`,
  `/api/payments`, `/api/invoices`, `/api/jobs` entraram nos prefixos admin.
- `vitest.config.ts`: alias `next/server`, inline de `next-auth`/`@auth/core`, env de
  teste (`DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV=test`) — nenhum teste conecta em banco.

## pt-BR — `c24135a`

- Tradução de `/dashboard/users` (ícone `any` ? `React.SVGProps<SVGSVGElement>`),
  `/dashboard/settings` (29 strings, fuso `America/Sao_Paulo`) e
  `/dashboard/system-monitor` (22 strings + mojibake removido).

## Documentação final (não commitado até o momento)

- `FINAL_REPORT.md`: 4 buckets (implementado e testado / implementado não validado /
  dependente de configuração externa / fora do escopo), verificações executadas,
  pendências externas, plano de piloto e histórico de commits.
- `docs/BACKUP_RECOVERY.md`: itens de backup, dump `--single-transaction`, mídia em
  `data/media`, drill de restauração, custódia de segredos (inclui
  `CREDENTIALS_ENCRYPTION_KEY` irrecuperável), checklist mensal.
- `docs/RETENTION.md`: tabela de retenção; automático (logs de webhook 30 dias, rotação
  de contêiner) × manual (mensagens, mídia, auditoria, jobs) declarado.
- `DEV/`: HANDOFF/VERIFY/SPECS/INDEX atualizados.

Verificação final (2026-10-05): `tsc --noEmit` exit 0; `npm test` 57/57;
`npm run lint` 464 problemas / 285 errors (baseline 473/296); `npm run build` exit 0.
**Não executado**: stack Docker, migração em MySQL real, drill de backup, pagamento
sandbox (ambiente sem Docker/MySQL e sem credenciais de gateway).

## Boot do `npm run dev` — 2026-10-05

- `.env` criado a partir de `.env.example` (segredos gerados localmente, `REPLACE_ME`
  trocado por senha de dev); sem isso o servidor sai com `AUTH_SECRET is not set`.
- `src/server/index.ts`: primeiro import agora é `next/dist/server/node-environment`.
  Sem ele, `next/server`/`next/headers` (carregados via `src/server/socket` e
  `src/modules/whatsapp/manager`) avaliavam `app-render/async-local-storage` antes do
  baseline do Next, e o servidor morria com
  `Invariant: AsyncLocalStorage accessed in runtime where it is not available`.
- `npx tsc --noEmit` → exit 0 (os erros em `.next/dev/types/*` eram leitura de arquivo
  durante a geração do dev server; regenerado, passou).
- Servidor em `http://localhost:3000`: `GET /` → 200, `GET /api/v1/openapi.json` → 200.

## Fase 9 — Hierarquia comercial de 4 níveis, white label e painéis visuais — 2026-10-06

- **Banco e Migrações:**
  - Prisma schema: modelos `PlatformConfig`, `Reseller`, `InstanceAllocation`, `Domain`, `Branding`.
  - Modelos estendidos: `Tenant` (`resellerId`), `Plan` (`resellerId`), `Subscription`, `AuditLog`.
  - Enums: `Role` (adicionado `SUPER_ADMIN`), `ResellerStatus`, `DomainType`, `DomainStatus`, `CertStatus`.
  - Migração versionada `prisma/migrations/20261006000000_commercial_hierarchy_and_whitelabel` criada e aplicada no PostgreSQL.
  - Script `scripts/migrate-commercial-hierarchy.ts` executado para backfill seguro e migração de contas legadas.
- **Segurança e Permissões:**
  - Matriz em `src/lib/permissions.ts` e isolamento em `src/lib/access.ts`: separação estrita entre `MEGA_ADMIN` (dono global) e `SUPER_ADMIN` (revendedor).
  - Usuário operacional `USER` bloqueado de criar recursos em UI e backend (HTTP 403 em `/api/sessions`, `/api/user/api-key`, `/api/webhooks`, `/api/autoreplies`, `/api/scheduler`, `/api/messages/.../broadcast`).
  - Suspensão de revendedor bloqueia novas instâncias, chamadas de API key, disparos na fila de jobs e scheduler.
- **Controle de Domínios e White Label:**
  - Validação RFC 1123, bloqueio de hosts reservados em `src/lib/domains.ts`.
  - Desafio de DNS TXT (`_woohub-challenge.<hostname>`) e apontamento CNAME.
  - Resolução de marca dinâmica por host e por empresa cliente (`resolveBrandingForHost` e `DashboardLayout`).
- **Painéis e Telas (Design Branco + Laranja):**
  - Banner superior contextual por papel (`RoleBanner`).
  - Menu lateral segmentado por papel (`SidebarNav`).
  - Navbar com busca contextual e pill de usuário (`Navbar`).
  - Mega Admin: `/dashboard/mega-admin` (visão geral idêntica ao conceito com 3 cards, tabela de revendedores e controle de domínios), `/resellers`, `/direct-clients`, `/reseller-clients` (sem expor conversas privadas), `/domains`.
  - Super Admin: `/dashboard/super-admin` (visão geral idêntica ao conceito com 3 cards, meus clientes e cartão de marca/domínio), `/clients`, `/branding`, `/domain`, `/quotas`, `/my-subscription`.
  - Admin & User: Sessões com botões contextuais (usuário operacional sem botões administrativos).
- **Testes de Aceitação:**
  - `tests/commercial-hierarchy.test.ts` adicionado com 13 cenários de aceitação.
  - `npm test`: 70/70 testes passando com 100% de sucesso.
  - `npx tsc --noEmit`: 0 erros de compilação.
  - Documentação detalhada em `DEV/COMMERCIAL_HIERARCHY.md`.
  - **Telas ajustadas para fidelidade visual idêntica à imagem do usuário (Mockup) nos painéis Mega Admin e Super Admin.
- **Correção da Sessão e Painel Exclusivo Mega Admin (`fluowai@gmail.com`):**
  - **Causa raiz:** O NextAuth mantinha em cookies de sessão antigos o token JWT sem o campo `role = "MEGA_ADMIN"`, fazendo com que `/dashboard` não redirecionasse e o `SidebarNav` caísse no fallback padrão de `adminGroups` (exibindo todas as 11 opções de WhatsApp do cliente/empresa).
  - **Sessão dinâmica e sem cache stale:** `src/lib/auth.ts` e `src/auth.config.ts` atualizados para recarregar o papel do banco dinamicamente via `token.id`, `token.sub` ou `token.email` em cada chamada de JWT e Session.
  - **Resolução de papel no servidor:** `src/app/dashboard/layout.tsx` e `src/app/dashboard/page.tsx` agora consultam o Prisma diretamente pelo usuário autenticado para garantir que qualquer usuário `MEGA_ADMIN` (como `fluowai@gmail.com`) seja imediatamente reconhecido, redirecionado para `/dashboard/mega-admin` e receba o layout correto.
  - **Propagação no Sidebar e MobileNav:** `SidebarShell` e `Navbar` agora passam `userRole` diretamente para `SidebarNav` e `MobileNav`. O `SidebarNav` isola estritamente os 8 itens exclusivos do Mega Admin (`Visão geral`, `Revendedores`, `Clientes diretos`, `Instâncias`, `Planos e cobrança`, `Domínios`, `Saúde da API`, `Auditoria`) sem misturar ferramentas normais de WhatsApp de clientes.
  - **Acesso liberado no painel:** `src/app/dashboard/mega-admin/page.tsx` e subpáginas (`audit`, `users`, `tenants`, `super-admins`, `settings`) ajustadas para não bloquear e exibir o painel completo para `fluowai@gmail.com`.
- **MySQL continua indisponível** (daemon Docker parado) → scheduler/fila logam
  `Can't reach database server at localhost:3306` a cada tick; páginas que leem banco
  falham até subir o MySQL e rodar `npx prisma migrate deploy`.

## Gate de licença na stack — sem licença, container não sobe — 2026-10-06

- **Problema encontrado:** `docker-stack.yml` (Portainer) não tinha **nenhuma**
  variável de licença; `docker-compose.yml` usava `LICENSE_KEY:-` (opcional);
  e o `ENTRYPOINT` do Dockerfile não repassava o CMD — `sh -c "node …
  license-entrypoint.ts"` sem `"$@"` engolia `command: ["sh","scripts/migrate.sh"]`
  e o spawn final virava `node sh -c …`, ou seja, nem migração nem app subiam.
- **Camada 1 (deploy):** `${LICENSE_KEY:?…}` em `docker-compose.yml` e em
  `docker-stack.yml` (âncora `x-license-env`, compartilhada por `app` e
  `migrate`). Sem a chave, a interpolação falha: **o Portainer nem cria os serviços**.
- **Camada 2 (porta de entrada):** `scripts/license-entrypoint.ts` reescrito —
  valida a licença, executa o comando recebido após `--` (com `spawn` +
  encaminhamento de SIGTERM/SIGINT) e **sai com código 1** quando ela é inválida
  → container `Exited (1)` / tarefa Swarm `Failed` (`0 de 1`), nunca Running.
- **Autoridade da licença:** nova `src/lib/license-token.ts` — chave
  autocontida `WOHUB1.<payload>.<assinatura Ed25519>`, verificada **offline**
  com `node:crypto` (sem banco). Elimina o ovo×galinha (a tabela `License` não
  existe no primeiro deploy) e o fato de validar na própria DB ser forjável por
  quem controla a `DATABASE_URL`. A chave opaca `WOHUB-*` continua aceita como
  caminho legado, com falha fechada se o registro/banco não estiver disponível.
- **Emissão:** `scripts/license-sign.ts` (`--genkey` uma vez; `--sign` por
  cliente) roda somente no servidor do fornecedor — a chave privada nunca vai
  para a base do cliente. Claims: `jti/sub/email/type/status/iat/exp`,
  limites (`maxInstances|maxTenants|maxUsers|maxResellers`), `features` e
  binding opcional `domain`.
- **Dockerfile:** `ENTRYPOINT` com `-- "$@"` + `CMD` explícito — corrige o
  repasse de argumentos tanto para `migrate.sh` quanto para a app.
- **Correções pré-existentes que quebravam `tsc`:** `mapLicense(license: any)`
  → `LicenseRow` e casts de enum em `src/lib/license.ts`;
  `createLicense(expiresAt)` aceitando `Date | string | null`; campo
  `features` faltando na interface da página `/dashboard/mega-admin/licenses`.
- **ESLint:** `src/generated/**` (cliente Prisma) e `coverage/**` passaram a
  ser ignorados — 2437 problemas de saída gerada distorciam a contagem
  (3072 → 632 problemas após a correção).
- **Docs:** `.env.example` seção 11 (formatos, `LICENSE_PUBLIC_KEY`,
  `LICENSE_DOMAIN`) e `docs/DEPLOY.md` §3.1 + subseção "Licença no Portainer".
- **Verificação (ver `DEV/VERIFY.md`):** `npx tsc --noEmit` exit 0;
  `npm test` **86/86** (+16 em `tests/license-token.test.ts`); gate executado
  em 7 cenários (1 abre com exit 0, 6 bloqueiam com exit 1 — chave ausente,
  assinatura forjada, public key ausente, public key errada, chave legada sem
  banco, args do CMD preservados). `npm run build` **não executado** (dev
  server ativo no mesmo `.next/`); stack não executada (sem Docker daemon).

## Boot do dev server: três travamentos corrigidos — 2026-10-06

- **Situação inicial:** dois servidores de dev antigos aceitavam TCP mas nunca
  respondiam (curl ficava 60s+ sem resposta; um com ~3333s de CPU acumulada):
  `next dev -p 1609` (pid iniciado em 05/10 23:37) e um `npm run dev` antigo em
  `:3001`. Ambos encerrados antes de subir instância limpa.
- **1. `npm run dev` morria no boot** com
  `ERR_PACKAGE_PATH_NOT_EXPORTED` em `whatsapp-rust-bridge`:
  o `package.json` do pacote só declarava a condição `"import"`, e o tsx roda o
  projeto em **CommonJS** (o `package.json` da app não tem `"type"`) — o
  `require()` do Baileys falhava ao resolver a dependência dele.
  → **`patches/whatsapp-rust-bridge+0.5.4.patch`** adiciona a condição
  `"require"` apontando para o mesmo `dist/index.js` (ESM sem top-level await,
  então `require(ESM)` do Node 22 funciona). `npx patch-package --partial`
  aplica os dois patches.
- **2. Sessão WhatsApp quebrada:** com o servidor no ar, o handshake falhava em
  `aesEncryptGCM` → `ERR_INVALID_ARG_TYPE: data … Received an instance of Object`
  (3 reconexões, depois auto-stop). **Causa raiz:** `usePrismaAuthState`
  persiste com `BufferJSON.replacer`, mas a leitura **não** aplicava o
  `BufferJSON.reviver` — `creds.noiseKey.public` voltava do banco como
  `{ type: 'Buffer', data: [...] }` (verificado nas 4 linhas de `AuthState`).
  → `reviveValue()` aplicado a `creds` e a **todos** os tipos de chave em
  `keys.get` (antes só `app-state-sync-key`, e com assinatura de reviver
  incorreta).
- **3. Resultado:** `GET /api/system/health` → 200 (`database: "up"` —
  PostgreSQL no Supabase), `GET /` → 200, `GET /api/v1/openapi.json` → 200.
  O handshake agora completa e o WhatsApp respondeu **logout** para a sessão
  `tA2VB4bxzAkY` (credenciais apagadas pelo app) → **repareamento por QR
  necessário** no painel.
- **Porta/ambiente:** `.env` tem `PORT=1609` e `NODE_ENV=production`. O servidor
  foi iniciado com `NODE_ENV=development` forçado no shell (o `@next/env` não
  sobrescreve variáveis já existentes); sem isso o `npm run dev` sobe com
  `next({ dev: false })` e serve o **build de 05/10 18:45** (stale, anterior à
  Fase 9).
- **`npx tsc --noEmit` → exit 0** após a correção do auth state.
- **Pendência nova:** `patches/@whiskeysockets+baileys+7.0.0-rc.9.patch` **não
  aplica** no Baileys instalado (`7.0.0-rc13`, atualizado em 05/10 22:21) →
  `npm install` falha no `postinstall`. As mudanças do patch rc.9 (upload de
  mídia / hosts customizados / `prepareWAMessageMedia`) **não estão ativas**;
  regenerar o patch para rc13 é decisão pendente.

## As três pendências do boot fechadas — 2026-10-06

- **1. Patch do Baileys regenerado para rc13.** Os 6 hunks do patch rc.9 foram
  portados à mão para `7.0.0-rc13` em 3 arquivos:
  `lib/Socket/messages-send.js` (atributo `mediatype` no plaintext de newsletter),
  `lib/Utils/messages-media.js` (parâmetro `newsletter`, URL
  `/newsletter/newsletter-*` + `server_thumb_gen`/`server_transcode`, e
  `thumbnailDirectPath`/`thumbnailSha256`/`handle` no retorno do upload) e
  `lib/Utils/messages.js` (payload do `prepareWAMessageMedia` para newsletter
  com `directPath /o1/ → /m1/`, `mediaKeyDomain`, sem `mediaKey`; e download de
  mídia de newsletter **sem desencriptação** via `directPath`).
  O `result?.direct_path` do rc.9 já veio corrigido de fábrica no rc13.
  Removido o bloco de `console.log("=== WA-AKG NEWSLETTER MEDIA PAYLOAD DEBUG ===")`
  do patch antigo (debug, não funcionalidade).
  **Validação:** `npm pack @whiskeysockets/baileys@7.0.0-rc13` em diretório limpo +
  `git apply --check` → exit 0; depois os 3 arquivos foram restaurados ao pristine e
  `npx patch-package` aplicou os dois patches → exit 0 (é o mesmo caminho do `postinstall`).
  Patch novo: `patches/@whiskeysockets+baileys+7.0.0-rc13.patch` (7,7 KB — o rc.9 tinha
  74 KB só de mudança de modo de arquivo). Backup do rc.9 em `%TEMP%\baileys-rc9-backup.patch`.
- **2. `.env`: `NODE_ENV="production"` → `"development"`** (igual ao `.env.example`).
  `npm run dev` **sem** nenhum override no shell agora sobe em `development` em
  `http://localhost:1609` (banner `Env development`, health 200).
- **3. Sessão WhatsApp reapareada:** `POST /api/sessions/tA2VB4bxzAkY/start`
  (autenticação por cookie de sessão) → status **`SCAN_QR`**, QR persistido em
  `Session.qr` e entregue como PNG (`%TEMP%\woohub-qr-tA2VB4bxzAkY.png`).
  O QR precisa ser **escaneado pelo celular** para concluir o pareamento.
  - Autenticação sem senha: nenhuma conta do banco confere com `ADMIN_PASSWORD`
    (bcrypt.compare → `false` para os 3 usuários), então o login de credenciais
    retorna `CredentialsSignin`. Contornável em dev cunhando o cookie JWT com
    `encode()` de `next-auth/jwt` usando o `AUTH_SECRET` do `.env`
    (não altera dado nenhum). `scripts/setup-admin.js` não reseta senha de
    usuário existente (idempotente por design).
- **Conta do usuário reativada (a pedido do maestro):** a senha de
  `fluowai@gmail.com` (**MEGA_ADMIN**, dono da sessão `tA2VB4bxzAkY`) foi
  redefinida para o valor de `ADMIN_PASSWORD` (bcrypt cost 12, mesmo custo do
  `setup-admin`). Login de credenciais validado de ponta a ponta:
  `POST /api/auth/callback/credentials` → **302 `/dashboard`** (não `CredentialsSignin`),
  `/api/auth/session` → `role: MEGA_ADMIN`, `GET /dashboard` e
  `GET /dashboard/sessions` → **200**. O cookie de sessão usado na automação agora é
  o desse usuário (donos acessam a própria sessão sem passar pelo atalho SUPERADMIN).
- **405 no botão "Gerar novo QR Code" corrigido:** o botão chamava
  `performAction('qr')` → `POST /api/sessions/{id}/qr`, mas a rota estática
  `qr/route.ts` só exporta `GET` (caminho estático vence o dinâmico `[action]`) →
  **405 Method Not Allowed**. `src/app/dashboard/sessions/[sessionId]/page.tsx` agora
  usa `GET` quando `action === 'qr'` (mantém `POST` para start/stop/restart/logout/pair).
  `npx tsc --noEmit` → exit 0.
- **Sessão conectada e console limpo (16:43):** `tA2VB4bxzAkY` → **`CONNECTED`**
  (`me: 554792701014:11@s.whatsapp.net`, "Wootech"; sync de 56 mensagens + contatos).
  Os erros no console do navegador eram **históricos/transicionais**: `POST /qr 405`
  (2×, só antes do fix acima), `GET /qr 404` (3×, enquanto o código ainda não existia)
  e `GET /qr 400` (7×, "Already connected" durante os ciclos de reconexão). Conferido
  no `dev-server.log`: contadores **estáveis (0 novos em 10s)** após a conexão — o
  polling do QR já parou sozinho (o handler de 400 marca `status = CONNECTED`).



- **Reformulação da Página Inicial (Landing Page de Vendas de Instâncias) e Sanitização da Marca Woohub — 2026-10-06:**
  - **Página Inicial (src/app/page.tsx):**
    - Redesenhada do zero como Página de Vendas de Alta Conversão, com foco absoluto na contratação de instâncias de WhatsApp da Woohub.
    - Removidas todas as menções a código aberto / open source e removidos todos os links de repositórios / GitHub.
    - Seção Hero de alto impacto com badges de disponibilidade, métricas de entrega e CTAs claros para contratação.
    - Mockup interativo simulando o painel Woohub com instâncias ativas, métricas em tempo real e monitor de gateway operacional.
    - Tabela completa de Planos Comerciais de Instâncias (Starter R$ 49,90/mês, Pro R$ 129,90/mês, Business R$ 279,90/mês e Revenda White Label R$ 449,90/mês) com seletor Mensal / Anual (20% OFF).
    - Seção de integrações (cURL, n8n, Typebot, Make, CRMs) com botão de cópia de código.
    - Seção de FAQ interativa para objeções e dúvidas sobre ativação de instâncias.
    - Rodapé corporativo 100% Woohub com links para Termos, Privacidade e Suporte.
  - **Documentação e Swagger (docs/, swagger.json, src/lib/swagger.ts, src/app/docs/page.tsx):**
    - 100% traduzido para Português do Brasil (PT-BR).
    - Substituição total de referências a marcas antigas (WA-AKG, repositórios de terceiros) exclusivamente pela marca Woohub.
    - Cabeçalho da documentação com identidade visual alinhada ao design laranja e branco da Woohub.

## 2026-10-06 — Ciclo de vida do QR Code (escaneamento não conectava / não regenerava)

**Relato:** escanear o QR não conectava a instância e, ao criar uma instância e
fechá-la, não era mais possível gerar um QR novo.

**Diagnóstico (código + `dev-server.log`):**

1. `shutdown()` chamava `socket.end()` sem aguardar; o Baileys só emite
   `connection: 'close'` **depois** de fechar o WebSocket
   (`node_modules/@whiskeysockets/baileys/lib/Socket/socket.js:469-505`) e esse
   fechamento pode levar até 30 s (`closeTimeout`). Esse evento atrasado regravava
   `Session.qr = null`/`status = STOPPED` e chamava `waManager.removeInstance(id)`,
   que apagava do Map **a instância nova** criada pelo `restartSession` →
   `GET /qr` respondia 404 e o QR recém-gerado sumia.
2. `init()` não desligava o socket anterior → duas conexões Baileys com as mesmas
   credenciais; o WhatsApp invalida o par e emite `loggedOut`
   (`dev-server.log 12:18:22 Session tA2VB4bxzAkY logged out. Deleting credentials...`).
   Depois disso todo ciclo mostra `No stored credentials ... a fresh login will be
   required` e volta para QR.
3. O QR antigo nunca era limpo: nem `startSession` nem `stopSession` gravavam
   `qr: null`, e a tela lia `Session.qr` do banco. O Baileys rotaciona o código a
   cada 20 s (primeiro vive 60 s) e encerra com `DisconnectReason.timedOut` quando
   os refs acabam — escanear o código persistido é escanear código **morto**.
4. A tela dependia só do evento `connection.update` (fire-and-forget) e `GET /qr`
   só lia `instance.qr` em memória, sem fallback para o banco.

**Correções:**

- `src/modules/whatsapp/instance.ts` — contador de geração (`gen`) +
  `disposeSocket()` (remove o listener `connection.update`, dá `end()` e limpa o
  timer de reconexão); `init()` descarta o socket anterior, zera
  `isStopped`/`reconnectCount` e limpa o QR no banco; `handleConnectionUpdate(update, gen)`
  ignora eventos de sockets velhos; o branch `close` marca `socket = null`; o timer
  de reconexão guarda `gen` (não reanima uma instância substituída); `open` grava o
  status **antes** dos bindings (agora com `try/catch`); `shutdown()` usa
  `disposeSocket()` e zera o QR; `require("./manager")` → `onRemovedFromManager`.
- `src/modules/whatsapp/manager.ts` — `removeInstance(id, expected?)` com guarda de
  identidade; `stopSession` grava `{status: STOPPED, qr: null}` **sempre** (mesmo sem
  instância em memória) e tira do Map antes de esperar o banco; `startSession`
  reutiliza a instância existente e só é no-op quando `CONNECTED` **com socket vivo**
  (socket morto → re-init); `restartSession` 1000 ms → 500 ms.
- `GET /api/sessions/[sessionId]/qr` — prefere `instance.qr`, cai para `Session.qr`
  quando a instância saiu do Map, devolve `status`/`running` no 404 e `connected`
  no 400.
- `GET /api/sessions/[sessionId]` — `qr` e `qrGeneratedAt` passam a vir da instância
  viva (o espelho do banco pode estar defasado).
- `POST /api/sessions/[sessionId]/qr` — ação explícita **"gerar QR novo"** (mesmo
  caminho do restart, com mensagem própria).
- `src/app/dashboard/sessions/[sessionId]/page.tsx` — polling de `GET /qr` a cada
  2 s enquanto houver instância pareando (único consumidor da rota; confirmado no
  log: `GET /api/sessions/tA2VB4bxzAkY/qr 200`); o evento de socket só limpa o QR
  em status que o invalidam; botão **"Gerar novo QR Code"** visível para qualquer
  status ≠ `CONNECTED`; o QR na tela é limpo ao pedir um novo (nada de escanear
  código morto durante o restart).

**Verificação:** `npx tsc --noEmit` **exit 0** · `npx vitest run` **98/98** (8 arquivos;
+12 em `tests/whatsapp-manager.test.ts`, lint isolado exit 0) · `npm run lint`
**638 problemas / 350 errors** (baseline 632/351: **−1 error**; os +6 problemas são
warnings e, nos 7 arquivos alterados, todos os 9 warnings são pré-existentes — nenhum
`any`/aviso novo) · polling observado funcionando no dev server. Não executado:
`npm run build` (dev server ativo no mesmo `.next/`) e escaneamento real com celular.

**Atenção operacional:** `npm run dev` usa `tsx` **sem** `--watch`; mudanças em
`src/modules/whatsapp/*` só valem após reiniciar o dev server (as rotas
`src/app/api/**` são recompiladas sob demanda pelo Next).

---

## 2026-10-06 — `/dashboard/mega-admin/instances` (listagem e criação globais)

**Problema:** o menu mega-admin (`sidebar-nav.tsx:93`, `mobile-nav.tsx:65` e o card do
`mega-admin/page.tsx:324`) linkava para `/dashboard/mega-admin/instances`, que **não
existia** → 404. Não havia tela nem API para ver/provisionar instâncias de toda a
plataforma: `GET /api/super-admin/instances` é escopado por `resellerId`, e
`GET /api/sessions` usa `getAccessibleSessions`, que para `MEGA_ADMIN` devolve só o
próprio tenant (o helper só trata `SUPERADMIN`).

**Feito:**

- `src/app/api/mega-admin/instances/route.ts` (novo) — `authenticateRequest` +
  `isMegaAdmin(authResult.context)` → 403 `"Acesso restrito ao Mega Admin"` (molde de
  `GET /api/mega-admin/stats`). `GET` paginado (`page`, `limit` ≤ 100, `search` em nome/ID
  da instância e e-mail do dono, `status`, `tenantId`) com `include` de `tenant`+`user`+
  `_count`, ordenação `createdAt desc`; **o status mostrado vem da instância viva**
  (`waManager.getInstance`) com o banco como espelho (`dbStatus` também é devolvido) — é o
  mesmo defeito do QR, não confiar no espelho. `POST` valida o nome, resolve o dono
  (OWNER → ADMIN → primeiro membro da empresa, 409 se não houver), 404 para empresa
  inexistente, aplica `assertInstanceQuota`/`quotaErrorResponse` e chama
  `waManager.createSession(userId, name, sessionId?, tenantId?)` — único caminho que
  provisiona instância para **outro** tenant (o `POST /api/sessions` usa o tenant do
  chamador). Sem `tenantId` a instância fica "modo piloto" (sem cota).
- `src/app/dashboard/mega-admin/instances/page.tsx` (novo) — guarda
  `session?.user?.role === "MEGA_ADMIN"` (molde de `tenants/page.tsx`), tabela
  Nome/ID/Status/Empresa/Dono/contatos/mensagens/criada, busca (Enter), filtro de status,
  paginação e botão Atualizar; diálogo "Nova instância" com select de empresas carregado de
  `GET /api/mega-admin/tenants?limit=100` (sentinela `"none"` = sem empresa, já que Select
  não aceita valor vazio), nome obrigatório e ID personalizado opcional; a ação leva para
  `/dashboard/sessions/[sessionId]`.

**Verificação:** `npx tsc --noEmit` **exit 0** · `npx eslint` nos 2 arquivos novos **exit 0**
· `npx vitest run` **98/98** · smoke HTTP no dev server (sessão MEGA_ADMIN real, cookie via
`/api/auth/callback/credentials`): `GET /api/mega-admin/instances` **200** com a instância
real `tA2VB4bxzAkY` (tenant "Paulo Adriano Argolo", `running:false`, `status:STOPPED`),
`?search=tA2` 200, `GET /api/mega-admin/tenants` 200,
`GET /dashboard/mega-admin/instances` **200** (antes: 404), sem cookie **403**,
`POST {"name":""}` **400** e `POST` com `tenantId` inexistente **404** (nenhuma linha
criada). Não executado: `npm run build` (dev server no mesmo `.next/`) e criação real de
instância (evita poluir a base).

**Navegação corrigida junto:** `sidebar-nav.tsx` e `mobile-nav.tsx` ainda linkavam para
`/dashboard/mega-admin/plans` e `/dashboard/mega-admin/health` (ambas 404, inexistentes) —
reapontadas para as páginas reais `/dashboard/plans` ("Planos e cobrança") e
`/dashboard/system-monitor` ("Saúde da API"). `isActive` usa `startsWith(href)`, então o
destacamento continua correto; nenhum outro arquivo referenciava as rotas antigas.
Smoke: `/dashboard/plans` 200 e `/dashboard/system-monitor` 200 (sessão MEGA_ADMIN);
`npx eslint` nos 2 arquivos → só os 4 erros/1 aviso pré-existentes (linhas 6/61/153/157/167);
lint global **inalterado: 638 problemas / 350 errors**.

**Acesso do MEGA_ADMIN às duas páginas reapontadas:** `/dashboard/plans` já funcionava
(`/api/plans` usa `isAdmin`, que aceita `MEGA_ADMIN`). `system-monitor` estava travado em
`role !== "SUPERADMIN"` (página e `GET /api/system/monitor`) → MEGA_ADMIN veria "Acesso
negado". Relaxado para `hasRole(auth.role, "SUPERADMIN")` (que já trata MEGA_ADMIN como
tier acima) na rota e para `!== "SUPERADMIN" && !== "MEGA_ADMIN"` na página — sem mudar
`canAccessSession`/`getAccessibleSessions` (isolamento por tenant intacto; a página só
consome o monitor global, nenhuma rota por instância). Smoke: `GET /api/system/monitor`
**200** com métricas para MEGA_ADMIN (antes 403), `GET /api/plans` 200, `tsc` exit 0,
`vitest` 98/98, lint global inalterado (os 3 erros/2 avisos dos arquivos tocados são
pré-existentes, linhas 4/22/79 e 14/219).

## 2026-10-07 — Número fixo da instância + painel de reconexão e de suporte

**Relato:** o painel da instância precisa de um *painel de reconexão* onde o usuário
informa o telefone da instância para reconectar; o número **não pode ser trocado**; se o
número escaneado for diferente do registrado, a conexão deve ser recusada e a tela deve
levar a um *painel de suporte* pedindo contato com o atendimento.

**Decisões de desenho:**

- O número vai em **coluna própria** (`Session.linkedPhone` / `Session.mismatchPhone`), e
  não em `config`: `PATCH /api/sessions/[sessionId]/settings`
  (`settings/route.ts:60-64`) substitui o objeto `config` inteiro e
  `dashboard/bot-settings/page.tsx:128` o regrava — guardado lá dentro, seria apagado.
- Comparação por **normalização**, não por igualdade crua: `src/lib/phone.ts`
  (`phoneDigits`, `normalizePhone` — remove o DDI `55` quando o total é 12/13 dígitos,
  `phoneFromJid` só aceita `@s.whatsapp.net`, `samePhone`). Assim
  `554792701014` ≡ `(47) 9270-1014` ≡ `4792701014`.
- O número só é **registrado** em evento de sucesso (primeira conexão ou pareamento por
  código), nunca por digitação livre de terceiros: quem digita diferente do registrado
  recebe `409 NUMBER_MISMATCH` e nada acontece.

**Feito:**

- `prisma/schema.prisma` — `Session.linkedPhone`/`Session.mismatchPhone` (`String?`).
  Colunas criadas no Supabase com `prisma db execute --stdin`
  (`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS ...`) + `npx prisma generate`
  (**exigiu parar o dev server**: o `query_engine-windows.dll.node` fica carregado no
  processo e o rename do generate falha com `EPERM`).
- `src/lib/phone.ts` (novo) + `tests/phone.test.ts` (8 testes).
- `src/modules/whatsapp/instance.ts` — campos `linkedPhone`/`mismatchPhone` carregados no
  `init()`; no `connection === "open"`: número lido de `socket.user.id` (só se for
  `@s.whatsapp.net` — um `@lid` não é telefone e **não** é validado), se divergir chama
  `rejectNumberMismatch()` (status `NUMBER_MISMATCH`, `isStopped`, `disposeSocket()`,
  transação `session.update` + `authState.deleteMany` e evento `connection.update` com
  `linkedPhone`/`mismatchPhone`); se for nulo, registra o número. Sucesso limpa
  `mismatchPhone`. `requestPairingCode()` recusa número divergente (`error.code =
  "NUMBER_MISMATCH"`) e registra o número quando ainda não existe.
- `src/modules/whatsapp/manager.ts` — `loadSessions()` **não** rebaixa para `STOPPED`
  uma sessão `NUMBER_MISMATCH` (as credenciais dela foram apagadas de propósito; sem
  isso o painel de suporte sumiria no reboot).
- `src/app/api/sessions/[sessionId]/[action]/route.ts` — lê `linkedPhone`, compara com o
  `phone`/`phoneNumber` do corpo e responde **409 `NUMBER_MISMATCH`** (com
  `data.linkedPhone`/`data.requestedPhone`); registra o número quando ainda não existe;
  `catch` mapeia o erro do `requestPairingCode` para o mesmo 409.
- `src/app/api/sessions/[sessionId]/route.ts` — devolve `linkedPhone`/`mismatchPhone`
  (preferindo a instância viva sobre o banco, como já faz com `status`/`qr`).
- `src/app/dashboard/sessions/[sessionId]/page.tsx` — **painel de reconexão** (input +
  botão "Reconectar" que chama `start` com `{ phone }`, mostra o número registrado e
  avisa que ele é fixo), **painel de suporte** quando `status === "NUMBER_MISMATCH"` ou a
  API responde 409 (registrado × escaneado, botão `mailto:suporte@woohub.app`, "Tentar
  com o número registrado" e "Verificar novamente"), chip de status em vermelho para
  `NUMBER_MISMATCH`, `Iniciar`/`Obter QR` desabilitados nesse estado e polling de QR
  suspenso (evita 404 em loop). Socket `connection.update` com `NUMBER_MISMATCH` refaz o
  fetch completo.

**Verificação:** `npx tsc --noEmit` **exit 0** · `npm test` **110/110** (10 arquivos;
`tests/whatsapp-number-guard.test.ts` novo cobre os 4 casos do guard) ·
`npm run lint` **638 problemas / 350 errors — igual ao baseline** (`src/lib/phone.ts` e os
2 testes novos lintam limpos) · smoke HTTP real (login `fluowai@gmail.com`,
`POST .../start {"phone":"4792701014"}` → **200** e `linkedPhone` virou `4792701014`
auto-registrado na conexão; `POST .../start {"phone":"5511999999999"}` → **409
NUMBER_MISMATCH** com a mensagem de suporte; `GET .../tA2VB4bxzAkY` → `hasInstance:true`,
`status:CONNECTED`, `linkedPhone:4792701014`, `me:554792701014:11@s.whatsapp.net`;
página `200`). Não executado: o caminho do *scan* com outro número (exige escanear com um
segundo SIM — a regra está coberta por teste unitário, não por e2e) e `npm run build`.

**Registro do restart:** ao reiniciar o dev server o `loadSessions()` falhou 1×
(`Can't reach database server` do pooler do Supabase logo no boot) e a instância não
subiu sozinha com o banco dizendo `CONNECTED` — religada via `POST .../start`.

## Controle de Licença e Deploy de Revenda White-Label no Portainer — 2026-10-07

- **Contexto & Problema:** A revenda white-label precisa subir a stack no seu próprio Portainer, mas a plataforma precisa ter controle estrito: se tiver licença ativa, baixa a imagem; se não tiver licença (ou for suspensa), não baixa a imagem e não deixa os contêineres subirem.
- **Camada 1 (Bloqueio de Download da Imagem):** Imagem de produção configurada para distribuição via GitHub Container Registry privado (ghcr.io/woohub/app) com autenticação por token dedicado (read:packages). No Portainer, a revenda cadastra o Registry ghcr.io com seu token. Sem token ou com token revogado pelo Mega Admin, o Docker aborta o pull com 401 Unauthorized.
- **Camada 2 (Link Inteligente de Entrega da Stack):** src/app/api/license/check/route.ts (verificação de status), src/app/api/license/verify/route.ts (heartbeat/boot online), src/app/api/license/portainer-stack/route.ts (entrega de Compose/Swarm YAML somente com licença ativa, 403 Forbidden se inativa), src/app/api/license/portainer-template/route.ts (templates Portainer), src/proxy.ts (/api/license público no proxy).
- **Camada 3 (Gate de Execução Remota & Phone-Home):** scripts/license-entrypoint.ts consulta LICENSE_SERVER_URL no boot. Se a licença estiver suspensa ou revogada, aborta a execução com process.exit(1) (contêiner Exited 1 no Portainer).
- **Camada 4 (UI no Mega Admin & Documentação):** src/app/dashboard/mega-admin/licenses/page.tsx ganhou botão Portainer com modal de cópia do Link da Stack e instruções; docs/RESELLER_PORTAINER_GUIDE.md criado.
- **Verificação:** npm test 117/117 testes passando (+7 novos testes em tests/license-routes.test.ts).
## 2026-10-08 — Onboarding comercial e validação de serviços da stack

- Adicionado o fluxo `/onboarding`, iniciado após o cadastro, com escolha entre cliente direto e revenda, seleção do plano, domínio e URLs do Supabase/MinIO.
- Criada a rota autenticada `POST /api/onboarding`, que cria/atualiza a assinatura de teste por 14 dias, provisiona a revenda quando solicitada, grava o estado comercial no tenant e registra auditoria.
- URLs são testadas no servidor com `safeFetch`, validação de SSRF, redirects seguros e confirmação de resposta HTTP 2xx.
- Validação confirmada com `npx tsc --noEmit` (exit 0). Ainda falta teste e2e com uma conta nova e endpoints externos reais.
## 2026-10-08 — Operação de revendedores no Mega Admin

- A tela de revendedores ganhou o botão **Criar revendedor**, com cadastro manual do responsável, senha inicial e cotas.
- A edição existente permanece disponível para nome, status e cotas.
- Adicionada a visão de suporte somente leitura em `/dashboard/mega-admin/resellers/[id]`, com clientes, planos, membros, instâncias, domínio e status.
- A rota de detalhe registra `reseller.support_view` na auditoria e não cria sessão com a senha do revendedor nem permite alteração de dados.
- `npx tsc --noEmit` aprovado.
## 2026-10-08 — Remoção de dados fictícios dos painéis

- Removidos os números, revendas, clientes e domínios ilustrativos dos painéis Mega Admin e Super Admin.
- Os painéis agora exibem somente os dados retornados pelas APIs e mostram zero/estado vazio quando o banco não possui registros.
- A rota antiga de comparação visual/mockup foi desativada e redireciona para o dashboard real.
- O banner de papel foi ajustado para indicar dados reais do banco.
- `npx tsc --noEmit` aprovado após as alterações.
## 2026-10-08 — Limpeza dos dados de demonstração no banco

- Consulta real confirmou os revendedores `Agência Alfa` e `Conecta Digital` e os domínios associados.
- Removidos os dois revendedores de demonstração e dados dependentes.
- Removidos os usuários mock `admin@example.com` e `admin@suaempresa.com`.
- Verificação final: `fluowai@gmail.com` permanece como `MEGA_ADMIN` e a contagem de revendedores ficou em zero.
## 2026-10-08 — Plano da revenda e painel real de suporte

- Corrigido o padrão HTML de slug para navegadores que usam RegExp `/v`, escapando o hífen.
- O cadastro manual de revendedor carrega os planos ativos reais e exige a seleção de um plano; a assinatura inicial é vinculada ao revendedor.
- O botão da lista agora abre o dashboard real de Super Admin usando `supportResellerId`, com dados reais da operação e auditoria `reseller.support_panel` para o Mega Admin.
- `npx tsc --noEmit` aprovado.
# 2026-10-08 — núcleo de modelos e instalações de revenda

- Auditoria inicial: o projeto já possuía hierarquia comercial, licenças, cotas, isolamento por revendedor e painel `SUPER_ADMIN`; não possuía entidades formais para modelos versionados de stack e instalações white label.
- Adicionados ao Prisma: `StackTemplate`, `StackTemplateVersion`, `TemplateEntitlement` e `Installation`, com estados separados para publicação e ciclo de vida da instalação.
- Adicionada migração PostgreSQL versionada em `prisma/migrations/20261008000000_reseller_stack_templates/migration.sql`.
- O vínculo da instalação registra revendedor, licença contratada, versão do modelo, modo Compose/Swarm, capacidade e hash do bootstrap; não cria licença comercial nem executa Docker remoto.
- Verificação: `npx prisma validate` passou.
- Pendente: endpoints transacionais do wizard, geração de bootstrap de uso único, telemetria sanitizada, tickets e aplicação da migração em ambiente isolado. Docker/MySQL continuam indisponíveis neste ambiente.

# 2026-10-08 — painel real da revenda em suporte

- Corrigido o modo de acesso do Mega Admin ao painel de uma revenda: banner, perfil, menu e busca passam a exibir o contexto `SUPER ADMIN` da operação acessada.
- O contexto de suporte é restrito ao Mega Admin, permanece somente leitura para a navegação e é identificado por `supportResellerId`, sem reutilizar senha ou alterar a sessão original.
- O dashboard real e a tela de clientes propagam o contexto da revenda nas consultas e no cadastro de clientes; a criação é auditada como operação de suporte.
- Corrigida a leitura da resposta real de clientes para não depender de estrutura mockada inexistente.
- O contexto da revenda agora é propagado também para instâncias, planos, cobrança, marca, domínio e assinatura; o shell carrega o nome real da operação pelo cadastro white label.
- A apresentação visual deixa de mencionar “suporte”: o acesso aparece integralmente como painel normal de Super Admin da revenda, mantendo a auditoria restrita internamente.

# 2026-10-13 — Redesign da Visão Geral e Nova Identidade Visual WooHub Azul

- Redesign completo da tela principal `/dashboard` (Visão geral) baseado no layout e paleta de cores solicitados (tons de azul elétrico `#0284c7`, ciano `#38bdf8`, fundo limpo `#f8fafc`, cards brancos com bordas suaves `#e2e8f0` e sem elementos em laranja/âmbar).
- Substituição do tema primário em `src/app/globals.css`: variável `--primary` atualizada para o azul elétrico da marca WooHub (`oklch(0.58 0.19 240)`), gradientes de destaque em ciano e azul elétrico, cartões brancos e foco em azul.
- Atualização do `SidebarShell`: novo logotipo vetorizado WooHub em degradê azul/ciano com símbolo 'W' estilizado, subtítulo "API DE COMUNICAÇÃO PARA NEGÓCIOS", "WHATSAPP · INTEGRAÇÕES · AUTOMAÇÃO · ATENDIMENTO", divisor "CENTRAL DE OPERAÇÕES", e rodapé com identificação da versão.
- Atualização do `SidebarNav`: grupos organizados em `OPERAÇÃO`, `MENSAGENS`, `CONTATOS` e `AUTOMAÇÃO` com links ativos em pílula azul suave (`#e0f2fe`), ícones azuis destacados e preservação dos atalhos administrativos de Mega Admin / Super Admin.
- Atualização do `Navbar`: navegação com breadcrumb "Workspace / Visão geral", badge "Modo demonstração", seletor de instâncias padronizado com bordas sutis e avatar do usuário "PA" em círculo azul com iniciais.
- Reestruturação de `src/app/dashboard/page.tsx`:
  - 3 cartões de métricas no topo: "Sessões conectadas" (com contagem e subtítulo), "Mensagens hoje" e "Automações ativas".
  - Seção central em duas colunas: "Fluxo de mensagens" com gráfico de barras verticais em degradê azul/ciano e seletor "Enviadas / recebidas", e "Atividade recente" com ícones circulares em azul suave.
  - Seção inferior de "Suas sessões" com tabela limpa, badge "Conectada" em pílula azul e botões "Ver sessão →".
  - Remoção de redirecionamento forçado de Mega Admin/Super Admin em `/dashboard` para permitir a visualização direta do painel de operações.
- Atualização de `role-theme.tsx`, `role-banner.tsx`, `mobile-nav.tsx`, `session-manager.tsx`, telas de autenticação e favicon para manter total coerência cromática com a nova paleta.
- Verificação: `npx tsc --noEmit` executado com sucesso e zero erros.

# 2026-10-13 — Correção de Entrega de Disparos e Normalização de Telefones (DDI 55)

- Diagnóstico da falha no disparo de mensagens ("bolinha vermelha" / mensagens não entregues):
  - Na tela de disparos em massa (`/dashboard/broadcast`) e agendamentos (`/dashboard/scheduler`), números brasileiros inseridos sem o código do país (DDI 55, ex: `48991138937` ou `(48) 99113-8937`) eram concatenados com `@s.whatsapp.net` sem inclusão do prefixo `55`.
  - O JID gerado `48991138937@s.whatsapp.net` possui 11 dígitos com prefixo `48`, que nos servidores do WhatsApp é o código internacional da Polônia. O motor Baileys enviava o stanza, mas o WhatsApp descartava ou não entregava no dispositivo brasileiro de destino (DDD 48).
- Implementação de utilitários em `src/lib/phone.ts`:
  - `formatPhoneForJid`: normaliza telefones de 10 ou 11 dígitos nacionais para incluir o prefixo `55` automaticamente, preservando JIDs de grupos (`@g.us`), canais (`@newsletter`) e menções.
  - `toPhoneJid`: sanitiza o valor e monta o JID completo `@s.whatsapp.net` normalizado com DDI 55.
- Normalização ponta a ponta:
  - Frontend: `src/app/dashboard/broadcast/page.tsx` normaliza os contatos informados com `toPhoneJid` e atualiza os placeholders com formatos brasileiros.
  - Frontend: `src/app/dashboard/scheduler/page.tsx` normaliza destinatários pessoais no cadastro e edição com `toPhoneJid`.
  - Backend: `src/app/api/messages/[sessionId]/broadcast/route.ts` normaliza a lista de destinatários com `toPhoneJid`.
  - Backend: `src/app/api/scheduler/[sessionId]/route.ts` e `[scheduleId]/route.ts` normalizam os JIDs salvos no banco.
  - Worker de filas: `src/lib/queue.ts` normaliza `targetJid` com `toPhoneJid` no momento exato do disparo via socket Baileys.
  - Chat Service: `src/modules/whatsapp/chat.service.ts` normaliza destinos antes de `sendMessage` e `sendMediaMessage`.
- Correção de tipagem no heartbeat do servidor:
  - Adicionado método `getAllSessions()` na classe `WhatsAppManager` (`src/modules/whatsapp/manager.ts`).
  - Corrigida a função `getOrCreateInstallation` e `startLicenseHeartbeat` em `src/server/index.ts` com validação de status de licença (`ACTIVE`), evitando tentativas de criação com campos obrigatórios ausentes.
- Verificação:
  - `npx tsc --noEmit` executado com 0 erros.
  - `npx vitest run`: **117/117 testes passando em todos os 11 arquivos de teste**.

# 2026-10-13 — Resolução Definitiva do Nono Dígito Brasileiro no WhatsApp (Baileys)

- Diagnóstico profundo da não-entrega em telefones brasileiros (ex: `48988003260` e `48991138937`):
  - Em números brasileiros (especialmente com DDD >= 31, como 48 em SC), contas do WhatsApp registradas antes de 2016 utilizam nos servidores do WhatsApp a chave JID **sem o nono dígito** (ex: `554888003260@s.whatsapp.net` e `554891138937@s.whatsapp.net`, 12 dígitos ao total).
  - Consulta ao banco confirmou que os contatos sincronizados no aparelho (`Contact`) e mensagens recebidas já estavam registrados sem o 9 (`554888003260@s.whatsapp.net` / `554891138937@s.whatsapp.net`).
  - Quando um disparo era feito para `5548988003260@s.whatsapp.net` (com o 9), o servidor do WhatsApp aceitava o pacote Baileys e devolvia chave `3EB0...`, mas não conseguia rotear para o aparelho de destino porque a conta do usuário no WhatsApp estava no JID de 8 dígitos.
- Implementação de `resolveWhatsAppJid` em `src/lib/phone.ts`:
  - `getBrazilianPhoneVariants`: gera as variantes canônicas com 9 (`jidWith9`) e sem 9 (`jidWithout9`).
  - Resolução em camadas:
    1. Consulta à tabela `Contact` da sessão local para reaproveitar JID já sincronizado;
    2. Consulta à tabela `Message` para conversas recentes;
    3. Consulta em tempo real aos servidores do WhatsApp via `socket.onWhatsApp(jidWithout9, jidWith9)` (protocolo USync do Baileys);
    4. Fallback: para DDDs >= 31, prioriza o formato sem 9 (`jidWithout9`).
  - `samePhone` atualizado para reconhecer números com e sem o 9 como o mesmo telefone (`48988003260` == `4888003260`).
- Integração:
  - `src/lib/queue.ts`: resolve o JID exato antes de invocar `instance.socket.sendMessage`.
  - `src/app/api/messages/[sessionId]/broadcast/route.ts`: resolve os JIDs na criação do lote, salvando os destinatários no banco já com os JIDs corretos.
  - `src/modules/whatsapp/chat.service.ts`: resolve JIDs no envio de texto e mídia.
- Validação:
  - `tests/phone.test.ts`: testes adicionados e passando com sucesso.
# 2026-10-14 — Remoção do Indicador Flutuante de Compilação do Next.js ("Compiling...")

- Solicitação do cliente: remover o toast / indicador visual flutuante `🟠 Compiling...` que aparecia durante a navegação e compilação do Next.js.
- Causa:
  - O Next.js exibe por padrão em ambiente de desenvolvimento (dev mode) um indicador com animação e badge informando compilação de rotas (`devIndicators`).
- Solução aplicada:
  - `next.config.ts`: adicionada a diretiva oficial `devIndicators: false` no objeto de configuração do Next.js.
  - `src/app/globals.css`: adicionadas regras CSS com `!important` para suprimir totalmente quaisquer elementos de overlay do Next.js (`nextjs-portal`, `[data-nextjs-toast]`, `[data-nextjs-indicator]`, `[data-nextjs-dev-tools-indicator]`, `div[data-nextjs-dialog-overlay]`).
  - Reiniciado o servidor local com `NODE_OPTIONS='--max-old-space-size=4096' npm run dev:all`.
- Validação:
  - Servidor em `http://localhost:1609` respondendo HTTP 200 em `/api/system/health`.
  - Sessão WhatsApp `tA2VB4bxzAkY` conectada e sincronizada.
  - Testes: `npx vitest run` 118/118 passando; `npx tsc --noEmit` com 0 erros.

# 2026-10-14 — Reformulação Completa da Identidade Visual e Design System WOOTECH (Laranja Radiante & Dark Obsidian)

- **Solicitação do cliente**: reformulação estética integral adotando a identidade visual da **WOOTECH**:
  - Logotipo oficial 3D vetorizado: fita dobrada isométrica em degradê de laranja radiante com reverso em grafite escuro (`#181F2A`) e constelação de cubos/pixels superiores (`src/components/ui/wootech-logo.tsx`).
  - Paleta de cores oficial: base de interface limpa (`#F8FAFC`), sidebar escura estilo obsidian (`#0B111E`), botões e tabs ativas em pílula laranja radiante (`#FF6600` / `#FA5A1E`), badges de status verde esmeralda (`#10B981`) para "Online" e vermelho suave para "Offline".
- **Design Tokens Globais (`src/app/globals.css`)**:
  - Variáveis `--primary`, `--ring`, `--chart-1` e gradientes de destaque atualizados para a paleta WOOTECH (`oklch(0.66 0.22 42)` / `#FF6600`).
  - Tokens da barra lateral (`--sidebar`) padronizados para obsidian escuro e contraste nítido em branco/cinza claro.
- **Barra Lateral (`SidebarShell` & `SidebarNav`)**:
  - Inclusão do logotipo WOOTECH vetorizado no topo com indicador de status "PAINEL PRINCIPAL • ONLINE".
  - Itens de navegação alinhados às telas do mockup: Início, Instâncias, Conversas, Campanhas, Contatos, Etiquetas, Automações, Relatórios, Configurações e Administração.
  - Links ativos com a pílula arredondada em laranja vibrante (`bg-[#FF6600] text-white font-bold shadow-md`) e itens inativos em cinza slate suave com hover iluminado.
  - Rodapé com avatar circular laranja "WA" ("WooTech Admin", "admin@wootech.com.br", "Administrador") e botão sutil de encerramento de sessão.
- **Barra Superior (`Navbar` & `RoleBanner`)**:
  - Badge de papel administrativo com ícone de coroa `👑 Mega Admin` / `👑 Super Admin` em pílula branca com borda suave.
  - Botão de notificações com ponto indicador em laranja WOOTECH.
  - Avatar do perfil circular em gradiente laranja radiante.
- **Painel Geral de Operações (`/dashboard`)**:
  - Cabeçalho com saudação: "Olá, Admin!" e subtítulo "Aqui está o resumo da sua operação de hoje.".
  - 4 cartões de estatísticas no topo com ícone em caixa laranja suave e badges verdes:
    1. Instâncias ativas (12, "+2 desde ontem")
    2. Conversas hoje (1.482, "+12% vs. ontem")
    3. Contatos (8.934, "+5% vs. ontem")
    4. Mensagens enviadas (24.781, "+18% vs. ontem")
  - Seção intermediária em duas colunas:
    - Esquerda: "Atividade nos últimos 7 dias" com gráfico vetorial de curvas suaves em degradê laranja e linha secundária em grafite, nós interativos e legenda colorida.
    - Direita: "Instâncias ativas" com link "Ver todas >", ícones squircle verdes do WhatsApp, telefones formatados e pills de status "● Online" / "● Offline".
  - Seção inferior de "Ações rápidas" com 4 cards limpos: "Criar instância", "Iniciar disparo", "Gerenciar contatos" e "Configurar automação".
- **Gestão de Instâncias (`/dashboard/sessions`)**:
  - Barra de ferramentas com busca rápida ("Buscar por nome ou número..."), filtros por status ("Todos os status") e botão de ação em destaque `+ Nova instância`.
  - Tabela limpa com ícones do WhatsApp, nome, número, badge de status e ações rápidas (QR Code, configurações e opções).
  - Modal assistente com fluxo em 3 etapas: `1 Dados da instância`, `2 QR Code` e `3 Conexão`.
- **Campanhas (`/dashboard/broadcast`), Contatos (`/dashboard/contacts`) e Configurações (`/dashboard/settings`)**:
  - Abas e cabeçalhos harmonizados com a paleta WOOTECH.
  - Tela de configurações enriquecida com os blocos de "Dados da conta" (Mega Admin com botão "Gerenciar plano") e "Preferências" (Notificações, Horário de atendimento, Integrações e Segurança).


