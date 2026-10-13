# Guia Operacional — Deploy de Revenda White-Label no Portainer

Este guia descreve como uma **Revenda White-Label** sobe a stack da plataforma no seu próprio **Portainer**, e como funciona o **controle rigoroso de licença e bloqueio de download da imagem**.

---

## 1. Visão Geral da Arquitetura de Proteção

O sistema opera com **três camadas de segurança complementares**:

```
[Portainer da Revenda]
       │
       ├─► 1. Tenta baixar a imagem (docker pull)
       │      └─► GitHub Container Registry (ghcr.io privado)
       │          • Token Ativo   ──► Download liberado (200 OK)
       │          • Token Inativo ──► Bloqueio de download (401/403 Denied)
       │
       ├─► 2. Tenta obter a Stack (docker-compose.yml / Portainer URL)
       │      └─► GET /api/license/portainer-stack?key=WOHUB-...
       │          • Licença Ativa no Mega Admin ──► Entrega o YAML
       │          • Licença Inválida/Suspensa   ──► Bloqueio 403 Forbidden
       │
       └─► 3. Execução dos Contêineres (Entrypoint + Phone-Home)
              └─► Validação online no boot contra /api/license/verify
                  • Se a licença for suspensa ou revogada pelo Mega Admin,
                    o contêiner sai com código 1 (status Exited 1 no Portainer).
```

---

## 2. Passo a Passo para o Mega Admin (Dono da Plataforma)

### Passo 2.1: Gerar a Licença da Revenda
1. Acesse o painel em `/dashboard/mega-admin/licenses`.
2. Clique em **"Nova Licença"**:
   - **Tipo:** `RESELLER`
   - **Empresa / Emitida Para:** Nome da revenda (ex: `Revenda ZapPro`)
   - **Email:** Contato do revendedor
   - **Cotas:** Defina o limite de instâncias e empresas clientes contratadas.
   - **Expiração:** Data limite da assinatura (ou renovação mensal).
3. Na tabela de licenças, clique no botão **"Portainer"** na linha da revenda.
4. Você terá:
   - **Link Direto da Stack:** `https://sua-api.com/api/license/portainer-stack?key=WOHUB-...`
   - **Link de Verificação:** `https://sua-api.com/api/license/check?key=WOHUB-...`

### Passo 2.2: Gerar o Token de Leitura do GitHub (`read:packages`)
1. No seu GitHub (onde a imagem privada `ghcr.io/SEU_USUARIO/woohub-app` está hospedada):
   - Vá em **Settings > Developer Settings > Personal access tokens > Fine-grained tokens** (ou Tokens Classic).
   - Nome: `revenda-zappro`
   - Escopo: apenas permissão de **leitura** de pacotes (`read:packages`).
   - Validade: Igual ao período do contrato da revenda.
2. Envie para a revenda:
   - O **Link da Stack**.
   - O **Token de Acesso do Registry**.
   - A **Chave de Licença** (`LICENSE_KEY`).

---

## 3. Passo a Passo para a Revenda (No Portainer Próprio)

### Passo 3.1: Adicionar o Registry Privado no Portainer
1. No Portainer da revenda, vá em **Registries > Add Registry**.
2. Selecione **Custom Registry**:
   - **Name:** `Woohub Packages` (ou o nome da sua marca)
   - **Registry URL:** `ghcr.io`
   - **Authentication:** Marque como ativado (`Yes`)
   - **Username:** O usuário do GitHub do fornecedor (ou email autorizado)
   - **Password / Token:** O token recebido com a licença
3. Clique em **Save**.

### Passo 3.2: Criar e Subir a Stack
1. No Portainer, vá em **Stacks > Add stack**.
2. **Name:** `woohub-whitelabel`
3. Em **Build method**:
   - **Opção A (Via Web Editor):** Cole o conteúdo do link da stack ou baixe em `https://sua-api.com/api/license/portainer-stack?key=WOHUB-...`
   - **Opção B (Via URL):** Use a URL direta da stack.
4. Preencha as variáveis no campo de ambiente do Portainer:
   - `DATABASE_URL`: Conexão PostgreSQL da revenda (ex: Supabase, RDS ou Postgres local).
   - `AUTH_SECRET`: Segredo de sessão de 32 caracteres.
   - `BASE_URL`: O domínio público onde a revenda rodará seu painel (ex: `https://painel.zappro.com.br`).
5. Clique em **Deploy the stack**.

---

## 4. O que acontece em caso de Cancelamento ou Inadimplência?

Quando o Mega Admin altera o status da licença para **SUSPENDED** ou **REVOKED** no painel:

1. **Tentativas de Download Bloqueadas:**
   - O token no GitHub é revogado.
   - Qualquer tentativa de dar `docker pull` em novas versões ou em novos servidores retorna **`401 Unauthorized`**. O Docker **não baixa a imagem**.
2. **Link da Stack Bloqueado:**
   - O endpoint `GET /api/license/portainer-stack?key=...` passa a responder **`403 Forbidden`**. O Portainer não consegue carregar nem a definição dos contêineres.
3. **Contêineres em Execução são Desligados:**
   - Mesmo que a máquina da revenda já tenha a imagem baixada em cache, o contêiner consulta o servidor mestre no boot (`POST /api/license/verify`).
   - Recebendo o status de suspensão, o script [`scripts/license-entrypoint.ts`](file:///c:/Users/paulo/OneDrive/Área de Trabalho/API W hatsapp/WA-AKG-main/scripts/license-entrypoint.ts) aborta imediatamente (`exit 1`).
   - No Portainer, os contêineres ficam vermelhos com status **`Exited (1)`**, impedindo qualquer operação.
