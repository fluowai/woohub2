# Política de Retenção de Dados — Woohub (pt-BR)

Define quanto tempo cada classe de dado é mantida e **o que já é aplicado por
código** versus **o que depende de rotina operacional manual**. Nada aqui
promete expurgo automático que não exista.

---

## 1. Resumo

| Classe de dado | Retenção recomendada | Aplicação atual | Onde |
|---|---|---|---|
| Logs de entrega de webhook | 30 dias | **automática (código)** | `WEBHOOK_LOG_RETENTION_DAYS` (padrão 30) em `src/lib/webhook.ts` |
| Logs de contêiner (stdout) | 10 MB × 5 arquivos | **automática (Docker)** | `logging` em `docker-compose.yml` / `docker-stack.yml` |
| Mensagens e contatos | igual ao `Plan.retentionDays` do plano | **contratual, expurgo manual** | ver §3 |
| Mídia em `data/media` | mesmo período das mensagens | **manual** | ver §3 |
| Auditoria (`AuditLog`) | 24 meses (mín. legal recomendado) | **sem expurgo** (append-only) | manual, se necessário |
| Eventos de pagamento (`PaymentEvent`) | 24 meses (contestado/reembolso) | **sem expurgo** | manual |
| Faturas (`Invoice`) | 5 anos (obrigação fiscal) | **sem expurgo** | manual |
| Jobs da fila (`MessageJob`) | 30 dias (histórico) | **manual** | ver §3 |
| Backup `.sql` local | 14 dias | rotina do operador | `docs/BACKUP_RECOVERY.md` |
| Sessão Baileys em disco | enquanto a instância estiver em uso | automática (estado da sessão) | volume do app |

---

## 2. Regras já aplicadas por código

1. **Logs de webhook**: `cleanupOldLogs()` apaga registros com mais de
   `WEBHOOK_LOG_RETENTION_DAYS` dias (mínimo 1) após cada entrega.
2. **Rotação de logs de contêiner**: `json-file` com `max-size: 10m`,
   `max-file: 5` em todos os serviços — limita disco mesmo com crash-loop.
3. **Retenção por plano**: `Plan.retentionDays` entra na quota exibida e
   contratada (`src/lib/quota.ts`), ou seja, é o valor que o cliente vê como
   limite do plano.

## 3. O que ainda é manual (declarado como pendência)

Não existe nesta entrega job automático de expurgo de mensagens, mídia,
auditoria ou jobs da fila. Enquanto isso, a operação deve agendar:

```sql
-- Exemplo: mensagens e mídia de empresas fora do plano (executar com cuidado em janela de manutenção)
-- 1) identificar o corte por empresa usando o retentionDays vigente da assinatura
-- 2) exportar antes de apagar (backup lógico) e registrar o lote na auditoria
-- 3) apagar em lotes pequenos para não gerar lock longo
DELETE FROM Message    WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 5000;
DELETE FROM MessageJob WHERE createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 5000;
```

Mídia órfã (arquivos em `data/media` sem referência em `Message`) deve ser
removida com verificação prévia de existência de registro — não há rotina
pronta nesta entrega.

---

## 4. Diretrizes de minimização

- Nunca copie dados de produção para homologação sem anonimização.
- Expurgo não remove backups já gerados: mantenha a política de 14 dias para
  dumps e trate o backup como dado sensível (mesmo cofre/chaves).
- Ao encerrar um tenant (`Tenant.status = CLOSED`), agende o expurgo completo
  dos dados do tenant (mensagens, mídia, membros) após a retenção fiscal
  aplicável a faturas.
- Qualquer expurgo manual deve ser auditado (`AuditLog`, ação `retention.purge`
  com metadata do lote) para rastreabilidade.

---

## 5. Limitação desta entrega

Os itens da §3 são **procedimentos manuais**; automatizá-los (cron + SQL com
lotes + auditoria) está fora do escopo desta entrega e deve entrar no backlog
antes do piloto com dados reais de clientes.
