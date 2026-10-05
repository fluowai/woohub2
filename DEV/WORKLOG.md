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
- **MySQL continua indisponível** (daemon Docker parado) → scheduler/fila logam
  `Can't reach database server at localhost:3306` a cada tick; páginas que leem banco
  falham até subir o MySQL e rodar `npx prisma migrate deploy`.

