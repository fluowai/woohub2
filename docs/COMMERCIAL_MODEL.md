# Modelo comercial implementado

## Modalidades

O schema agora distingue explicitamente `DIRECT`, `RESELLER` e `WHITE_LABEL` por meio de `CommercialMode`.

- `Tenant.commercialMode` representa a modalidade da organização.
- `Plan.commercialMode` representa a modalidade elegível do plano.
- `Reseller.commercialMode` representa a operação da revenda.
- `Subscription.commercialMode` congela a modalidade contratada no momento da contratação.
- `License.commercialMode` identifica a licença white label.

Perfil de acesso, modalidade comercial, plano, assinatura, instalação e licença permanecem conceitos separados.

## Planos e termos

`Plan` ganhou `maxInstallations`, `trialDays` e `gracePeriodDays`. `Subscription` registra os limites contratados (`contractedMaxInstances`, `contractedMaxUsers`, `contractedMaxInstallations`) e `termsVersion`.

Planos inativos não são aceitos em novas contratações. Planos `RESELLER` precisam pertencer a uma revenda; planos `DIRECT` e `WHITE_LABEL` não podem ser vinculados a uma revenda no endpoint de criação.

## Capacidade de instâncias

`src/lib/commercial.ts` centraliza a criação de sessão com:

- lock transacional PostgreSQL por tenant, revenda e instalação;
- isolamento `Serializable`;
- validação de assinatura ativa ou em tolerância;
- contagem de sessões persistidas, incluindo paradas, pendentes e desconectadas;
- rejeição de conta sem assinatura, eliminando o piloto ilimitado implícito.

A transação não abre conexão com o WhatsApp. A sessão é persistida primeiro e a conexão continua sendo responsabilidade do ciclo existente do Baileys.

## Migration

`prisma/migrations/20261008010000_commercial_modes_and_contract_terms/migration.sql` adiciona os campos e o enum de forma compatível, preservando os registros existentes com defaults conservadores.

Esta migration foi preparada, mas não foi aplicada em produção.

## Validação

- `prisma validate`: passou.
- `git diff --check`: somente avisos de linha em branco preexistentes/fora do código funcional.
- `prisma generate`: bloqueado por `EPERM` em `node_modules/@prisma/client` enquanto há processo Node ativo.
- `tsc --noEmit`: não concluiu no processo ativo; deve ser executado após liberar o cliente Prisma e regenerá-lo.

## Pendências explícitas

- Atualizar o Prisma Client em ambiente sem bloqueio de arquivo.
- Completar criação de pacotes da revenda e teto agregado da revenda.
- Implementar identidade, bootstrap, heartbeat e transferência de instalação white label.
- Adicionar testes de concorrência com PostgreSQL isolado.
- Aplicar a migration somente após backup e revisão do plano de atualização.
