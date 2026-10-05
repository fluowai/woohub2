# Backup e Restauração — Woohub (pt-BR)

Procedimentos operacionais de backup, restauração e custódia de segredos.
Complementa `docs/DEPLOY.md` (seções 9 e 10).

---

## 1. O que precisa ser copiado

| Ativo | Onde vive | Crítico | Observação |
|---|---|---|---|
| Banco MySQL (dados lógicos) | volume `mysql_data` | **sim** | tenants, usuários, sessões, mensagens, faturas, auditoria |
| Mídia enviada/recebida | volume `app_data` (`/app/data/media`) | sim | arquivos referenciados por URL interna |
| `.env` / ambiente da stack | host (fora do repositório) | **sim** | contém `AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_GATEWAY_SECRET_KEY`, `MYSQL_*`, `CREDENTIALS_ENCRYPTION_KEY` |
| Chave `CREDENTIALS_ENCRYPTION_KEY` | cofre de senhas | **irrecuperável** | sem ela, dados cifrados ficam permanentemente ilegíveis |
| Código/imagens | registry + Git | não (reconstruível) | `docker build -t woohub/app:<tag>` |
| Estado Baileys em disco (se houver) | volume do serviço app | sim | sessão autenticada do WhatsApp; se perder, refaça o QR |

> Regra: **nunca** versione `.env`, dumps ou chaves. Guarde-os fora do repositório.

---

## 2. Backup do banco (lógica, consistente)

```bash
# 1) Dump lógico (não bloquea a stack inteira)
docker compose exec -T db sh -c \
  'mysqldump --single-transaction --routines --triggers \
    -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > backup-$(date +%F-%H%M).sql

# 2) Mídia (arquivos novos desde o último backup)
docker run --rm -v woohub_app_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/media-$(date +%F).tgz -C /data .
```

Agendamento sugerido (no próprio host, via `cron`):

```cron
# dump diário 03:00, retenção local de 14 dias
0 3 * * * cd /caminho/woohub && ./scripts/backup.sh >> /var/log/woohub-backup.log 2>&1
```

(`scripts/backup.sh` é um wrapper opcional — crie-o com os comandos acima se for usar cron.)

---

## 3. Restauração (drill)

```bash
docker compose stop app                 # para escritas
docker compose exec -T db sh -c \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < backup-2026-10-05-0300.sql
docker compose up -d                     # app volta e passa pelo job de migração
curl -fsS http://localhost:3000/api/system/health   # deve responder 200
```

Mídia:

```bash
docker run --rm -v woohub_app_data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/media-2026-10-05.tgz -C /data
```

**Restauração de emergência do superadmin**: se todos os usuários forem
removidos, rode o job de migração (`docker service scale woo-woohub_migrate=1`
no Swarm; `docker compose run --rm app sh scripts/migrate.sh` no Compose) com
`ADMIN_EMAIL`/`ADMIN_PASSWORD` — ele cria o administrador **apenas** quando o
banco está vazio, nunca sobrescreve contas existentes.

---

## 4. Custódia de segredos

| Segredo | Onde fica | Rotacionar quando |
|---|---|---|
| `AUTH_SECRET` | `.env` do host / secrets do Swarm | anualmente ou ao suspeitar de vazamento |
| `CREDENTIALS_ENCRYPTION_KEY` | cofre de senhas (1Password/Bitwarden/Vault) | **não rotacione** sem plano de re-cifragem |
| `PAYMENT_WEBHOOK_SECRET` + `PAYMENT_GATEWAY_SECRET_KEY` | cofre + `.env` | a cada troca de credencial no gateway |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | `.env` | anualmente (exige ALTER USER + atualização da stack) |

- Chave de cofre nunca em chat, ticket, e-mail ou repositório.
- Ao rotacionar `AUTH_SECRET`, todas as sessões são invalidadas (esperado).
- Ao trocar `CREDENTIALS_ENCRYPTION_KEY`, decifre os registros antigos com a
  chave anterior e re-cifre — **não há rotina automatizada** para isso nesta
  entrega; trate como procedimento manual documentado antes de trocar.

---

## 5. Verificação periódica (checklist mensal)

1. `grep -c "INSERT INTO" backup.sql` > 0 (dump não vazio).
2. Restauração em ambiente de homologação (`docker compose -f ... up` com banco novo) — **drill real**, não apenas dump.
3. `/api/system/health` → `200`.
4. `npx prisma migrate status` → sem pendências.
5. Espaço em disco dos volumes `mysql_data` e `app_data` dentro do previsto.

> Esta máquina de entrega não tinha Docker/MySQL ativos: nenhum drill foi
> executado aqui. O primeiro drill é obrigatório antes de operar em produção
> (registrado em `DEV/VERIFY.md`).
