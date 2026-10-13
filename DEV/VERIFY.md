# VERIFY — Como verificar o projeto

## Comandos

```bash
npm install            # aplica patch-package (patches/) — saída: 2 patches ✔
npx patch-package       # reaplica só os patches (sem reinstalar nada)
npm run dev            # dev server em http://localhost:1609 (PORT/NODE_ENV do .env)
npx prisma validate    # valida schema
npx tsc --noEmit       # checagem de tipos
npm run lint           # eslint
npm run build          # next build
npm test               # Vitest (tests/*.test.ts)
```

> **Patches (2026-10-06):** `patches/@whiskeysockets+baileys+7.0.0-rc13.patch` (portado do
> rc.9) + `patches/whatsapp-rust-bridge+0.5.4.patch` (condição `require` p/ o tsx em CJS).
> `npx patch-package` → exit 0. O rc.9 foi removido (backup em `%TEMP%\baileys-rc9-backup.patch`).
>
> **Login (2026-10-06):** `fluowai@gmail.com` (MEGA_ADMIN) usa `ADMIN_PASSWORD` do `.env`
> como senha — `POST /api/auth/callback/credentials` → `302 /dashboard` e
> `GET /api/auth/session` devolve `role: MEGA_ADMIN`. As demais contas do banco **não**
> batem com `ADMIN_PASSWORD` (`scripts/setup-admin.js` não reseta senha de usuário existente).

## Estado dos checks (2026-10-07 — número fixo + painel de reconexão)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **110/110** (10 arquivos; +8 `tests/phone.test.ts`, +4 `tests/whatsapp-number-guard.test.ts`) |
| `npm run lint` | **638 problemas / 350 errors** — **igual ao baseline** 2026-10-06; `src/lib/phone.ts` e os 2 arquivos de teste novos → `npx eslint` exit 0 |
| `npm run build` | **não executado** (dev server ativo no mesmo `.next/`) |
| colunas novas | `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "linkedPhone"/"mismatchPhone" TEXT` via `npx prisma db execute --stdin --schema prisma/schema.prisma` + `npx prisma generate` — **exige parar o dev server** (o rename do `query_engine-windows.dll.node` dá `EPERM` com o processo carregado) |
| smoke HTTP (sessão real) | login `302` → `POST /api/sessions/tA2VB4bxzAkY/start {"phone":"4792701014"}` **200** e `linkedPhone` passou a `4792701014` (auto-registrado no `connection: open`); `POST .../start {"phone":"5511999999999"}` → **409 `NUMBER_MISMATCH`** com `data.linkedPhone`/`data.requestedPhone`; `GET .../tA2VB4bxzAkY` → `hasInstance:true`, `status:CONNECTED`, `linkedPhone:4792701014`, `me:554792701014:11@s.whatsapp.net`; página `/dashboard/sessions/tA2VB4bxzAkY` **200** |
| boot do dev server | reinício necessário ao mudar o schema; no boot de 2026-10-07 o `loadSessions()` falhou 1× com `Can't reach database server` (pooler Supabase) e a instância **não** subiu sozinha — religada via `POST .../start` |
| scan com outro número | **não executado** (exige um segundo SIM); a regra está coberta por `tests/whatsapp-number-guard.test.ts`, não por e2e |

Arquivos alterados: `prisma/schema.prisma`, `src/lib/phone.ts` (novo),
`src/modules/whatsapp/{instance,manager}.ts`,
`src/app/api/sessions/[sessionId]/{route.ts,[action]/route.ts}`,
`src/app/dashboard/sessions/[sessionId]/page.tsx`,
`tests/{phone,whatsapp-number-guard}.test.ts` (novos).

## Estado dos checks (2026-10-06 — ciclo de vida do QR)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run` | **98/98** (8 arquivos; +12 em `tests/whatsapp-manager.test.ts` — guarda de identidade do `removeInstance`, limpeza do QR no stop/restart, reuso de instância) |
| `npm run lint` | **638 problemas / 350 errors** (baseline 632/351 → **−1 error**, +6 warnings). Nos 7 arquivos alterados há 9 warnings, **todos pré-existentes** (imports/`catch (e)`/`exhaustive-deps` da effect original); o novo teste linta isolado: `npx eslint tests/whatsapp-manager.test.ts` → exit 0 |
| `npm run build` | **não executado** — dev server ativo no mesmo `.next/` |
| polling do QR | **observado** no `dev-server.log`: `GET /api/sessions/tA2VB4bxzAkY/qr 200` (único consumidor da rota é o polling novo) |
| escaneamento real | **não executado** (requer celular; sem ambiente WhatsApp) |

Arquivos alterados: `src/modules/whatsapp/{instance,manager}.ts`,
`src/app/api/sessions/[sessionId]/{route.ts,qr/route.ts,[action]/route.ts}`,
`src/app/dashboard/sessions/[sessionId]/page.tsx`,
`tests/whatsapp-manager.test.ts`.

> **Reiniciar o dev server** depois de mexer em `src/modules/whatsapp/*`: `tsx` roda
> sem `--watch` e o `waManager` singleton vive no processo antigo
> (`global.waManager`). Rotas em `src/app/api/**` o Next recompila sozinho.

## Estado dos checks (2026-10-06 — gate de licença)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **86/86** (7 arquivos; +16 em `tests/license-token.test.ts`) |
| `npm run lint` | **632 problemas / 351 errors** — sem regressão do baseline anterior (635/352); os arquivos do gate de licença passam isolados (`npx eslint src/lib/license-token.ts scripts/license-entrypoint.ts scripts/license-sign.ts tests/license-token.test.ts src/lib/license.ts` → exit 0) |
| `npm run build` | **não executado** — dev server ativo no mesmo `.next/` |
| stack Docker | **não executada** (daemon indisponível) |
| boot do dev server | **passou (2026-10-06)** — health 200 (`database: "up"`), `/` 200, `/api/v1/openapi.json` 200; `npm run dev` puro sobe em `development` em `:1609` |
| `npm install` (postinstall) | **passou (2026-10-06)** — 2 patches aplicados (baileys rc13 + rust-bridge), exit 0 |
| pareamento WhatsApp | **passou (2026-10-06 16:43)** — sessão `tA2VB4bxzAkY` **`CONNECTED`** (`me: 554792701014:11@s.whatsapp.net`, "Wootech"; 56 mensagens + contatos sincronizados). Durante o pareamento: `GET /qr` 200 → 404 (antes do código chegar) → 400 (já conectado) e 2× `POST /qr` 405 (antes da correção do botão); **contadores estáveis (0 novos)** depois de conectado |

Mudança de baseline de lint: `src/generated/**` (cliente Prisma) e `coverage/**`
passaram a ser ignorados pelo ESLint (saída gerada, 2437 problemas que
distorciam a contagem).

### Gate de licença — verificação executada (2026-10-06)

```bash
# prepara par + chave (temp)
node -e "const c=require('crypto'),f=require('fs');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');f.writeFileSync('/tmp/lic_priv.pem',privateKey.export({type:'pkcs8',format:'pem'}));f.writeFileSync('/tmp/lic_pub.pem',publicKey.export({type:'spki',format:'pem'}))"
LICENCA_PRIV_KEY=$(cat /tmp/lic_priv.pem) node node_modules/tsx/dist/cli.mjs scripts/license-sign.ts --sign --sub "Cliente Teste" --days 30

# 1) chave valida -> banner LICENCA VALIDA e o comando roda (exit 0)
LICENSE_KEY=... LICENSE_PUBLIC_KEY=$(cat /tmp/lic_pub.pem) \
  node node_modules/tsx/dist/cli.mjs scripts/license-entrypoint.ts -- node -e "console.log('APP_OK')"
# => APP_OK, exit 0

# 2) sem LICENSE_KEY          -> exit 1 ("LICENSE_KEY nao definida")
# 3) assinatura forjada       -> exit 1 ("Assinatura da licenca invalida")
# 4) sem LICENSE_PUBLIC_KEY   -> exit 1 ("LICENSE_PUBLIC_KEY nao definida")
# 5) public key de outro par  -> exit 1 ("Chave publica de licenca invalida")
# 6) chave legada WOHUB-*     -> exit 1 (banco/registro indisponivel = falha fechada)
# 7) args do CMD preservados  -> APP_OK args=arg1|arg2 (entrypoint repassa `--`)
```

Cenários 2–6 retornam **exit 1**: é o código que derruba o container
(`Exited (1)`) e deixa a tarefa do Swarm como `Failed`.

### Ressalvas deste ambiente

- `.next/dev/types/{routes.d.ts,validator.ts}` saíram **corrompidos** por escrita
  concorrente do dev server ativo, quebrando `tsc`. Remediado com
  `npx next typegen` + remoção dos artefatos corrompidos de `.next/dev/types/`.
  Se acontecer de novo: `npx next typegen` e repetir.
- Git portátil fora do PATH: `C:\Users\paulo\.local\mingit\cmd\git.exe`.

## Estado dos checks (2026-10-05)

| Check | Baseline (333485f) | Observação |
|---|---|---|
| `tsc --noEmit` | passou | **passou** (exit 0) |
| `next build` | passou | **passou** (exit 0) — inclui páginas audit/tenants/plans/subscriptions |
| `eslint` | **falhou (preexistente)** 473 problemas / 296 errors | sem regressão: **464 problemas / 285 errors / 179 warnings** |
| testes automatizados | não existiam | **57/57** em 5 arquivos (Vitest: payments, v1-access, permissions, validation, ssrf) |
| stack Docker `woo-woohub` | não existia | YAML validado; **não executada** (daemon Docker indisponível) |
| migrações em banco real | não executadas | Docker daemon indisponível no ambiente |
| integração com WhatsApp real | não executada | requer números de teste autorizados |

## Migrações

```bash
# aplicar em banco existente (backup antes!):
npx prisma migrate deploy
# baseline para banco criado com db push:
npx prisma migrate resolve --applied 0_init
# backfill de tenants (idempotente):
node scripts/migrate-tenancy.js
```

## Limitações declaradas

### Auditoria de produção WooHub — 2026-10-08

- Identificação do dispositivo Baileys alterada para `WooHub / Desktop / 1.0.0`.
- Servidor MCP mínimo por JSON-RPC adicionado em `scripts/woohub-mcp.mjs` e documentado em `docs/MCP.md`.
- Página comercial revisada para remover promessa de bloqueio evitado, latência, SLA e troca livre de número.
- Headers de segurança receberam CSP básica em `next.config.ts`.
- Scripts de execução passaram a usar binários locais (`tsx`) em vez de `npx`.
- MCP validado localmente com `initialize` e `tools/list`.
- `npm.cmd install @modelcontextprotocol/sdk` não concluiu por `EPERM` no cache do npm; o SDK oficial não foi adicionado.
- TypeScript, lint, Vitest e build completos continuam pendentes de um ambiente Windows/CI que consiga ler o workspace e resolver o PowerShell usado por `systeminformation`.

- Sem MySQL local e sem daemon Docker → testes de integração com banco/implante não executados;
  stack e job de migração só validados em código/YAML.
- Sem gateway de pagamento configurado → checkout responde `503 gateway_not_configured`
  e não é apresentado como funcional.
- Nenhuma carga testada → nenhuma promessa de capacidade de clientes.
- Testes são unitários/de módulo: nenhum deles conecta em banco ou no WhatsApp.
- CI (`.github/workflows/ci.yml`) presente mas não executado neste ambiente.

## Smoke manual (após `migrate deploy` + login na sessão do navegador)

```bash
curl -s localhost:3000/api/tenants/usage -H "Cookie: authjs.session-token=<token>"
curl -s localhost:3000/api/plans                      # catálogo (ativo)
curl -s -X POST localhost:3000/api/plans -H "Content-Type: application/json" \
  -d '{"code":"starter","name":"Starter","priceCents":0,"maxInstances":2,"sendLimit":1000}'
curl -s -X POST localhost:3000/api/subscriptions -H "Content-Type: application/json" \
  -d '{"tenantId":"...","planId":"...","status":"ACTIVE","periodDays":30}'
curl -s -X POST localhost:3000/api/sessions -H "Content-Type: application/json" \
  -d '{"name":"Teste"}'                               # 403 quando maxInstances atingido
```

Esperado: sem assinatura → modo piloto (sem limite); com assinatura → 402/403 com
`code: quota_exceeded` ou `subscription_inactive`.

## Smoke da API pública (`/api/v1`)

```bash
# documento do contrato (público, sem credencial)
curl -s localhost:3000/api/v1/openapi.json | head -c 200
# metadados + uso (exige chave ou sessão)
curl -s localhost:3000/api/v1        -H "Authorization: Bearer $WOHUB_KEY"
curl -s localhost:3000/api/v1/usage  -H "Authorization: Bearer $WOHUB_KEY"
# instâncias
curl -s localhost:3000/api/v1/instances -H "Authorization: Bearer $WOHUB_KEY"
curl -s -X POST localhost:3000/api/v1/instances -H "Authorization: Bearer $WOHUB_KEY" \
  -H "Content-Type: application/json" -d '{"name":"Vendas"}'
curl -s -X POST localhost:3000/api/v1/instances/$ID/actions \
  -H "Authorization: Bearer $WOHUB_KEY" -H "Content-Type: application/json" \
  -d '{"action":"start"}'
# envio: texto (200 síncrono) e mídia (202 na fila)
curl -s -X POST localhost:3000/api/v1/instances/$ID/messages \
  -H "Authorization: Bearer $WOHUB_KEY" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","text":"Olá"}'
curl -s -i -X POST localhost:3000/api/v1/instances/$ID/messages \
  -H "Authorization: Bearer $WOHUB_KEY" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","media_url":"https://exemplo.com/foto.png"}'
```

Esperado: envelope `{error:{code,message},request_id}` em 401 (chave inválida),
403 (`insufficient_scope`), 409 (`instance_not_connected`), 402/403 (cota),
429 (rate limit, com `Retry-After`). Chave sem o escopo certo nunca passa.

## Smoke do painel (Fase 6)

```bash
# interfaces novas (exigem sessão no navegador)
# /dashboard/billing  -> GET /api/tenants/usage, /api/subscriptions, /api/plans
# /dashboard/team     -> GET/POST /api/tenants/members, DELETE /api/tenants/members/{userId}
# /dashboard/api-keys -> GET/POST/DELETE /api/api-keys
curl -s localhost:3000/api/plans            # qualquer sessão autenticada
curl -s localhost:3000/api/tenants/usage    # consumo da empresa (modo piloto sem limites)
curl -s localhost:3000/api/api-keys         # chaves da empresa (só o prefixo, nunca o segredo)
```

Esperado: catálogo de planos ativos, snapshot `mode: "pilot"` quando não há assinatura,
lista de chaves com `display` redigido (`whk_...`) e criação devolvendo `key` **uma única
vez**. Em navegador: páginas em pt-BR, menu com "Planos e uso", "Equipe" e "Chaves de API"
(últimas duas visíveis só para `SUPERADMIN`/`OWNER`), tema laranja/branco/preto.

## Smoke de operação (Fase 8)

```bash
curl -s localhost:3000/api/system/health        # público: 200 quando pronto, 503 se não
curl -s localhost:3000/api/system/health | head -c 200
# com sessão SUPERADMIN no navegador:
# /dashboard/audit   -> GET /api/audit?limit=50
# /dashboard/tenants -> GET /api/tenants
# /dashboard/plans   -> GET /api/plans
# /dashboard/subscriptions -> GET /api/subscriptions
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/audit   # 403 para chave de cliente
```

Esperado: health público sem exposição de segredos; páginas admin carregam apenas para
`SUPERADMIN`; chave de cliente em `/api/audit` responde 403.

## Smoke do mega-admin (instâncias, 2026-10-06)

```bash
# com sessão MEGA_ADMIN no navegador:
# /dashboard/mega-admin/instances -> GET /api/mega-admin/instances?page=1&limit=20
curl -s localhost:1609/api/mega-admin/instances
curl -s "localhost:1609/api/mega-admin/instances?search=tA2&status=STOPPED"
curl -s -o /dev/null -w "%{http_code}\n" localhost:1609/api/mega-admin/instances   # 403 sem sessão
curl -s -X POST localhost:1609/api/mega-admin/instances -H 'Content-Type: application/json' \
  -d '{"name":"Vendas","tenantId":"<tenantId>"}'
curl -s -X POST localhost:1609/api/mega-admin/instances -H 'Content-Type: application/json' \
  -d '{"name":"x","tenantId":"naoexiste"}'                                        # 404
```

Esperado: `GET` 200 com `data[]` (status **ao vivo** da instância, `dbStatus`, `tenantName`,
`ownerEmail`, `contactsCount`/`messagesCount`) e `pagination`; página
`/dashboard/mega-admin/instances` 200 para `MEGA_ADMIN`; 403 sem cookie ou sem o papel;
`POST` sem nome 400, empresa inexistente 404, empresa sem membros 409, acima da cota 409
(envelope `quotaErrorResponse`); criação sem `tenantId` entra em modo piloto (sem cota).
# Verificação adicional — 2026-10-08

| Check | Resultado |
|---|---|
| `npx prisma validate` após entidades de revenda | **passou** |
| Migração `20261008000000_reseller_stack_templates` aplicada | **não executada** — requer banco isolado disponível |
| Provisionamento remoto/Docker | **não executado** por escopo e indisponibilidade do daemon |

