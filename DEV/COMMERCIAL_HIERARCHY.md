# Hierarquia Comercial e White Label — Woohub

Este documento descreve a arquitetura, modelagem de banco de dados, matriz de permissões, controle de cotas concorrentes, isolamento white label e painéis implementados no Woohub.

---

## 1. Hierarquia de Quatro Níveis

### 1.1 `MEGA_ADMIN` — Proprietário Global da API
- **Papel:** Dono da plataforma e infraestrutura Woohub.
- **Capacidades:**
  - Gerenciar revendedores white label (`SUPER_ADMIN`): criação, edição de cotas, suspensão e cancelamento.
  - Vender instâncias diretamente criando clientes diretos (`ADMIN` com `tenant.resellerId = null`).
  - Gerenciar planos da plataforma, limites globais e catálogo global de domínios.
  - Monitorar instâncias Baileys conectadas, filas de mensagens, saúde da API e logs de auditoria globais.
  - Acesso auditado a dados operacionais (conversas privadas de clientes não são expostas no dashboard por padrão).
- **Painel:** `/dashboard/mega-admin` (Visão geral, Revendedores, Clientes diretos, Clientes dos revendedores, Domínios, Instâncias, Saúde, Auditoria).

### 1.2 `SUPER_ADMIN` — Revendedor White Label
- **Papel:** Operador de marca própria que revende conexões de WhatsApp como plataforma independente.
- **Capacidades:**
  - Personalizar identidade visual: nome comercial, logotipo, favicon, cores, contatos de suporte e links.
  - Configurar domínio próprio sob validação de DNS TXT (`_woohub-challenge.<hostname>`).
  - Criar empresas clientes (`ADMIN` com `tenant.resellerId = reseller.id`) respeitando cotas atômicas contratadas.
  - Criar planos e preços de revenda limitados aos recursos autorizados pelo Mega Admin.
  - Ativar e suspender clientes próprios; visualizar faturas e consumo da própria operação.
- **Proibições:**
  - Não pode criar outros `SUPER_ADMIN` nem `MEGA_ADMIN`.
  - Não pode acessar outros revendedores ou clientes de terceiros.
  - Não pode alterar configurações globais da API nem exceder a cota contratada.
- **Painel:** `/dashboard/super-admin` (Visão geral, Meus clientes, Instâncias, Planos de revenda, Assinaturas, Minha marca, Meu domínio, Cotas, Minha assinatura).

### 1.3 `ADMIN` — Cliente Comprador de Instâncias
- **Papel:** Responsável pela empresa compradora de instâncias (direta ou via revendedor).
- **Capacidades:**
  - Provisionar instâncias de WhatsApp dentro da cota contratada (`tenant.maxInstances`).
  - Conectar números via QR Code ou pareamento; gerenciar webhooks e chaves de API com hash e escopos.
  - Convidar membros operacionais (`USER`) e gerenciar atendimentos, contatos e automações.
- **Proibições:**
  - Não pode revender contas nem acessar dados de outras empresas.
  - Não pode criar `ADMIN`, `SUPER_ADMIN` ou `MEGA_ADMIN`.
- **Painel:** `/dashboard` (Minhas instâncias, Atendimento, Contatos, Automações, Chaves de API, Webhooks, Equipe, Consumo).

### 1.4 `USER` — Usuário Operacional
- **Papel:** Atendente / operador de atendimento da empresa cliente.
- **Capacidades:**
  - Visualizar instâncias atribuídas em modo de consulta (`instances:read`).
  - Operar atendimento e envio de mensagens autorizadas (`messages:send`, `messages:read`, `contacts:read`).
- **Proibições Estritas (Bloqueio em UI e Backend):**
  - Proibido criar instâncias (`POST /api/sessions` retorna 403).
  - Proibido criar chaves de API (`POST /api/user/api-key` retorna 403).
  - Proibido criar webhooks (`POST /api/webhooks/[sessionId]` retorna 403).
  - Proibido criar respostas automáticas (`POST /api/autoreplies/[sessionId]` retorna 403).
  - Proibido criar agendamentos (`POST /api/scheduler/[sessionId]` retorna 403).
  - Proibido criar disparos em massa (`POST /api/messages/[sessionId]/broadcast` retorna 403).
- **Painel:** Interface limpa sem botões administrativos (`/dashboard/chat`, `/dashboard/sessions` em consulta, `/dashboard/contacts`).

---

## 2. Modelagem do Banco de Dados

### 2.1 Entidades Adicionadas
- `PlatformConfig`: Tabela singleton para configurações globais, nome base e limites da plataforma.
- `Reseller`: Registro da operação white label, dono (`ownerId`), cotas (`maxInstances`, `maxTenants`), status (`ACTIVE`, `SUSPENDED`, `CANCELED`).
- `InstanceAllocation`: Rastreamento atômico de instâncias alocadas por empresa dentro de um revendedor.
- `Domain`: Catálogo global de domínios com `hostname` normalizado, `type` (`PLATFORM` / `RESELLER`), token de desafio `verificationToken`, `status` (`PENDING_VERIFICATION`, `VERIFIED`, `ACTIVE`, `FAILED`, `SUSPENDED`) e instruções DNS.
- `Branding`: Identidade visual completa por revendedor (`name`, `logoUrl`, `faviconUrl`, `primaryColor`, `secondaryColor`, `supportEmail`, `supportPhone`, `websiteUrl`, `documentationName`).

### 2.2 Isolamento de Tenancy
- `Tenant.resellerId === null`: Cliente direto do Mega Admin.
- `Tenant.resellerId !== null`: Cliente vinculado a um Revendedor.
- Toda consulta operacional filtra `where: { tenantId }` ou `where: { resellerId }`. O backend nunca confia em IDs enviados pelo frontend.

---

## 3. Controle Atômico de Cotas e Concorrência

Para impedir que a soma de instâncias alocadas aos clientes exceda a capacidade do revendedor:
- Implementado em `src/lib/quotas/commercial.ts` via `allocateInstancesToTenant` executado em transação Prisma `$transaction` com nível de isolamento serializável/travamento de linha.
- Fórmula validada:
  $$\sum \text{allocatedInstances (outros clientes)} + \text{nova cota} \le \text{reseller.maxInstances}$$
- Instâncias desconectadas continuam ocupando sua vaga provisionada.
- Planos de revenda validam recursos autorizados (`validateResalePlanFeatures`): o revendedor não pode oferecer recursos que não foram habilitados pelo Mega Admin.

---

## 4. Efeitos de Suspensão de Revendedor

Quando um revendedor é colocado em `status: SUSPENDED`:
1. **Provisionamento:** Bloqueado via `canTenantProvisionInstance` (retorna `allowed: false`).
2. **API Keys de Clientes:** Rejeitadas com HTTP 403 `tenant_disabled` ("Reseller account is suspended").
3. **Fila de Mensagens (`MessageJob`):** O worker rejeita o envio de clientes de revendedor suspenso antes da chamada Baileys.
4. **Agendador (`scheduler.ts`):** O loop ignora mensagens de clientes com revendedor suspenso.
5. **Socket.IO:** Conexões de instâncias de revendedor suspenso são rejeitadas no handshake.
6. **Acesso Financeiro / Recuperação:** O painel de faturas e dados de contato permanecem acessíveis para regularização.

---

## 5. Controle de Domínios e White Label

1. **Normalização:** RFC 1123, remoção de esquemas (`http://`, `https://`), portas e caminhos.
2. **Bloqueio de Hosts Reservados:** `localhost`, `127.0.0.1`, IPs puros e nomes da plataforma raiz.
3. **Desafio DNS:**
   - Entrada TXT: `_woohub-challenge.<hostname>` com token `whb_chk_<hash>`.
   - Entrada CNAME: `<hostname>` apontando para `proxy.woohub.app`.
4. **Roteamento Seguro:** O host da requisição identifica a marca visual; a autenticação (JWT por domínio) determina o acesso. Não há compartilhamento de cookies entre domínios independentes.

---

## 6. Design Visual e Telas Entregues

Seguindo rigorosamente o conceito visual fornecido pelo usuário:
- **Paleta:** Fundo branco limpo (`bg-white`), bordas suaves em ardósia (`border-slate-200`), texto escuro (`text-slate-900`) e detalhes em laranja vibrante (`#ff5a00` / `#ea580c`).
- **Cards de Métricas:** Máximo de 3 cards por linha em desktop (`grid-cols-1 md:grid-cols-3 gap-4`).
- **Banner Superior por Papel:**
  - Mega Admin: `MEGA ADMIN • Dono da API | Controle total da plataforma, revendedores, clientes e domínios.`
  - Super Admin: `SUPER ADMIN • Revenda white label | Gerencia apenas seus próprios clientes, instâncias e marca.`
- **Páginas Implementadas:**
  - Mega Admin: `/dashboard/mega-admin` (Visão geral com split de revendedores e controle de domínios), `/dashboard/mega-admin/resellers`, `/dashboard/mega-admin/direct-clients`, `/dashboard/mega-admin/reseller-clients`, `/dashboard/mega-admin/domains`.
  - Super Admin: `/dashboard/super-admin` (Visão geral com clientes e cartão de marca/domínio), `/dashboard/super-admin/clients`, `/dashboard/super-admin/branding`, `/dashboard/super-admin/domain`, `/dashboard/super-admin/quotas`, `/dashboard/super-admin/my-subscription`.
  - Admin & User: Sessões com botões contextuais (usuário operacional sem botões administrativos ou de criação).

---

## 7. Status de Validação e Testes

- **Testes Unitários e de Aceitação (`vitest`):** 70 testes passando com 100% de sucesso (`tests/commercial-hierarchy.test.ts`, `tests/permissions.test.ts`, `tests/v1-access.test.ts`, `tests/payments.test.ts`, `tests/ssrf.test.ts`, `tests/validation.test.ts`).
- **Banco de Dados:** Migração versionada `20261006000000_commercial_hierarchy_and_whitelabel` aplicada no PostgreSQL.
- **Script de Migração de Dados:** Executado com sucesso (`scripts/migrate-commercial-hierarchy.ts`), preservando todas as contas e instâncias existentes.
