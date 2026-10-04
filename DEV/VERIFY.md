# VERIFY — Como verificar o projeto

## Comandos

```bash
npm install            # aplica patch-package (patches/)
npx prisma validate    # valida schema
npx tsc --noEmit       # checagem de tipos
npm run lint           # eslint
npm run build          # next build
npm test               # testes automatizados (node:test + tsx)
```

## Estado dos checks

| Check | Baseline (333485f) | Observação |
|---|---|---|
| `tsc --noEmit` | passou | — |
| `next build` | passou | — |
| `eslint` | **falhou (preexistente)** 473 problemas / 296 errors | sem regressão: 465 problemas / 293 errors / 172 warnings após as fases 1-2 |
| testes automatizados | não existiam | criados na Fase 8 (`tests/`) |
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

- Sem MySQL local e sem daemon Docker → testes de integração com banco/implante não executados.
- Sem gateway de pagamento configurado → checkout não é apresentado como funcional.
- Nenhuma carga testada → nenhuma promessa de capacidade de clientes.

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
