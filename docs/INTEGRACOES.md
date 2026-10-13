# Integrações WooHub

## n8n

A integração mais simples usa o nó **HTTP Request**:

1. Crie uma API key WooHub com os escopos necessários.
2. Use `https://seu-dominio/api/v1` como base URL.
3. Envie a chave no header `X-API-Key`.
4. Para mensagens recebidas, registre um webhook em `/webhooks`.
5. No n8n, use um nó **Webhook** para receber os eventos.

Operações recomendadas: listar instâncias, consultar status, enviar texto,
enviar mídia, consultar contatos e consultar consumo. Use `Idempotency-Key` em
operações de escrita que possam ser repetidas.

## Chatwoot

A integração pode ser montada com um webhook WooHub de entrada e a API do
Chatwoot de saída. O payload deve preservar o identificador do evento e o
telefone normalizado. Mensagens enviadas no Chatwoot devem chamar a rota de
mensagens da instância correspondente.

Antes de disponibilizar um conector gerenciado, validar: criação de conversa,
atualização de contato, anexos, respostas de agente, status de entrega,
reprocessamento e deduplicação.

## CRMs

Qualquer CRM com REST ou webhook pode ser integrado. O webhook WooHub envia
assinatura HMAC em `X-Webhook-Signature`, além de `X-Webhook-Id`,
`X-Webhook-Event` e `X-Webhook-Timestamp`. O receptor deve validar a assinatura,
responder rapidamente e processar o evento de forma idempotente.

## Boas práticas

- Nunca exponha API keys no navegador ou em workflows públicos.
- Crie uma chave por integração e conceda somente os escopos necessários.
- Configure retries no consumidor sem duplicar mensagens.
- Respeite consentimento, opt-out e limites de envio.
- Não use a API para spam ou mensagens não solicitadas.
