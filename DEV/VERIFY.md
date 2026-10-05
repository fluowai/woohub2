# VERIFY — Como verificar o projeto

## Comandos

```bash
npm install            # aplica patch-package (patches/)
npm run dev            # sobe em http://localhost:3000 (exige .env)
npx prisma validate    # valida schema
npx tsc --noEmit       # checagem de tipos
npm run lint           # eslint
npm run build          # next build
npm test               # Vitest (tests/*.test.ts)
```

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
