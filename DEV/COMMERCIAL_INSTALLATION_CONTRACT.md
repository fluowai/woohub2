# Contrato de arquitetura comercial — WooHub

## Separação obrigatória

O produto terá dois domínios operacionais:

1. **Central WooHub**: compradores, revendedores, licenças, instalações,
   planos, releases e auditoria comercial. Não recebe mensagens, contatos,
   números, mídias, QR Codes, credenciais Baileys ou segredos de integrações.
2. **Instalação do cliente**: painel, API, banco, WhatsApp, mídia, automações e
   dados operacionais. Inicia comunicação HTTPS de saída com a central; a
   central não usa Docker socket, SSH, Portainer ou comandos remotos.

Instalação não é instância. Instalação é uma implantação da stack; instância é
uma conexão WhatsApp dentro dela.

## Papéis

- `MEGA_ADMIN`: somente na central; administra compradores, revendas, licenças,
  instalações e releases.
- `SUPER_ADMIN`: somente no contexto de uma instalação white-label; administra
  sua marca, clientes locais, planos locais e capacidade licenciada.
- `ADMIN`: administra a própria empresa e suas instâncias dentro da cota.
- `USER`: opera apenas os recursos atribuídos.

O `SUPER_ADMIN` local não pode criar Mega Admin nem outra revenda.

## Licenciamento

A licença usa documento assinado assimetricamente. A chave privada fica apenas
na central. A instalação mantém uma identidade própria persistente, uma cópia
da licença assinada e uma autorização local renovável. A autorização local é
temporária e não deve ser renovada a cada mensagem.

A ativação e renovação devem ser idempotentes, limitar tentativas, usar
proteção contra replay e registrar apenas metadados mínimos. A instalação não
envia conteúdo operacional à central.

O vencimento comercial e o prazo da autorização local são conceitos distintos.
Expiração não apaga dados ou credenciais: mantém login, tela de licença,
renovação, exportação e backup. A política pode bloquear novos envios,
instâncias, clientes e automações pagas, sempre também no worker e scheduler.

## Stack white-label

O painel white-label deve gerar uma stack pronta para o domínio informado,
contendo licença, chave pública, limites e branding. O revendedor instala a
stack no próprio servidor. DNS, proxy, TLS e WebSocket continuam sendo
responsabilidade do operador e precisam de instruções explícitas.

Não colocar chave privada, segredo compartilhado global ou credenciais de outro
cliente na imagem. A imagem deve usar versões fixadas e volumes persistentes.

## Estado da implementação atual

Já existem parcialmente: revendedores, domínios, branding, licenças Ed25519,
gate de entrada, geração de stack Portainer, planos, cotas e auditoria.

Ainda requerem implementação/validação nesta arquitetura: entidades de
instalação e eventos de ativação, lease offline assinado, identidade persistente
da instalação, serviço único de licença usado por API/Socket/worker/scheduler,
canal próprio de releases, stacks separadas da central e testes de concorrência,
transferência, replay, revogação, backup e restauração.
