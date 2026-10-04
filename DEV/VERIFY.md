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
