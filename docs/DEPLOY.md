# Guia de Deploy — Woohub (pt-BR)

Este documento é a fonte de verdade operacional para subir a plataforma Woohub.
Ele cobre: pré-requisitos, construção de imagem, Compose (servidor único),
Swarm (Portainer), job de migração, integração com proxy reverso, diferenças
entre modelos, verificação de saúde, rollback e limitações conhecidas.

> **Escopo desta entrega (MVP)**
> - Banco PostgreSQL externo (Supabase) preservado; uma única réplica da aplicação.
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
| PostgreSQL | 14+ | instância **externa** (Supabase/Neon/RDS) acessível via `DATABASE_URL` |
| — | — | Swarm necessário **apenas** para `docker-stack.yml` |

Imagens base fixadas (sem `latest`):

- `node:22.17.1-alpine` (builder e runner)
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
| `LICENSE_KEY` | **sim** | Compose/Stack abortam com erro (`:?`) — no Portainer os serviços nem são criados |
| `LICENSE_PUBLIC_KEY` | sim se `LICENSE_KEY` for `WOHUB1.*` | gate sai com `1`: serviço `Failed` / container `Exited (1)` |
| `AUTH_SECRET` | sim | Compose/Stack abortam com erro (`:?`) |
| `DATABASE_URL` | sim | Compose/Stack abortam com erro (`:?`); banco externo PostgreSQL |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | na 1ª execução | o job de migração falha se o banco estiver vazio |
| `BASE_URL` / `NEXTAUTH_URL` | sim em produção | links e webhook da sessão apontam para lugar errado |
| `PAYMENT_GATEWAY*` | não | checkout responde `503 gateway_not_configured` (comportamento esperado) |

Nunca versione valores reais. Ver `SECURITY.md`.

### 3.1 Gate de licença — como o container é impedido de subir

Duas camadas, ambas obrigatórias para o deploy:

| Camada | Onde | Sem licença |
|---|---|---|
| 1. Interpolação | `${LICENSE_KEY:?...}` em `docker-compose.yml` e `docker-stack.yml` | o `compose up` / `stack deploy` **falha antes de criar qualquer container** (Portainer devolve erro de interpolação) |
| 2. Porta de entrada | `scripts/license-entrypoint.ts` (ENTRYPOINT da imagem) | valida a licença e sai com **código 1** → container `Exited (1)` / serviço Swarm `Failed` (`0 de 1`), **nunca Running** |

Formatos de chave aceitos pelo gate:

- **`WOHUB1.<payload>.<assinatura>`** (recomendado) — Ed25519, verificação 100%
  **offline**, não usa o banco. Funciona no primeiro deploy de uma base vazia.
  Exige `LICENSE_PUBLIC_KEY` (SPKI base64 ou PEM) ou `scripts/license.pub`.
- **`WOHUB-XXXX-XXXX-XXXX-XXXX`** (legado) — validada na tabela `License` do
  banco; **falha fechada** se o registro não existir ou o banco estiver
  indisponível. Em base nova, use a chave assinada.

Emissão de chaves (somente no servidor do fornecedor — a chave privada nunca
vai para a base do cliente):

```bash
npx tsx scripts/license-sign.ts --genkey     # 1x: gera par Ed25519
npx tsx scripts/license-sign.ts --sign --priv "$LICENCA_PRIV_KEY" \
  --sub "Cliente X" --type PROFESSIONAL --days 365 --max-instances 3
```

Sintomas no Portainer quando a licença é inválida: serviço com `0 de 1`
réplicas, tarefas `Failed` após 3 tentativas, logs com o banner
`LICENCA INVALIDA / AUSENTE` e o motivo exato (expirada, revogada, assinatura
inválida, chave pública ausente…).

---

## 4. Docker Compose (servidor único — caminho padrão)

```bash
cp .env.example .env          # edite os valores obrigatórios
docker build -t woohub/app:1.6.4 .
docker compose up -d
docker compose ps             # migrate=exited(0), app=healthy
docker compose logs -f app
```

O que a stack `woo-woohub` (`docker-compose.yml`) faz:

1. `migrate` — serviço **one-shot** que roda `scripts/migrate.sh`
   (`prisma migrate deploy` + criação única de admin) contra o banco externo
   (`DATABASE_URL`) e termina com código 0.
2. `app` — só sobe depois de `migrate` concluído com sucesso; expõe
   `3000:3000`; healthcheck em `/api/system/health`.

> O banco **não** faz parte da stack: `DATABASE_URL` aponta para uma
> instância PostgreSQL externa (Supabase, `sslmode=require`).

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

O nome da stack é **`woo-woohub`**. Serviços:
`woo-woohub_migrate`, `woo-woohub_app` (o banco é externo).

### Licença no Portainer (obrigatória)

No formulário "App stack" do Portainer, preencha ao menos:

| Variável | Conteúdo |
|---|---|
| `LICENSE_KEY` | `WOHUB1.<payload>.<assinatura>` (recomendado) ou `WOHUB-XXXX-…` |
| `LICENSE_PUBLIC_KEY` | SPKI base64/PEM Ed25519 (só para chave `WOHUB1.*`) |
| `DATABASE_URL`, `AUTH_SECRET` | como em `.env.example` |

Sem `LICENSE_KEY` o **deploy falha na interpolação** e nenhum serviço é criado.
Com chave inválida, `woo-woohub_app` e `woo-woohub_migrate` sobem, o gate
aborta com código 1 e o Swarm marca a tarefa como **`Failed`** (`0 de 1`) após
3 tentativas — a porta 3000 nunca fica publicada. Confira com:

```bash
docker stack ps woo-woohub --no-trunc      # ERROR: LICENCA INVALIDA / AUSENTE
docker service logs woo-woohub_app | grep LICENSE
```

> `migrate` passa pelo mesmo gate. Em uma base **vazia**, use chave assinada
> (`WOHUB1.*`): a chave legada depende da tabela `License`, que só existe
> depois da primeira migração.

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
| volumes nomeados | locais ao projeto | globais ao cluster | mesmo nome (`app_data`) |

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

Critério mínimo de aceite do deploy: `migrate` terminou `0`, `app=healthy`,
`/api/system/health` retorna `200`.

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
# backup (banco externo PostgreSQL)
pg_dump --format=custom --no-owner "$DATABASE_URL" > backup-$(date +%F).dump
# restauração (stack parada para escrita)
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" backup-2026-10-05.dump
```

Detalhamento completo em `docs/BACKUP_RECOVERY.md`. Inclua no conjunto de
backup também: `app_data:/app/data` (mídia) e o `.env`
(lido fora do repositório). **A chave `CREDENTIALS_ENCRYPTION_KEY` é
irrecuperável**: guarde-a no gerenciador de senhas — sem ela, credenciais
armazenadas ficam ilegíveis.

---

## 11. Limitações desta entrega (declaradas)

- **Não validado neste ambiente**: Docker daemon indisponível nesta máquina e
  sem acesso a um PostgreSQL de teste → `docker compose config/up`, migrações
  reais e stack Swarm **não foram executados** aqui. Arquivos YAML foram
  validados sintaticamente e `tsc`/`vitest` passam.
- **Pendências externas**: credenciais do gateway de pagamento, DNS/TLS e
  Traefik do host. Sem gateway, checkout responde `503 gateway_not_configured`.
- **Fora do escopo MVP**: HA/DR, multi-réplica com fila distribuída, WAF,
  proteção contra bloqueio de número, autoscaling.
