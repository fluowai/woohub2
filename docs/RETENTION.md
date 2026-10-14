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
| Jobs da fila terminais (`MessageJob`) | 30 dias (histórico) | **automática (código)** | `JOB_RETENTION_DAYS` (padrão 30) em `src/lib/retention.ts` |
| Mensagens e contatos | igual ao `Plan.retentionDays` do plano | **cap global automático** (opcional) + contratual | `MESSAGE_RETENTION_DAYS` (padrão 0 = off); ver §3 |
| Mídia em `data/media` | mesmo período das mensagens | **manual** | ver §3 |
| Auditoria (`AuditLog`) | 24 meses (mín. legal recomendado) | **sem expurgo** (append-only) | manual, se necessário |
| Eventos de pagamento (`PaymentEvent`) | 24 meses (contestado/reembolso) | **sem expurgo** | manual |
| Faturas (`Invoice`) | 5 anos (obrigação fiscal) | **sem expurgo** | manual |
| Backup `.dump` local | 14 dias | rotina do operador (`scripts/backup.sh`) | `docs/BACKUP_RECOVERY.md` |
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
4. **Expurgo diário de jobs terminais**: `runRetentionPurge()` (`src/lib/retention.ts`)
   apaga `MessageJob` com status `SUCCEEDED`/`FAILED`/`CANCELED`/`DEAD` com mais
   de `JOB_RETENTION_DAYS` dias (padrão 30), em lotes de 5000, auditado como
   `retention.purge`. Agendado no boot do servidor (primeira execução em 5 min).
5. **Cap global de mensagens** (opcional): `MESSAGE_RETENTION_DAYS > 0` ativa
   expurgo de `Message` mais antiga que N dias. **Padrão 0 = desabilitado** —
   só ligue se aceitar a perda do histórico.

## 3. O que ainda é manual

- **Mídia órfã** em `data/media` (arquivos sem referência em `Message`):
  não há rotina pronta; execute com verificação prévia em janela de manutenção.
- **Expurgo por tenant/contrato** (`Plan.retentionDays` individual): o cap
  global acima é o teto de segurança; o expurgo fino por plano continua manual.
- **Auditoria / pagamento / faturas**: sem expurgo automático (por design —
  obrigação fiscal e trilha de conformidade).

```sql
-- Expurgo fino por plano (executar com cuidado em janela de manutenção)
-- 1) identificar o corte por empresa usando o retentionDays vigente da assinatura
-- 2) exportar antes de apagar (backup lógico) e registrar o lote na auditoria
-- 3) apagar em lotes pequenos para não gerar lock longo
DELETE FROM Message    WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 5000;
```

## 4. Diretrizes de minimização

- Nunca copie dados de produção para homologação sem anonimização.
- Expurgo não remove backups já gerados: mantenha a política de 14 dias para
  dumps e trate o backup como dado sensível (mesmo cofre/chaves).
- Ao encerrar um tenant (`Tenant.status = CLOSED`), agende o expurgo completo
  dos dados do tenant (mensagens, mídia, membros) após a retenção fiscal
  aplicável a faturas.
- Qualquer expurgo (automático ou manual) é auditado (`AuditLog`, ação
  `retention.purge`) para rastreabilidade.

---

## 5. Limitação desta entrega

O expurgo de jobs terminais e o cap global de mensagens são **automáticos**
(§2.4–2.5). Mídia órfã e expurgo fino por contrato permanecem **procedimentos
manuais** (§3) e devem estar no runbook do operador antes do piloto com dados
reais de clientes.
