# Woohub — Relatório Final de Entrega

**Data:** 2026-10-05 · **Versão:** 1.6.4 · **Stack:** Next.js 16.1.1 + React 19 + TypeScript 5.9 + Prisma 5 + MySQL 8 + Baileys 7 (patched)

Este relatório separa **o que foi verificado**, **o que existe mas não pôde ser
validado neste ambiente**, **o que depende de configuração externa** e **o que
ficou fora do escopo**. Nada aqui é marcado como concluído sem evidência.

---

## 1. Verificações executadas (ambiente desta entrega)

| Verificação | Comando | Resultado |
|---|---|---|
| Tipagem | `npx tsc --noEmit` | **exit 0** |
| Testes | `npm test` (Vitest) | **57/57 testes, 5 arquivos** |
| Lint | `npm run lint` | **464 problemas / 285 errors** (baseline do repo: 473 / 296 → reduziu) |
| Build de produção | `npm run build` | **exit 0** (gera todas as rotas, incl. novas páginas admin) |
| YAML dos arquivos de deploy | parse `js-yaml` | `docker-compose.yml` e `docker-stack.yml` válidos |
| Docker / MySQL | `docker compose up`, migrações reais | **não executáveis** (daemon Docker parado, MySQL ausente) |

Ambiente: Windows, Node v22.17.1, npm 11.12.1. Git via mingit local.

---

## 2. Implementado e testado (com evidência)

### Segurança e acesso
- Headers de segurança em `next.config.ts`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security` (HSTS).
- Chaves de API `whk_<publicId>_<secret>` com hash (verificação em
  `src/lib/security/api-keys.ts`), revogação e expiração.
- Envelope AES-256-GCM para credenciais (`src/lib/security/crypto.ts`) com
  chave atual + anterior (rotação) — falha ruidosa se faltar chave em produção.
- Escopos por chave: `requiredScopeFor()` **testado**; rotas administrativas
  (`/api/users`, `/api/tenants`, `/api/plans`, `/api/subscriptions`,
  `/api/settings`, `/api/system`, `/api/notifications`, `/api/auth`,
  `/api/docs`, `/api/media`, `/api/audit`, `/api/payments`, `/api/invoices`,
  `/api/jobs`) rejeitam chave de cliente com 403.
- Correção de escopo: escrita em `/api/contacts*` passou a exigir
  `instances:write` (antes uma chave de leitura conseguia escrever).

### Cobrança (Fase 7)
- Webhook MercadoPago **obrigatoriamente assinado** (401 sem assinatura; 503 se
  `PAYMENT_WEBHOOK_SECRET` ausente), com confirmação **server-to-server** antes
  de qualquer efeito, dedup por `buildExternalEventId` estável, tratamento de
  fora de ordem e efeitos transacionais (Invoice/Subscrição).
- **Correção de risco de produção**: a documentação do MercadoPago envia `ts`
  em **segundos**, enquanto o SDK JS calcula a tolerância em milissegundos —
  com tolerância delegada ao SDK, webhooks reais seriam rejeitados. A validação
  agora verifica a assinatura via SDK e aplica a janela de replay normalizando
  as duas unidades (`src/lib/payments.ts`). Coberto por testes.
- Sem gateway configurado: checkout responde `503 gateway_not_configured`
  (nenhum link falso); `configuredGateway()` **testado**.

### API pública v1 (Fase 5)
- Rotas `POST /instances/{id}/connect|disconnect`,
  `GET /instances/{id}/messages/{messageId}`, envio com **`Idempotency-Key`**
  (409 `idempotency_key_reuse`/`idempotency_in_progress`), status honestos
  (`SENT`, `accepted` para mídia — sem `delivered: true` antecipado).
- OpenAPI em pt-BR com exemplos **cURL / JavaScript / n8n**, parâmetro
  `Idempotency-Key` e guia de estados; endpoint público
  `/api/v1/openapi.json`.
- **Testado**: escopos por método/rota, `idempotencyKey`, `requestFingerprint`.

### Frontend pt-BR (Fases 2 e 6)
- Páginas SUPERADMIN novas: **Auditoria** (`/dashboard/audit` + `/api/audit`),
  **Empresas**, **Planos**, **Assinaturas** — com flags `superadminOnly`
  sincronizadas nos dois navs (sidebar e mobile; o mobile estava sem a flag em
  "Usuários").
- Tradução pt-BR das páginas críticas (Usuários, Configurações, Monitor do
  sistema); fuso padrão `America/Sao_Paulo` (antes `Asia/Jakarta`).

### Testes (Fase 13)
- `tests/payments.test.ts` — assinatura (válida/forjada/expirada/segundos),
  classificação de status, dedup de eventos, gateway não configurado.
- `tests/v1-access.test.ts` — escopos administrativos/v1/legados e idempotência.
- Pré-existentes: `permissions`, `validation`, `ssrf`.
- `vitest.config.ts` ganhou resolução para `next-auth` + env de teste (nenhum
  teste conecta em banco).

---

## 3. Implementado, mas **não validado** neste ambiente

Itens com código pronto que exigem Docker/MySQL/rede para provar:

| Item | Evidência disponível | O que falta |
|---|---|---|
| Stack `woo-woohub` (Compose/Swarm) | YAML parseado; revisão de código | `docker compose up` real |
| Job único de migração (`scripts/migrate.sh`) | código + idempotência do setup-admin | execução contra MySQL |
| Migrations Prisma (`0_init`, `0001_commerce`) | `prisma migrate status` exige BD | aplicação em banco novo |
| Healthcheck `/api/system/health` (público) | rota criada, build OK | probe com app no ar |
| Fila `MessageJob`, scheduler, webhooks com retry | código herdado + testes de apoio | corrida real com instância Baileys |
| Quotas/suspensão por plano | lógica em `src/lib/quota.ts` | consumo real com BD |
| CI (`.github/workflows/ci.yml`) | arquivo presente | execução no GitHub |

> Nenhum teste de integração com banco foi executado — declare isto em qualquer
> checklist de aceite.

---

## 4. Dependente de configuração externa

| Item | Variável/ação | Comportamento sem isso |
|---|---|---|
| Gateway de pagamento | `PAYMENT_GATEWAY`, `PAYMENT_GATEWAY_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` | checkout `503 gateway_not_configured`; ativação **manual e auditada** (modo piloto) |
| Segredos de sessão | `AUTH_SECRET` | Compose/Stack abortam (`:?`) |
| Banco | `MYSQL_*`, `DATABASE_URL` | app não sobe (job de migração falha) |
| Chave de credenciais | `CREDENTIALS_ENCRYPTION_KEY` (32B base64) | produção falha ao decifrar (comportamento desejado) |
| Domínio/TLS/proxy | `BASE_URL`, `NEXTAUTH_URL`, Traefik do host | sessão/webhooks apontam para lugar errado |
| Credenciais WhatsApp | QR/pareamento por instância | sem instâncias conectadas |

Nenhuma dessas credenciais está em arquivos versionados (`.env*` ignorado;
`.env.example` apenas com placeholders).

---

## 5. Fora do escopo (não entregue, não prometido)

- **Proteção contra bloqueio de número** — nenhum mecanismo desta plataforma
  evita bloqueio pelo WhatsApp; o risco é do canal e deve ser gerenciado
  operacionalmente.
- Alta disponibilidade / DR, multi-réplica com fila distribuída (a stack fixa
  **1 réplica** no MVP: rate limit, worker e flusher são de processo único).
- Autoscaling, WAF, HA de banco.
- Rotina automática de expurgo de mensagens/mídia (hoje: manual —
  `docs/RETENTION.md`).
- Gateway Stripe (interface existe, não conectada).
- Modificações em Traefik/Docker global compartilhado (apenas parâmetros
  documentados em `docs/DEPLOY.md`).
- Deploy automático em produção (o deploy é um comando manual).

---

## 6. Documentação entregue

| Arquivo | Conteúdo |
|---|---|
| `docs/DEPLOY.md` | instalação, build de imagem, Compose, Swarm/migração, integração com proxy, **Compose × Swarm**, verificação, **rollback**, resumo de backup |
| `docs/BACKUP_RECOVERY.md` | o que copiar, dump/mídia, drill de restauração, **custódia de chaves** |
| `docs/RETENTION.md` | política de retenção: automático × manual |
| `docs/` (preexistente) | API, banco, variáveis de ambiente, guias |
| `DEV/` | contexto, handoff, verificação e worklog do projeto |
| `FINAL_REPORT.md` | este documento |

---

## 7. Pendências externas (ação do operador)

1. Subir Docker/MySQL e rodar o **drill de backup/restauração**.
2. Gerar segredos (`openssl rand -base64 32`) e preencher `.env`.
3. Configurar gateway MercadoPago + URL pública do webhook + teste com
   pagamento sandbox.
4. Publicar atrás do proxy do host com TLS (parâmetros em `docs/DEPLOY.md`).
5. Primeira execução do job de migração + criação única do SUPERADMIN.

---

## 8. Plano de piloto (recomendado)

| Etapa | Escopo | Critério de saída |
|---|---|---|
| P0 | Ambiente único, 1 tenant interno, sem gateway (ativação manual) | health 200, 1 instância conectada, envio/recebimento reais |
| P1 | + webhook de pagamento em sandbox, 2-3 tenants de teste | checkout → ativação automática auditada; DLQ zerada |
| P2 | Carga leve (fila em pico), drill de backup/rollback, retenção manual registrada | sem perda de job; rollback testado |
| P3 | Liberação para clientes reais dentro da cota do plano | quotas aplicadas, suporte com trilha de auditoria |

Frequência de operação diária: health, DLQ (`/dashboard/jobs`), auditoria
(`/dashboard/audit`), uso por tenant (`/api/tenants/usage`).

---

## 9. Commits desta entrega

```
c24135a Tradução pt-BR (usuários/configs/monitor), fuso São Paulo, any corrigido
131514f Testes (57) + unidade do ts do MercadoPago + escopo de contatos + prefixos admin
6bace93 Páginas SUPERADMIN (auditoria/empresas/planos/assinaturas) + /api/audit + flags de nav
eb76b83 Fase 8: stack woo-woohub, tag fixa, job único de migração, readiness, 1 réplica, DEPLOY.md
f720c82 Fase 5 complemento: connect/disconnect, mensagem, Idempotency-Key, OpenAPI com exemplos
36d9ca7 Fase 7: webhook assinado, dedup transacional, fora de ordem, checkout honesto
3c85af6 Fase 7/8 base: CRUD empresas, perfil, faturas, DLQ, docs v1, Vitest, Swarm, headers
0c9ed1c Fase 6: marca Woohub, UI pt-BR
a5efe15 Fase 5: API /api/v1 + OpenAPI pt-BR
e30fa90 Fase 4: fila MessageJob, scheduler único, webhook via fila
dea5abe Fase 3: planos, cotas e assinaturas
dac6e4f Fase 2: migração de tenancy idempotente
```

---

## 10. Como reproduzir as verificações

```bash
npm ci
npx tsc --noEmit     # tipagem
npm test             # 57 testes
npm run lint         # regressão/avanço de lint
npm run build        # build de produção
```
