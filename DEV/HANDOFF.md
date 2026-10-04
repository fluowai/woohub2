# HANDOFF

## Situação

Repositório **WA-AKG v1.6.4** recebido como archive (sem `.git`, sem git instalado na máquina).
Git portátil (MinGit) provisionado em `%LOCALAPPDATA%\Temp\opencode\mingit` para permitir commits.

## Baseline (commit `333485f`)

- `tsc --noEmit`: **passou** (exit 0)
- `next build`: **passou** (exit 0)
- `eslint`: **falha preexistente** — 473 problemas (296 erros, 177 warnings)
- Banco MySQL local: **indisponível** (Docker Desktop sem daemon) → migrações geradas offline com `prisma migrate diff`; testes de integração com banco real pendentes de ambiente.

## Fases

| Fase | Estado |
|---|---|
| 1. Diagnóstico + segurança | em curso |
| 2. Empresas/migração/ isolamento | schema e helpers entregues, pendente reaproveitar nas rotas legadas |
| 3. Planos/cotas/assinaturas | pendente |
| 4. Fila/agendamento/webhooks | pendente |
| 5. API pública /api/v1 + OpenAPI | pendente |
| 6. Frontend Woohub | pendente |
| 7. Cobrança | pendente |
| 8. Docker/docs/testes/piloto | pendente |

## Próximos passos imediatos

1. Unificar os dois schedulers (evio duplicado da mesma fila).
2. Fila transacional de envios (MessageJob) + idempotency.
3. Rotas `/api/v1/*` + OpenAPI pt-BR.
4. Migração de dados (`scripts/migrate-tenancy.js`) e baseline `0_init`.

## Bloqueios externos

- Sem MySQL local → validação de migração em banco real pendente.
- Sem gateway de pagamento/credenciais → ativação de assinatura fica manual auditada.
