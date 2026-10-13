import { prisma } from "../src/lib/prisma";

/** Remove somente os dois registros de demonstração identificados no painel. */
async function main() {
    const targets = await prisma.reseller.findMany({
        where: {
            OR: [
                { name: { in: ["Agência Alfa", "Conecta Digital"] } },
                { domains: { some: { hostname: { in: ["api.agencia-alfa.com.br", "api.conecta-digital.com.br"] } } } },
            ],
        },
        select: { id: true, name: true, ownerId: true },
    });
    if (!targets.length) {
        console.log("Nenhum revendedor de demonstração encontrado.");
        return;
    }
    for (const target of targets) {
        await prisma.reseller.delete({ where: { id: target.id } });
        const remaining = await prisma.reseller.count({ where: { ownerId: target.ownerId } });
        if (remaining === 0) {
            const user = await prisma.user.findUnique({ where: { id: target.ownerId }, select: { email: true, role: true } });
            if (user && user.role === "SUPER_ADMIN" && /@(example\.com|suaempresa\.com)$/i.test(user.email)) {
                await prisma.user.delete({ where: { id: target.ownerId } });
            }
        }
        console.log(`Removido revendedor de demonstração: ${target.name}`);
    }
}

main().catch((error) => { console.error("Falha ao remover demonstrações:", error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
