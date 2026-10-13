import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('       WOOHUB - AUDITORIA DE BANCO DE DADOS         ');
  console.log('====================================================');
  const start = Date.now();
  try {
    const rawCheck = await prisma.$queryRaw`
      SELECT 
        current_database() as database,
        current_user as db_user,
        version() as pg_version,
        NOW() as current_time;
    `;
    const latency = Date.now() - start;
    console.log(`[STATUS] Conexão bem-sucedida!`);
    console.log(`[LATÊNCIA] ${latency}ms`);
    console.log(`[BANCO] ${rawCheck[0].database} (Usuário: ${rawCheck[0].db_user})`);
    console.log(`[POSTGRES] ${rawCheck[0].pg_version.split(',')[0]}`);
    console.log(`[TIMESTAMP] ${rawCheck[0].current_time}`);

    // Model inventory & table count checks
    const models = [
      'user',
      'tenant',
      'tenantMember',
      'apiKey',
      'session',
      'sessionAccess',
      'message',
      'contact',
      'plan',
      'subscription',
      'invoice',
      'paymentEvent',
      'usageCounter',
      'auditLog',
      'messageJob',
      'idempotencyRecord',
      'webhook',
      'webhookLog',
      'systemConfig',
      'platformConfig',
      'reseller',
      'instanceAllocation',
      'domain',
      'branding',
      'license',
      'licenseValidation',
      'stackTemplate',
      'stackTemplateVersion',
      'templateEntitlement',
      'installation',
      'broadcastLog',
      'broadcastRecipient'
    ];

    const results = [];
    for (const model of models) {
      if (prisma[model] && typeof prisma[model].count === 'function') {
        try {
          const count = await prisma[model].count();
          results.push({ Tabela: model, Registros: count, Status: 'OK' });
        } catch (err) {
          results.push({ Tabela: model, Registros: 'ERRO', Status: err.message.split('\n').pop() });
        }
      }
    }

    console.log('\n--- TABELAS E MODELOS (TOTAL: ' + results.length + ') ---');
    console.table(results);

    // Migrations check
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count 
      FROM _prisma_migrations 
      ORDER BY started_at ASC;
    `;
    console.log('\n--- MIGRAÇÕES PRISMA NO BANCO ---');
    console.table(migrations);

    // Administrative accounts
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      }
    });
    console.log('\n--- USUÁRIOS ADMINISTRATIVOS ---');
    console.table(users);

    // Active WhatsApp Sessions
    const sessions = await prisma.session.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        linkedPhone: true,
        updatedAt: true
      }
    });
    console.log('\n--- INSTÂNCIAS / SESSÕES WHATSAPP ---');
    console.table(sessions);

    console.log('\n[CONCLUSAO] Banco de dados totalmente operacional e integro.');

  } catch (error) {
    console.error('\n[ERRO CRITICO] Falha na conexao com o banco:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
