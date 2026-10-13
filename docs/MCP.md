# MCP WooHub

O servidor MCP permite que clientes compatíveis com o Model Context Protocol
consultem e operem a API pública da WooHub usando uma API key com escopos mínimos.

## Configuração

```json
{
  "mcpServers": {
    "woohub": {
      "command": "node",
      "args": ["scripts/woohub-mcp.mjs"],
      "env": {
        "WOOHUB_API_URL": "https://api.woohub.app",
        "WOOHUB_API_KEY": "sua_chave_woohub"
      }
    }
  }
}
```

Nunca coloque a API key em repositórios, prompts, logs ou arquivos compartilhados.
Use uma chave exclusiva, com os escopos necessários para a automação.

## Ferramentas

O servidor oferece `listar_instancias`, `consultar_instancia`, `criar_instancia`,
`conectar_instancia`, `desconectar_instancia`, `obter_qr_code`, `enviar_texto` e
`consultar_uso`. A autorização, o isolamento por empresa, as cotas e a auditoria
continuam sendo aplicados pela API WooHub.

O MCP não remove as limitações da API não oficial. O uso deve respeitar as regras
do WhatsApp, o consentimento dos destinatários e a política de uso aceitável da
WooHub.
