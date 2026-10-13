# 📂 Índice da documentação WooHub

Portal de documentação técnica e operacional da **WooHub**, em português do Brasil.

---

## 📘 Guias principais

| Documento | Objetivo |
| :--- | :--- |
| **[Documentação da API](./API_DOCUMENTATION.md)** | Referência REST dos endpoints públicos. |
| **[Guia do usuário](./USER_GUIDE.md)** | Instruções do painel e das instâncias. |
| **[Arquitetura](./PROJECT_DOCUMENTATION.md)** | Lógica, fluxos e banco de dados. |
| **[Configuração do ambiente](./ENVIRONMENT_VARIABLES.md)** | Configuração segura do servidor. |

---

## 🛠️ Infraestrutura e manutenção

- **[Banco de dados](./DATABASE_SETUP.md)**: migrações e configuração do banco.
- **[Atualização](./UPDATE_GUIDE.md)**: atualização controlada da aplicação.
- **[Referência rápida](./API-QUICK-REFERENCE.md)**: exemplos cURL e formatos de identificador.

---

## 🚦 Primeiros passos pela API

1. **Autenticação**: gere uma chave no painel e envie `X-API-Key`.
2. **Instância**: crie uma instância em `/api/v1/instances` e leia o QR Code.
3. **Automação**: registre uma URL em `/api/v1/webhooks` para receber eventos.

> **Importante:** configure `AUTH_SECRET`, `DATABASE_URL` e a chave de criptografia
> antes de iniciar a WooHub.

---
<div align="center">
  **Versão**: 1.6.4 | **Status**: documentação WooHub
</div>
