/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * scripts/migrate-tenancy.js
 *
 * Backfill da migração de multi-empresa (tenants) sobre uma base WA-AKG legada.
 *
 * O que ele faz (idempotente):
 *   1. Cria a empresa inicial (Tenant + TenantMember) para cada usuário sem empresa.
 *   2. Atribui Session.tenantId e Webhook.tenantId com base no dono de cada linha.
 *   3. Converte User.apiKey (plaintext legado, formato wag_...) em ApiKey.hasheada,
 *      preservando a mesma chave para o cliente não precisar trocar integração.
 *   4. Gera um relatório: sessões compartilhadas fora da empresa, webhooks que a
 *      proteção SSRF vai passar a bloquear, chaves legadas restantes.
 *
 * Uso:
 *   node scripts/migrate-tenancy.js            # dry-run (nenhuma escrita)
 *   node scripts/migrate-tenancy.js --apply    # aplica as mudanças
 *   node scripts/migrate-tenancy.js --apply --clear-plaintext
 *                                              # aplica e apaga os plaintexts de User.apiKey
 *
 * Pré-requisito: npx prisma migrate deploy (as colunas novas precisam existir).
 */

const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CLEAR_PLAINTEXT = process.argv.includes("--clear-plaintext");
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
const DEFAULT_SCOPES =
    "instances:read instances:write messages:read messages:send contacts:read webhooks:read webhooks:write";

const report = {
    tenantsCreated: 0,
    sessionsAssigned: 0,
    webhooksAssigned: 0,
    keysMigrated: 0,
    keysAlreadyPresent: 0,
    plaintextCleared: 0,
    sharedSessions: [],
    blockedWebhooks: [],
    orphanSessions: 0,
    orphanWebhooks: 0,
};

function randomPublicId() {
    const bytes = crypto.randomBytes(12);
    let out = "";
    for (let i = 0; i < 12; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    return out;
}

function slugFromUser(user) {
    const base = (user.email || user.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return `${base || "empresa"}-${user.id.slice(-6)}`;
}

function tenantRoleFor(platformRole) {
    return platformRole === "STAFF" ? "ADMIN" : "OWNER";
}

/** Resolves (and optionally creates) the tenant of a user. */
async function resolveTenant(user, tenantByUser) {
    if (tenantByUser.has(user.id)) return tenantByUser.get(user.id);

    const membership = await prisma.tenantMember.findFirst({ where: { userId: user.id } });
    if (membership) {
        const cached = { id: membership.tenantId, role: membership.role, created: false };
        tenantByUser.set(user.id, cached);
        return cached;
    }

    const slug = slugFromUser(user);
    const role = tenantRoleFor(user.role);
    let tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
        if (APPLY) {
            tenant = await prisma.tenant.create({
                data: { slug, name: user.name || user.email.split("@")[0] || "Empresa" },
            });
            report.tenantsCreated++;
        } else {
            tenant = { id: `__dryrun-${slug}`, slug, name: user.name || "Empresa" };
            report.tenantsCreated++;
        }
    }

    if (APPLY) {
        await prisma.tenantMember.upsert({
            where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
            update: {},
            create: { tenantId: tenant.id, userId: user.id, role },
        });
    }

    const entry = { id: tenant.id, role, created: true };
    tenantByUser.set(user.id, entry);
    return entry;
}

/** Hosts that Woohub's SSRF guard refuses to call. Static check, no DNS. */
function isBlockedWebhookUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return { blocked: true, reason: "URL inválida" };
    }
    if (!/^https?:$/.test(url.protocol)) return { blocked: true, reason: `protocolo ${url.protocol}` };

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
        return { blocked: true, reason: `host interno: ${host}` };
    }
    if (host === "::1" || host === "0.0.0.0") return { blocked: true, reason: `host interno: ${host}` };
    if (/^127\./.test(host)) return { blocked: true, reason: `loopback: ${host}` };
    if (/^10\./.test(host)) return { blocked: true, reason: `rede privada: ${host}` };
    if (/^192\.168\./.test(host)) return { blocked: true, reason: `rede privada: ${host}` };
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return { blocked: true, reason: `rede privada: ${host}` };
    if (/^169\.254\./.test(host)) return { blocked: true, reason: `link-local/metadata: ${host}` };
    return { blocked: false, reason: null };
}

async function migrateLegacyKeys(users, tenantByUser) {
    for (const user of users) {
        if (!user.apiKey) continue;

        const hash = crypto.createHash("sha256").update(user.apiKey, "utf8").digest("hex");
        const existing = await prisma.apiKey.findUnique({ where: { hash } });
        if (existing) {
            report.keysAlreadyPresent++;
            continue;
        }

        const tenant = await resolveTenant(user, tenantByUser);

        if (APPLY) {
            let created = null;
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
                try {
                    created = await prisma.apiKey.create({
                        data: {
                            tenantId: tenant.id,
                            publicId: randomPublicId(),
                            name: "Chave migrada (WA-AKG v1.x)",
                            hash,
                            scopes: DEFAULT_SCOPES,
                            createdById: user.id,
                        },
                    });
                } catch (error) {
                    if (error.code !== "P2002") throw error; // publicId collision, retry
                }
            }
            if (!created) throw new Error(`Não foi possível gerar publicId único para ${user.email}`);
        }
        report.keysMigrated++;
    }
}

async function main() {
    console.log(`\nWoohub — migração de tenancy (${APPLY ? "APPLY" : "DRY-RUN, nenhuma escrita"})\n`);

    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
        console.error("Falha ao conectar no banco. Rode `npx prisma migrate deploy` e tente de novo.");
        console.error(error.message);
        process.exit(1);
    }

    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, apiKey: true },
        orderBy: { createdAt: "asc" },
    });
    console.log(`Usuários: ${users.length}`);

    const tenantByUser = new Map();
    for (const user of users) await resolveTenant(user, tenantByUser);

    // 2. Sessions / Webhooks -> tenant do dono
    const sessions = await prisma.session.findMany({
        select: { id: true, name: true, userId: true, tenantId: true },
    });
    for (const session of sessions) {
        const tenant = tenantByUser.get(session.userId);
        if (!tenant) {
            report.orphanSessions++;
            continue;
        }
        if (session.tenantId === tenant.id) continue;
        if (APPLY) {
            await prisma.session.update({
                where: { id: session.id },
                data: { tenantId: tenant.id },
            });
        }
        report.sessionsAssigned++;
    }

    const webhooks = await prisma.webhook.findMany({
        select: { id: true, name: true, url: true, userId: true, tenantId: true },
    });
    for (const webhook of webhooks) {
        const tenant = tenantByUser.get(webhook.userId);
        if (!tenant) {
            report.orphanWebhooks++;
            continue;
        }
        if (webhook.tenantId !== tenant.id) {
            if (APPLY) {
                await prisma.webhook.update({
                    where: { id: webhook.id },
                    data: { tenantId: tenant.id },
                });
            }
            report.webhooksAssigned++;
        }

        const probe = isBlockedWebhookUrl(webhook.url);
        if (probe.blocked) {
            report.blockedWebhooks.push({ name: webhook.name, url: webhook.url, reason: probe.reason });
        }
    }

    // 3. Chaves legadas -> ApiKey com hash
    await migrateLegacyKeys(users, tenantByUser);

    // 4. Relatório: acessos compartilhados fora da empresa
    const accesses = await prisma.sessionAccess.findMany({
        select: {
            session: { select: { id: true, name: true, tenantId: true, userId: true } },
            user: { select: { id: true, email: true } },
        },
        take: 500,
    });
    for (const access of accesses) {
        const sessionTenant = access.session.tenantId ?? tenantByUser.get(access.session.userId)?.id;
        const granteeTenant = tenantByUser.get(access.user.id);
        if (!sessionTenant || !granteeTenant) continue;
        if (granteeTenant.id === sessionTenant) continue;
        report.sharedSessions.push({
            session: access.session.name,
            grantedTo: access.user.email,
        });
    }

    if (APPLY && CLEAR_PLAINTEXT) {
        for (const user of users) {
            if (!user.apiKey) continue;
            const hash = crypto.createHash("sha256").update(user.apiKey, "utf8").digest("hex");
            const migrated = await prisma.apiKey.findUnique({ where: { hash } });
            if (!migrated) continue;
            await prisma.user.update({ where: { id: user.id }, data: { apiKey: null } });
            report.plaintextCleared++;
        }
    }

    printReport();
}

function printReport() {
    const line = (label, value) => console.log(`  ${label.padEnd(46)} ${value}`);
    console.log("\nResumo:");
    line("Empresas criadas", report.tenantsCreated);
    line("Sessões com empresa atribuída", report.sessionsAssigned);
    line("Webhooks com empresa atribuída", report.webhooksAssigned);
    line("Chaves legadas migradas", report.keysMigrated);
    line("Chaves já migradas (puladas)", report.keysAlreadyPresent);
    line("Plaintexts apagados", report.plaintextCleared);
    line("Sessões sem usuário válido (órfãs)", report.orphanSessions);
    line("Webhooks sem usuário válido (órfãos)", report.orphanWebhooks);

    if (report.sharedSessions.length) {
        console.log("\nAtenção — sessões com acesso de usuários de outra empresa (revise antes do piloto):");
        for (const item of report.sharedSessions) {
            console.log(`  - "${item.session}" -> ${item.grantedTo}`);
        }
    }

    if (report.blockedWebhooks.length) {
        console.log("\nAtenção — webhooks que a proteção SSRF do Woohub vai recusar:");
        for (const item of report.blockedWebhooks) {
            console.log(`  - "${item.name}" ${item.url} (${item.reason})`);
        }
    }

    const usersWithPlaintext = report.keysMigrated + report.keysAlreadyPresent;
    if (usersWithPlaintext && !CLEAR_PLAINTEXT) {
        console.log(
            "\nChaves legadas continuam em User.apiKey (plaintext). Para remover após validar a migração:" +
                "\n  node scripts/migrate-tenancy.js --apply --clear-plaintext"
        );
    }

    console.log(APPLY ? "\nAplicado.\n" : "\nDry-run. Repita com --apply para gravar.\n");
}

main()
    .catch((error) => {
        console.error("\nFalha na migração:", error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
