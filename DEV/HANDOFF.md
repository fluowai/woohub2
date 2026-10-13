# HANDOFF

Dev server: `npm run dev` -> `http://localhost:1609` (porta e `NODE_ENV=development` vêm do
`.env`; exige `.env`; primeira linha de `src/server/index.ts` importa
`next/dist/server/node-environment` — ver WORKLOG 2026-10-05/10-06). Banco: **PostgreSQL no
Supabase** (`DATABASE_URL`), `/api/system/health` → 200. Sessão `tA2VB4bxzAkY`
**`CONNECTED`** (número `554792701014`, sync de mensagens/contatos OK), com
`Session.linkedPhone = 4792701014` **fixado** (número não pode ser trocado; scan divergente
vira `NUMBER_MISMATCH` e abre o painel de suporte). Botão "Gerar novo QR Code" usa `GET`
(corrigido do 405). Ver WORKLOG 2026-10-06 (patches + auth state + QR) e 2026-10-07
(painel de reconexão).

## Situação

Repositório **WA-AKG v1.6.4** recebido como archive (sem `.git`); transformado na plataforma
comercial **Woohub**. Git portátil (MinGit) em `C:\Users\paulo\.local\mingit`
(identidade `Woohub Dev <dev@woohub.local>`).

## Estado dos checks (2026-10-12 — auditoria de banco e testes 100%)

| Check | Resultado |
|---|---|
| `banco de dados` (Supabase PostgreSQL 17.11) | **100% UP** (~740ms; 32 tabelas Prisma ativas e consistentes; 7 migrações versionadas concluídas) |
| `npm test` (Vitest) | **117/117** (11 arquivos; `validation.test.ts` ajustado com import estático; 100% passando) |
| `sessão WhatsApp ativa` | Sessão `cmuvvsunp0001t77awr4fox7u` com `CONNECTED`, número `4792701014`, 90 msgs, 885 contatos |
| `gate de licença` | Coberto por 23 testes automatizados (`tests/license-token.test.ts` e `tests/license-routes.test.ts`) |

## Estado dos checks (2026-10-07 — número fixo + painel de reconexão)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **110/110** (10 arquivos; +8 `phone`, +4 `whatsapp-number-guard`) |
| `npm run lint` | **638 problemas / 350 errors** — igual ao baseline 2026-10-06; `src/lib/phone.ts` e os testes novos → exit 0 |
| `npm run build` | **não executado** (dev server ativo no mesmo `.next/`) |
| smoke HTTP | `POST .../start {"phone":"4792701014"}` 200 → `linkedPhone` auto-registrado; `POST .../start {"phone":"5511999999999"}` **409 NUMBER_MISMATCH**; `GET .../tA2VB4bxzAkY` 200 `CONNECTED` + `linkedPhone`; página 200 |
| scan com outro número | **não executado** (exige 2º SIM) — regra coberta por teste unitário |

## Estado dos checks (2026-10-06 — gate de licença + ciclo do QR)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **98/98** (8 arquivos; +16 `license-token` +12 `whatsapp-manager`) |
| `npm run lint` | **638 problemas / 350 errors** (baseline 2026-10-05: 464/285; o salto é da Fase 9 não commitada + fim da distorção por `src/generated`/`coverage`, agora ignorados). Os arquivos alterados na correção do QR têm só avisos pré-existentes; `npx eslint tests/whatsapp-manager.test.ts` → exit 0 |
| `npm run build` | **não executado** nesta sessão (dev server ativo no mesmo `.next/`) |
| Docker/MySQL | **indisponíveis** no ambiente → stack e migrações não executadas |

### Gate de licença (novo)

Sem `LICENSE_KEY` o deploy **nem cria os serviços** (interpolação `:?` em
`docker-compose.yml` e `docker-stack.yml`). Com chave inválida, o
`scripts/license-entrypoint.ts` sai com código 1 → container `Exited (1)` /
tarefa Swarm `Failed` (`0 de 1`), nunca Running. Chave recomendada:
`WOHUB1.<payload>.<assinatura Ed25519>` (offline, não usa o banco), emitida com
`npx tsx scripts/license-sign.ts --genkey|--sign`. Ver `docs/DEPLOY.md` §3.1.

## Estado dos checks (2026-10-05)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm test` (Vitest) | **57/57** (5 arquivos) |
| `npm run lint` | **464 problemas / 285 errors** (baseline 473/296 → reduziu) |
| `npm run build` | **exit 0** |
| Docker/MySQL | **indisponíveis** no ambiente → stack e migrações não executadas |

## Fases

| Fase | Estado |
|---|---|
| 1. Diagnóstico + segurança | entregue (`c91b8a0`) |
| 2. Empresas/migração/isolamento | entregue (`dac6e4f`) + páginas SUPERADMIN (`6bace93`) |
| 3. Planos/cotas/assinaturas | entregue (`dea5abe`) + páginas SUPERADMIN (`6bace93`) |
| 4. Fila/agendamento/webhooks | entregue (`e30fa90`) |
| 5. API pública /api/v1 + OpenAPI | entregue (`a5efe15`) + complemento (`f720c82`) |
| 6. Frontend Woohub pt-BR | entregue (`0c9ed1c`, `3c85af6`, `c24135a`) |
| 7. Cobrança | entregue (`36d9ca7`) — webhook assinado, dedup, checkout honesto |
| 8. Docker/docs/testes/piloto | entregue (`eb76b83`, `131514f`) + docs (`BACKUP_RECOVERY`, `RETENTION`, `FINAL_REPORT`) |

## O que mudou desde o último handoff

- **Número fixo + painel de reconexão/suporte (2026-10-07)**: a instância passa a ter um
  número **registrado** que não pode ser trocado. `Session.linkedPhone`/`mismatchPhone`
  (colunas novas — não `config`, que o `PATCH .../settings` substitui inteiro) +
  `src/lib/phone.ts` (normalização, `samePhone`, `phoneFromJid` só para
  `@s.whatsapp.net`). No `connection: "open"` um número divergente é recusado
  (`rejectNumberMismatch`: `NUMBER_MISMATCH`, socket derrubado, credenciais apagadas) e
  `start`/`pair` com número diferente respondem **409 NUMBER_MISMATCH**. Tela de detalhe
  ganhou o **painel de reconexão** (input + "Reconectar", número registrado visível) e o
  **painel de suporte** em `NUMBER_MISMATCH` (registrado × escaneado,
  `mailto:suporte@woohub.app`, "Tentar com o número registrado"); `loadSessions` preserva
  o estado no reboot. Contrato em `DEV/SPECS/ACTIVE.md` (regra 13); detalhes e smoke em
  `DEV/WORKLOG.md`/`DEV/VERIFY.md` (2026-10-07). **Mudança de schema exige parar o dev
  server** (o `prisma generate` dá `EPERM` no DLL do engine enquanto o processo vive).

- **Tela global de instâncias (2026-10-06)**: o menu mega-admin linkava para
  `/dashboard/mega-admin/instances`, inexistente → 404. Criados
  `src/app/api/mega-admin/instances/route.ts` (`authenticateRequest` +
  `isMegaAdmin(context)`; `GET` paginado global com **status ao vivo** da instância em
  memória, `dbStatus` como espelho; `POST` resolve o dono OWNER/ADMIN do tenant, aplica
  `assertInstanceQuota` e chama `waManager.createSession(..., tenantId)` — único caminho
  que provisiona instância de **outro** tenant) e
  `src/app/dashboard/mega-admin/instances/page.tsx` (busca, filtro de status, paginação,
  diálogo "Nova instância" com select de empresas). Smoke real no dev server: página 200,
  API 200 com `tA2VB4bxzAkY`, 403 sem sessão, 400 sem nome, 404 com tenant inexistente;
  `tsc` exit 0, `vitest` 98/98, `eslint`   exit 0 nos novos. Os dois links quebrados do menu mega-admin
  (`/dashboard/mega-admin/plans`, `/dashboard/mega-admin/health`) foram **reapontados**
  para `/dashboard/plans` e `/dashboard/system-monitor` (ambos 200) — nenhum outro arquivo
  referenciava as rotas antigas. Como `system-monitor` estava travado em
  `role !== "SUPERADMIN"`, o guard da página e o de `GET /api/system/monitor` passaram a
  aceitar `MEGA_ADMIN` (`hasRole(..., "SUPERADMIN")`) — o isolamento por tenant
  (`canAccessSession`/`getAccessibleSessions`) **não** foi tocado.

- **Ciclo de vida do QR (2026-10-06)**: escaneamento não conectava e, após fechar
  a instância, não saía mais QR novo. Causas: (1) `socket.end()` emitia
  `connection: 'close'` até 30 s depois e esse evento atrasado limpava
  `Session.qr` **e** removia do Map a instância que tinha acabado de nascer
  (`removeInstance` sem guarda de identidade); (2) `init()` não desligava o socket
  anterior → duas conexões com as mesmas credenciais → `logged out` (visível em
  `dev-server.log` 12:18:22); (3) o QR do banco nunca era limpo, então a tela
  mostrava um código morto (Baileys rotaciona a cada 20 s) e escanear não fazia
  nada. Corrigido em `src/modules/whatsapp/{instance,manager}.ts` (geração de
  socket + `disposeSocket` + guarda de identidade + `qr: null` no stop/restart),
  `GET .../qr` (fallback para o banco), nova ação `POST .../qr` e polling de 2 s
  na tela de detalhe (`page.tsx`). Contrato em `DEV/SPECS/ACTIVE.md`; detalhes em
  `DEV/WORKLOG.md` (2026-10-06 — ciclo de vida do QR). **Exige reiniciar o dev
  server** (`tsx` sem `--watch`).

- **Gate de licença (2026-10-06)**: `${LICENSE_KEY:?…}` em **ambos** os stacks
  (deploy aborta se faltar) + reescrita do `scripts/license-entrypoint.ts`
  (valida antes de subir, executa o CMD recebido após `--`, sai com `1` se a
  licença for inválida) + `Dockerfile` com `ENTRYPOINT` que repassa `"$@"` e
  `CMD` explícito (antes `scripts/migrate.sh` era engolido e a app nunca subia).
  Autoridade offline em `src/lib/license-token.ts` (`WOHUB1.*` Ed25519) com
  emissão via `scripts/license-sign.ts`; chave opaca `WOHUB-*` mantida como
  legado validada no banco (falha fechada). Corrigido também `mapLicense(any)`
  e tipos em `src/lib/license.ts` que quebravam `tsc`.

- **Fase 8 — deploy**: stack renomeada para **`woo-woohub`**; imagens com tag fixa
  (`woohub/app:1.6.4`, `mysql:8.0.46`, `node:22.17.1-alpine` — sem `latest`); `replicas: 1`;
  banco sem porta publicada (rede interna); job único de migração `scripts/migrate.sh`
  (`prisma migrate deploy` + admin idempotente) — **sem `prisma db push` no boot**;
  healthcheck público `GET /api/system/health`; rotação de logs; limites CPU/memória;
  `TZ=America/Sao_Paulo`; guia completo em `docs/DEPLOY.md` (inclui Compose × Swarm).
- **Fase 2/P0 — admin**: páginas `/dashboard/audit`, `/dashboard/tenants`,
  `/dashboard/plans`, `/dashboard/subscriptions` + rota `GET/POST /api/audit`
  (SUPERADMIN); flags `superadminOnly` sincronizadas nos dois navs (o mobile não tinha
  a flag em "Usuários").
- **Cobrança**: `verifyMercadoPagoSignature` agora valida a assinatura via SDK e aplica a
  janela de replay **normalizando ts em segundos e milissegundos** (a doc do MP usa segundos
  e o SDK JS calcula em ms — delegar a tolerância ao SDK rejeitaria webhooks reais).
- **Escopos**: escrita em `/api/contacts*` exige `instances:write` (antes bastava escopo de
  leitura); `/api/audit`, `/api/payments`, `/api/invoices`, `/api/jobs` entraram nos
  prefixos administrativos (chave de cliente nunca alcança).
- **Testes**: `tests/payments.test.ts` e `tests/v1-access.test.ts` (assinatura,
  classificação/dedup, escopos, idempotência); `vitest.config.ts` ganhou resolução de
  `next-auth` + env de teste (nenhum teste conecta em banco).
- **pt-BR**: tradução de Usuários, Configurações e Monitor; fuso padrão `America/Sao_Paulo`.

## Pendências conhecidas (não mascaradas)

1. **Sem Docker/MySQL no ambiente** → stack, migrações reais e drill de backup
   permanecem não executados (`docs/DEPLOY.md`, `docs/BACKUP_RECOVERY.md`).
2. **Sem gateway configurado** → checkout `503 gateway_not_configured`; ativação manual
   auditada até credenciamento + teste sandbox.
3. **Expurgo de dados é manual** (`docs/RETENTION.md`): não há job de retenção de
   mensagens/mídia/auditoria; só logs de webhook (30 dias) e rotação de contêiner.
4. **Tradução parcial**: restam `src/app/privacy`, `src/app/terms`, textos internos de
   `src/lib/swagger.ts` e páginas legadas não críticas (labels, scheduler, webhooks…).
5. **CI** (`.github/workflows/ci.yml`) existe mas não foi executado (sem GitHub Actions aqui).
6. ~~Patch rc.9 do Baileys~~ **resolvido (2026-10-06)**: regenerado para `7.0.0-rc13`
   (`patches/@whiskeysockets+baileys+7.0.0-rc13.patch`); `npx patch-package` aplica os dois
   patches com exit 0. ~~Login sem senha~~ **resolvido**: a senha de `fluowai@gmail.com`
   (MEGA_ADMIN) foi redefinida para `ADMIN_PASSWORD` → login de credenciais funciona
   (`302 /dashboard`, sessão válida por 30 dias).

## Próximos passos recomendados

### Auditoria e endurecimento WooHub — 2026-10-08

- A conexão Baileys passou a anunciar `WooHub`, `Desktop`, `1.0.0` em vez de `Ubuntu`, `Chrome`, `20.0.04`.
- Criado `scripts/woohub-mcp.mjs`, sem dependência externa, com ferramentas de instâncias, QR Code, envio de texto e uso.
- Criado `docs/MCP.md` e `docs/INTEGRACOES.md`.
- Página comercial corrigida para não prometer proteção contra bloqueios, latência, SLA ou troca livre de número.
- Scripts PM2 e npm passaram a usar a marca/processo `woohub` e binários locais.
- Adicionada CSP básica e tradução adicional da documentação.
- Validação MCP passou; validação integral depende de corrigir o ambiente de execução do Windows/CI.

1. Gerar o par de chaves e emitir a 1ª licença (`scripts/license-sign.ts`),
   preencher `LICENSE_KEY` + `LICENSE_PUBLIC_KEY` no Portainer e fazer o deploy
   de teste: confirmar `Failed (0 de 1)` sem chave e `Running` com chave válida.
2. Ambiente com Docker/MySQL: `docker compose up -d` → drill de backup/restauração →
   registrar em `DEV/VERIFY.md`.
3. Credenciamento MercadoPago + webhook público + pagamento sandbox (fecha Fase 7 em produção).
4. Tarefas de expurgo agendadas (retention) antes de piloto com clientes reais.
5. Backlog: tradução das telas legadas restantes, CSP em `next.config.ts`,
   automação de retenção, gateway Stripe.

## Mapas úteis

- API pública (Fase 5): envelope `{ data, meta? }` / erro `{ error: { code, message }, request_id }`
  em `src/lib/v1/http.ts`; escopos em `src/lib/access.ts:requiredScopeFor`;
  contrato em `GET /api/v1/openapi.json` (público).
- Fila (Fase 4): `src/lib/queue.ts` (worker único 1 s, lock otimista) +
  `src/modules/whatsapp/scheduler.ts`.
- Cobrança: `src/lib/payments.ts` + rotas `src/app/api/payments/*` (webhook é público via
  `PUBLIC_API_EXACT` em `src/proxy.ts`).
- Operação: `docs/DEPLOY.md`, `docs/BACKUP_RECOVERY.md`, `docs/RETENTION.md`,
  `FINAL_REPORT.md` (pendências externas + plano de piloto).
- Licença: `src/lib/license-token.ts` (assinatura/verificação Ed25519) ·
  `scripts/license-entrypoint.ts` (gate da porta de entrada) ·
  `scripts/license-sign.ts` (emissão do fornecedor) · âncora `x-license-env`
  em `docker-stack.yml` e entradas de `docker-compose.yml` · contrato em
  `docs/DEPLOY.md` §3.1 e `.env.example` §11.

## Bloqueios externos

- Docker daemon indisponível e MySQL ausente → validação de implante/migração pendente.
- Sem credenciais de gateway → ativação de assinatura manual auditada (modo piloto).
