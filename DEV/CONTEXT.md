# CONTEXT — Woohub

## Produto

**Woohub**: plataforma comercial de API WhatsApp não oficial, construída sobre o repositório
WA-AKG (MIT, upstream `mrifqidaffaaditya/WA-AKG`). Empresas assinam um plano, conectam seus
próprios números e usam a API.

Motor: **Baileys** (`@whiskeysockets/baileys` 7.0.0-rc.9) com patch local em `patches/`.
Não substituir por Whatsmeow nesta implementação.

## Stack (preservada)

Next.js 16.1.1 (App Router) · TypeScript 5.9 · Prisma 5.22 (MySQL) · Socket.IO 4.8 ·
NextAuth v5 (JWT) · Tailwind v4 · Zod 4.

Servidor customizado: `src/server/index.ts` sobe HTTP + Next + Socket.IO + scheduler.

## Arquitetura de autorização (Woohub)

- `src/lib/access.ts` — resolução central de credencial (sessão NextAuth ou API key),
  escopo exigido por rota, contexto publicado em `AsyncLocalStorage`.
- `src/proxy.ts` — único ponto de entrada de `/api/*`: rate limit (429), autenticação (401),
  escopo de chave (403), headers de identidade sobrescritos.
- `src/lib/api-auth.ts` — helpers usados pelas rotas existentes; agora sempre tenant-aware.
- `src/lib/permissions.ts` — matriz explícita de permissões por papel (sem hierarquia numérica).
- `src/lib/audit.ts` — trilha de auditoria (acesso global de SUPERADMIN, chaves, cobrança).

## Isolamento por empresa (Tenant)

Toda a base de dados passa por `Tenant` / `TenantMember`. `Session.tenantId` e `Webhook.tenantId`
foram adicionados no schema (colunas anuláveis; preenchimento via `scripts/migrate-tenancy.js`).
Linhas legadas sem `tenantId` só ficam visíveis ao próprio dono.

## Salas do Socket.IO

- instância: `i:<tenantId>:<sessionPk>`
- usuário:  `u:<tenantId>:<userId>`

Identidade derivada do handshake (cookie JWT ou API key). Nada de `userId`/`tenantId` do cliente.

## Segredos

| Segredo | Onde vive |
|---|---|
| `AUTH_SECRET` | ambiente |
| `CREDENTIALS_ENCRYPTION_KEY` | ambiente (AES-256-GCM para credenciais Baileys) |
| API key (full) | exibida 1x na criação; só o hash é persistido |
| Webhook secret | coluna `Webhook.secret` (uso interno de HMAC) |

## API pública `/api/v1`

- Envelope único: sucesso `{ data, meta? }`, erro `{ error: { code, message }, request_id }`
  (`src/lib/v1/http.ts`). O proxy usa o mesmo envelope para 401/403/429/cota em `/api/v1`.
- Escopo exigido por rota em `src/lib/access.ts:requiredScopeFor`; instância acessada
  por `src/lib/v1/instance.ts` (`id` ou `session_id`) com `canAccessSession`.
- Rotas: `/api/v1`, `openapi.json`, `usage`, `instances[...]`, `webhooks[...]`.
  Documentação: `GET /api/v1/openapi.json` (OpenAPI 3.1 pt-BR, público).
- Envio de texto é síncrono; mídia por URL responde 202 e vai para a fila `MessageJob`.

## Frontend (Fase 6)

- Marca **Woohub**, idioma **pt-BR** (`src/app/layout.tsx`) e tema laranja/branco/preto em
  `src/app/globals.css` (Tailwind v4, `--primary: oklch(0.646 0.222 41.116)`).
- Páginas comerciais: `/dashboard/billing` (planos + assinatura + uso), `/dashboard/team`
  (membros), `/dashboard/api-keys` (chaves, segredo exibido 1x). Entradas no menu com
  `allowedRoles` (`sidebar-nav.tsx` / `mobile-nav.tsx`).
- Pendências de tradução: `src/app/privacy`, `src/app/terms`, textos internos de
  `src/lib/swagger.ts` e mensagens de erro de rotas legadas.
- Créditos upstream preservados (MIT): links do GitHub WA-AKG, comentários de crédito e
  `REPO_NAME` em `src/app/api/system/check-updates/route.ts`.
- **Regra de ferramenta**: alterações de arquivo pela ferramenta de edição. Um script de
  substituição em lote do shell corrompeu 5 arquivos (substituição global de caractere);
  foram restaurados com `git checkout --` — não repetir.

## Limites conhecidos (declarados, não mascarados)

- Rate limit em memória → suporta **réplica única** (topologia MVP).
- Fila `MessageJob` e flusher de uso também assumem **processo único**
  (worker reivindica com lock otimista; uma segunda réplica duplicaria trabalho, não mensagens,
  mas não foi testada).
- Sem teste de carga → nenhuma promessa de capacidade de clientes.
- Nenhuma proteção contra bloqueio do WhatsApp é prometida.
