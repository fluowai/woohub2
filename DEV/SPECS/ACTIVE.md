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

STOPPED CONNECTING QR_REQUIRED CONNECTED DISCONNECTED LOGGED_OUT ERROR

## Entregáveis

código, commits organizados, migrações versionadas, `.env.example`, Dockerfile revisado,
stack Compose, stack Swarm, OpenAPI, guia de instalação, guia de backup/restauração,
relatório de testes, pendências externas, plano de piloto.

Estado dos entregáveis (2026-10-05): todos escritos — `docs/DEPLOY.md`,
`docs/BACKUP_RECOVERY.md`, `docs/RETENTION.md`, `FINAL_REPORT.md` (pendências externas +
plano de piloto). Não validados neste ambiente: execução da stack e migração em MySQL.
