# SPECS/ACTIVE — Contrato da tarefa

Briefing completo: transformar WA-API em plataforma comercial **Woohub**.

## Regras fundamentais

1. Preservar o motor Baileys; não substituir por Whatsmeow.
2. Não reescrever funcionalidades existentes sem necessidade.
3. Marca Woohub no frontend; preservar copyright e licença MIT.
4. Não inventar funcionalidades/testes/métricas; não prometer proteção contra bloqueios.
5. Não alterar outras stacks/domínios/bancos; não limpar Docker globalmente; não mexer no Traefik compartilhado.
6. Não implantar automaticamente em produção.
7. Sem segredos em arquivos versionados, logs ou documentação.
8. Nenhuma stack sobe sem licença válida: `${LICENSE_KEY:?…}` em `docker-compose.yml`
   e `docker-stack.yml` (deploy aborta) + gate na porta de entrada
   (`scripts/license-entrypoint.ts`, sai com código 1). A chave privada de
   assinatura (`LICENCA_PRIV_KEY`) fica só no servidor do fornecedor.
9. O QR nunca pode ficar "preso": só existe **um** socket por instância (todo
   `init()`/`shutdown()` passa por `disposeSocket()`, que remove o listener e dá
   `end()` no socket anterior), todo evento de socket antigo é descartado pela
   geração `gen`, `removeInstance(id, expected?)` só remove a instância que ele
   mesmo criou, e `stop`/`restart`/`init` sempre gravam `Session.qr = null`
   (um QR lido do banco é sempre suspeito de estar morto). `GET .../qr` cai para
   o banco quando a instância saiu do Map, e a tela mantém polling de 2 s enquanto
   houver pareamento.
10. O `MEGA_ADMIN` enxerga e provisiona instâncias de **qualquer** empresa por
    `GET/POST /api/mega-admin/instances` (autenticação `authenticateRequest` +
    `isMegaAdmin(context)`, listagem paginada com status ao vivo da instância em
    memória, criação com dono OWNER/ADMIN do tenant e cota aplicada), e a tela é
    `/dashboard/mega-admin/instances`. As demais rotas `/api/sessions` continuam
    escopadas ao tenant do chamador.
11. `MEGA_ADMIN` enxerga as telas globais apontadas pelo menu: `/dashboard/plans`
    (já via `isAdmin`) e `/dashboard/system-monitor` (guard da página e
    `GET /api/system/monitor` via `hasRole(role, "SUPERADMIN")`). O isolamento por
    tenant (`canAccessSession`, `getAccessibleSessions`) **não** muda: continua
    `=== "SUPERADMIN"`.
12. Nenhum item de menu pode apontar para rota inexistente (o menu mega-admin
    linkava para `mega-admin/plans` e `mega-admin/health`, ambas 404).
13. **Número da instância é fixo.** `Session.linkedPhone` (coluna própria, nunca
    `config`, que o `PATCH .../settings` substitui por inteiro) é registrado no
    primeiro sucesso de conexão/pareamento e não muda por digitação: `start`/`pair`
    com número diferente respondem `409 NUMBER_MISMATCH`. No `connection: "open"` o
    número vem de `socket.user.id` (só `@s.whatsapp.net`; `@lid` não é telefone e é
    ignorado) e, se divergir do registrado, a conexão é **recusada**
    (`rejectNumberMismatch`: status `NUMBER_MISMATCH`, `disposeSocket`, credenciais
    apagadas, evento com `linkedPhone`/`mismatchPhone`) e a tela abre o painel de
    suporte (`mailto:suporte@woohub.app`) com "Tentar com o número registrado". O
    painel de reconexão (`page.tsx`) é o único caminho para religar com o número
    certo; `loadSessions` preserva `NUMBER_MISMATCH` no reboot.

## Fases

1. Diagnóstico + segurança (Socket.IO, API keys, cripto de credenciais, SSRF, telemetria) — **entregue**
2. Empresas + migração + isolamento — **entregue** (inclui páginas SUPERADMIN)
3. Planos, cotas, assinaturas — **entregue**
4. Fila, agendamento, webhooks confiáveis — **entregue**
5. API pública versionada `/api/v1` + OpenAPI pt-BR — **entregue**
6. Frontend Woohub (pt-BR, fundo claro, laranja/branco/preto) — **entregue** (tradução parcial das telas legadas pendente)
7. Integração financeira (webhook assinado, dedup, checkout honesto) — **entregue** (ativação depende de gateway externo)
8. Docker/Compose/Swarm, documentação, testes, piloto — **entregue** (stack/migrações não executadas: Docker/MySQL ausentes no ambiente)

## Escopos de API key (iniciais)

`instances:read` `instances:write` `messages:read` `messages:send`
`contacts:read` `webhooks:read` `webhooks:write`

Chave de cliente nunca tem privilégio administrativo global.

## Perfis de empresa

`OWNER` `ADMIN` `STAFF` `BILLING` (+ `SUPERADMIN` global, auditado)

## Estados de assinatura

TRIALING ACTIVE PAST_DUE SUSPENDED CANCELED EXPIRED

## Estados de instância

STOPPED CONNECTING QR_REQUIRED SCAN_QR CONNECTED DISCONNECTED LOGGED_OUT ERROR
ZOMBIE NUMBER_MISMATCH

## Entregáveis

código, commits organizados, migrações versionadas, `.env.example`, Dockerfile revisado,
stack Compose, stack Swarm, OpenAPI, guia de instalação, guia de backup/restauração,
relatório de testes, pendências externas, plano de piloto.

Estado dos entregáveis (2026-10-05): todos escritos — `docs/DEPLOY.md`,
`docs/BACKUP_RECOVERY.md`, `docs/RETENTION.md`, `FINAL_REPORT.md` (pendências externas +
plano de piloto). Não validados neste ambiente: execução da stack e migração em MySQL.
