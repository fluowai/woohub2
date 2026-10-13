const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/**
 * Criação de usuários administrativos (executada pelo job de migração, não pelo boot da app).
 *
 * Roles suportados:
 *  - MEGA_ADMIN: dono do sistema (acima de tudo)
 *  - SUPERADMIN: whitelabel / admin global
 *
 * Regras:
 *  - usuário já existe  → nada é alterado (sem re-promoção automática);
 *                        use `--promote` apenas quando quiser reforçar o papel.
 *  - sem ADMIN_EMAIL e com usuário já no banco → sucesso silencioso (idempotente);
 *  - banco vazio e sem credenciais → erro explícito (não cria admin fraco).
 */
async function main() {
    const argv = process.argv.slice(2);
    const promote = argv.includes("--promote");
    const args = argv.filter((a) => a !== "--promote");
    const role = (args[0] || process.env.ADMIN_ROLE || "SUPERADMIN").trim().toUpperCase();
    const email = (args[1] || process.env.ADMIN_EMAIL || "").trim();
    const password = (args[2] || process.env.ADMIN_PASSWORD || "").trim();

    const validRoles = ["MEGA_ADMIN", "SUPERADMIN"];
    if (!validRoles.includes(role)) {
        console.error(`Role inválida: ${role}. Use: MEGA_ADMIN ou SUPERADMIN`);
        process.exit(1);
    }

    const userCount = await prisma.user.count();

    if (!email) {
        if (userCount > 0) {
            console.log("Usuarios ja existem; nada a criar (ADMIN_EMAIL nao informado).");
            return;
        }
        console.error(
            "Banco sem usuarios e ADMIN_EMAIL nao informado. " +
                "Informe: node scripts/setup-admin.js <role> <email> <senha>"
        );
        process.exit(1);
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        if (promote && existing.role !== role) {
            await prisma.user.update({ where: { email }, data: { role } });
            console.log(`Usuario ${email} promovido a ${role} (--promote).`);
        } else {
            console.log(`Usuario ${email} ja existe; nenhuma alteracao feita.`);
        }
        return;
    }

    if (!password) {
        console.error(`Usuario ${email} nao existe e ADMIN_PASSWORD nao informado. Nada foi criado.`);
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.create({
        data: {
            email,
            name: role === "MEGA_ADMIN" ? "Mega Admin" : "Super Admin",
            password: hashedPassword,
            role,
        },
    });
    console.log(`${role} ${email} criado.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
