# 🗄️ Guia de Configuração do Banco de Dados

Este guia ajuda a configurar o banco de dados do **Woohub**. O projeto usa
**Prisma ORM** com **PostgreSQL** (migrations em `prisma/migrations`).

## 1. Pré-requisitos

Você precisa de um servidor PostgreSQL rodando.

-   **PM2 (recomendado)**: PostgreSQL gerenciado externamente; configure `DATABASE_URL` no `.env` e gerencie a aplicação com PM2.
-   **Produção**: use um serviço gerenciado (Supabase, Neon, AWS RDS) com `sslmode=require`.
-   **Desenvolvimento local**: PostgreSQL local (ex.: `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`).

> **Atenção**: o `docker-compose.yml` **não** inclui um container de banco —
> `DATABASE_URL` sempre aponta para uma instância externa.

## 2. Configuração

Edite o `.env` e defina `DATABASE_URL`:

```env
DATABASE_URL="postgresql://user:pass@db-host:5432/wa_akg?schema=public&sslmode=require"
```

Copie as variáveis de exemplo se ainda não o fez:

```bash
cp .env.example .env
```

Preencha ao mínimo: `AUTH_SECRET`, `DATABASE_URL`, `BASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## 3. Inicialização

Comandos prontos no `package.json`:

### Sincronizar schema

Cria/atualiza as tabelas a partir do schema:

```bash
npm run db:push
```

### Aplicar migrations (produção)

No Docker, a stack executa o job único `scripts/migrate.sh` antes de subir a
aplicação (`depends_on: service_completed_successfully`). Fora do Docker:

```bash
npx prisma migrate deploy
```

### Reset (cuidado!)

Apaga todo o conteúdo do banco:

```bash
npx prisma migrate reset
```

## 4. Criando um usuário administrador

Após configurar o banco, crie um usuário **SUPERADMIN** para acessar o painel:

```bash
npm run make-admin <email> <password>
```

Exemplo:

```bash
npm run make-admin admin@example.com password123
```

-   Se o usuário **não existir**, será criado com papel `SUPERADMIN`.
-   Se o usuário **já existir**, será promovido a `SUPERADMIN` (senha ignorada).

## 5. Solução de problemas

-   **Erro de conexão**: verifique se o servidor PostgreSQL está acessível e se as credenciais em `.env` estão corretas (inclusive `sslmode=require` para serviços gerenciados).
-   **Erro do Prisma Client**: após mudar o schema, rode `npm run db:push` ou `npx prisma generate` para atualizar o cliente.
-   **Migrations pendentes**: `npx prisma migrate status` mostra o que falta aplicar.
