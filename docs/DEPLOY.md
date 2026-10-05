# Guia de Deploy — Woohub (pt-BR)

Este documento é a fonte de verdade operacional para subir a plataforma Woohub.
Ele cobre: pré-requisitos, construção de imagem, Compose (servidor único),
Swarm (Portainer), job de migração, integração com proxy reverso, diferenças
entre modelos, verificação de saúde, rollback e limitações conhecidas.

> **Escopo desta entrega (MVP)**
> - MySQL preservado; uma única réplica da aplicação.
> - Nenhum deploy automático em produção: o deploy é um comando manual.
> - Nenhuma modificação em Traefik/Docker global compartilhado — apenas
>   parâmetros documentados.
> - Nenhuma afirmação de proteção contra bloqueio de números (risco do canal).

---

## 1. Pré-requisitos

| Item | Versão mínima | Observação |
|---|---|---|
| Docker Engine | 24+ | precisa estar em execução (Docker Desktop ou dockerd) |
| Docker Compose | v2+ | `docker compose version` |
| Node.js | 20.9+ (validado em 22.17.1) | só para build da imagem e dev local |
| MySQL | 8.0 | só se não usar o serviço `db` dos arquivos Docker |
| — | — | Swarm necessário **apenas** para `docker-stack.yml` |

Imagens base fixadas (sem `latest`):

- `node:22.17.1-alpine` (builder e runner)
- `mysql:8.0.46`
- `woohub/app:1.6.4` (aplicação, construída localmente e opcionalmente enviada a um registry)

---

## 2. Construir a imagem (fora do deploy)

O deploy **nunca** compila: ele só consome uma imagem já construída com tag fixa.

```bash
docker build -t woohub/app:1.6.4 .
# opcional, para deploy em outro host:
docker push SEU_REGISTRY/woohub/app:1.6.4
```

> Mantenha a tag em sincronia com o release (`WOHUB_TAG` no `.env` e no
> ambiente do Swarm). Nunca publique `latest`.

---

## 3. Configuração obrigatória (`.env`)

Copie `.env.example` → `.env` e preencha ao menos:

| Variável | Obrigatória | Efeito se ausente |
|---|---|---|
| `AUTH_SECRET` | sim | Compose/Stack abortam com erro (`:?`) |
| `MYSQL_ROOT_PASSWORD` | sim | Compose/Stack abortam com erro (`:?`) |
| `MYSQL_PASSWORD` | sim | Compose/Stack abortam com erro (`:?`) |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | na 1ª execução | o job de migração falha se o banco estiver vazio |
| `BASE_URL` / `NEXTAUTH_URL` | sim em produção | links e webhook da sessão apontam para lugar errado |
| `PAYMENT_GATEWAY*` | não | checkout responde `503 gateway_not_configured` (comportamento esperado) |

Nunca versione valores reais. Ver `SECURITY.md`.

---

## 4. Docker Compose (servidor único — caminho padrão)

```bash
cp .env.example .env          # edite os valores obrigatórios
docker build -t woohub/app:1.6.4 .
docker compose up -d
docker compose ps             # db=healthy, migrate=exited(0), app=healthy
docker compose logs -f app
```

O que a stack `woo-woohub` (`docker-compose.yml`) faz:

1. `db` — MySQL 8.0.46 **sem porta publicada**, apenas rede interna `backend`;
   healthcheck por `mysqladmin ping`; volume `mysql_data`.
2. `migrate` — serviço **one-shot** que roda `scripts/migrate.sh`
   (`prisma migrate deploy` + criação única de admin) e termina com código 0.
3. `app` — só sobe depois de `db` saudável **e** `migrate` concluído com
   sucesso; expõe `3000:3000`; healthcheck em `/api/system/health`.

### Atualização de release (Compose)

```bash
docker build -t woohub/app:1.6.5 .     # nova tag fixa
WOHUB_TAG=1.6.5 docker compose up -d   # migração roda de novo (job idempotente)
```

---

## 5. Docker Swarm / Portainer (produção distribuída)

```bash
# no host Swarm, com o .env exportado ou via `docker stack deploy --env-file .env`:
docker stack deploy -c docker-stack.yml woo-woohub
```

O nome da stack é **`woo-woohub`** (não `wa-akg`). Serviços:
`woo-woohub_db`, `woo-woohub_migrate`, `woo-woohub_app`.

### Job de migração no Swarm (serviço escalado sob demanda)

O serviço `migrate` nasce com `replicas: 0` (em repouso). O procedimento por
release é **sequencial, um release por vez**:

```bash
docker service scale woo-woohub_migrate=1
docker service logs -f woo-woohub_migrate   # aguarde "[migrate] concluido."
docker service scale woo-woohub_migrate=0
docker service update --image woohub/app:1.6.5 woo-woohub_app   # nova versão
```

Nunca execute dois jobs de migração em paralelo nem rode migração enquanto a
app antiga ainda recebe escritas concorrentes no schema.

### Réplicas

A stack fixa `replicas: 1` para o app. Isso é intencional no MVP: rate limit,
fila de envio e flusher de uso são de processo único. Aumentar réplicas exige
coordenação distribuída (item "Fora do escopo").

---

## 6. Integração com proxy reverso / Traefik (somente parâmetros)

Nenhum arquivo de Traefik/Docker global é modificado. Para publicar atrás do
Traefik já existente, aponte-o para o serviço/app e registre apenas os
parâmetros abaixo **no seu próprio stack**:

| Parâmetro | Valor |
|---|---|
| alvo | host `public`:3000 ou serviço `woo-woohub_app:3000` |
| healthcheck | `GET /api/system/health` → `200` pronto, `503` não pronto |
| timeout | ≥ 30 s (envios de mídia) |
| corpo máx. | ≥ 12 MB (upload de mídia/documento) |
| TLS | obrigatório na borda (cookie de sessão `HttpOnly; Secure; SameSite=Lax`) |
| cabeçalhos | a aplicação já responde `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS em produção |
| rate limit | a borda pode somar ao limite interno (`RATE_LIMIT_PER_MINUTE`, padrão 120/min) |
| webhook de pagamento | rota pública `POST /api/payments/webhook/*` — **não** exponha outras rotas `/api` |

Rotas públicas definidas na aplicação (sem autenticação de sessão):
`/api/v1/openapi.json`, `/api/system/health`, `/api/payments/webhook/*`.

---

## 7. Compose × Swarm — incompatibilidades documentadas

| Recurso | Compose | Swarm | O que a Woohub faz |
|---|---|---|---|
| `depends_on.condition: service_healthy` | suportado | **não suportado** | Compose: ordem automática. Swarm: aguarde o healthcheck / rode `migrate` manualmente |
| `depends_on.condition: service_completed_successfully` | suportado | **não suportado** | Swarm: serviço one-shot escalado sob demanda |
| `restart:` no serviço | suportado | **não** (usa `deploy.restart_policy`) | cada arquivo usa a sintaxe correta |
| `container_name` | suportado | **não** | só presente no Compose |
| `deploy.resources.limits` | honrado pelo Compose v2+ | nativo | ambos os arquivos declaram limites de CPU/memória |
| `logging` com rotação | suportado | suportado | `json-file`, 10 MB × 5 arquivos em ambos |
| `build:` no deploy | possível | **proibido na stack de produção** | build acontece antes, na seção 2 |
| escala horizontal | `replicas` no Compose v2 | `docker service scale` | MVP = 1 réplica em ambos |
| volumes nomeados | locais ao projeto | globais ao cluster | mesmos nomes (`mysql_data`, `app_data`) |

---

## 8. Verificação pós-deploy

```bash
# saúde (público)
curl -fsS http://localhost:3000/api/system/health
# => {"status":"ok","database":"up",...}   ou  503 {"status":"degraded","database":"down"}

# contrato da API v1 (público)
curl -fsS http://localhost:3000/api/v1/openapi.json | head -c 200

# migrações aplicadas
docker compose run --rm app npx prisma migrate status   # Compose
```

Critério mínimo de aceite do deploy: `db=healthy`, `migrate` terminou `0`,
`app=healthy`, `/api/system/health` retorna `200`.

---

## 9. Rollback

1. **Só imagem** (schema compatível): reimplante a tag anterior —
   Compose: `WOHUB_TAG=1.6.4 docker compose up -d`;
   Swarm: `docker service update --image woohub/app:1.6.4 woo-woohub_app`.
   Como as migrações são expansivas no MVP, não há rollback de schema.
2. **Schema alterado**: restaure o backup (seção 10) e aplique a tag anterior
   com `prisma migrate deploy`. Se a migração foi aplicada por engano, use
   `prisma migrate resolve --applied <hash>` apenas com instrução explícita.
3. Nada é promovido como "rollback automático" — é sempre um passo manual.

---

## 10. Backup e restauração (resumo operacional)

```bash
# backup
docker compose exec -T db sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > backup-$(date +%F).sql
# restauração (stack parada para escrita)
docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < backup-2026-10-05.sql
```

Inclua no conjunto de backup também: `app_data:/app/data` (mídia) e o `.env`
(lido fora do repositório). **A chave `CREDENTIALS_ENCRYPTION_KEY` é
irrecuperável**: guarde-a no gerenciador de senhas — sem ela, credenciais
armazenadas ficam ilegíveis.

---

## 11. Limitações desta entrega (declaradas)

- **Não validado neste ambiente**: Docker daemon indisponível nesta máquina e
  MySQL não instalado → `docker compose config/up`, migrações reais e stack
  Swarm **não foram executados** aqui. Arquivos YAML foram validados
  sintaticamente e `tsc`/`vitest` passam.
- **Pendências externas**: credenciais do gateway de pagamento, DNS/TLS e
  Traefik do host. Sem gateway, checkout responde `503 gateway_not_configured`.
- **Fora do escopo MVP**: HA/DR, multi-réplica com fila distribuída, WAF,
  proteção contra bloqueio de número, autoscaling.
