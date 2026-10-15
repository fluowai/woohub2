#!/usr/bin/env node
/**
 * Gerador do catalogo de planos Woohub (mensais + anuais).
 *
 * Base: tabela de precos publica da UazAPI (uazapi.dev) com -25% aplicado:
 *   2 dispositivos   R$ 38,00/mes  -> R$ 28,50/mes
 *   100 dispositivos R$ 138,00/mes -> R$ 103,50/mes
 *   300 dispositivos R$ 195,00/mes -> R$ 146,25/mes
 *
 * Anual = 12 x mensal com 10% de desconto adicional (ja sobre o -25%):
 *   2    -> R$ 307,80/ano  (equiv. R$ 25,65/mes)
 *   100  -> R$ 1.117,80/ano (equiv. R$ 93,15/mes)
 *   300  -> R$ 1.579,50/ano (equiv. R$ 131,63/mes)
 *
 * Uso:
 *   npm run plans:seed             (upsert idempotente)
 *   npm run plans:seed -- --dry-run (so mostra, nao grava)
 *
 * ATENCAO: reexecutar sobrescreve preco/limites/status dos codes geridos abaixo.
 * Alteracoes manuais devem ser feitas depois pelo painel (Planos Globais).
 */

try {
    process.loadEnvFile();
} catch {
    /* .env opcional (ex.: container com env injetado) */
}

const { PrismaClient } = await import("../src/generated/prisma/index.js");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const ANNUAL_DISCOUNT = 0.1; // 10% no anual, ja em cima do -25%

/** Preco mensal em cents apos -25% sobre a base UazAPI (fonte: precos publicos citados). */
const TIERS = [
    {
        instances: 2,
        baseCents: 3800,
        name: "Starter",
        description: "Ate 2 instancias de WhatsApp. Ideal para quem esta comecando.",
        maxUsers: 5,
        requestLimit: 30_000,
        sendLimit: 15_000,
        storageLimitMb: 1_024,
        retentionDays: 30,
        sort: 10,
    },
    {
        instances: 100,
        baseCents: 13_800,
        name: "Pro",
        description: "Ate 100 instancias de WhatsApp. Para operacoes em crescimento.",
        maxUsers: 25,
        requestLimit: 300_000,
        sendLimit: 150_000,
        storageLimitMb: 10_240,
        retentionDays: 60,
        sort: 20,
    },
    {
        instances: 300,
        baseCents: 19_500,
        name: "Enterprise",
        description: "Ate 300 instancias de WhatsApp. Escala maxima da plataforma.",
        maxUsers: 100,
        requestLimit: 2_000_000,
        sendLimit: 1_000_000,
        storageLimitMb: 51_200,
        retentionDays: 90,
        sort: 30,
    },
];

const slug = (s) =>
    s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

function buildCatalog() {
    const plans = [];
    for (const tier of TIERS) {
        const monthlyCents = Math.round(tier.baseCents * 0.75); // -25% vs UazAPI
        const yearlyCents = Math.round(monthlyCents * 12 * (1 - ANNUAL_DISCOUNT));
        const base = {
            name: tier.name,
            description: tier.description,
            commercialMode: "DIRECT",
            currency: "BRL",
            maxInstances: tier.instances,
            maxUsers: tier.maxUsers,
            requestLimit: tier.requestLimit,
            sendLimit: tier.sendLimit,
            storageLimitMb: tier.storageLimitMb,
            retentionDays: tier.retentionDays,
            maxInstallations: 0,
            trialDays: 0,
            gracePeriodDays: 0,
            status: "ACTIVE",
        };
        plans.push({
            ...base,
            code: `${slug(tier.name)}-${tier.instances}`,
            priceCents: monthlyCents,
            period: "MONTHLY",
            description: `${tier.description} Cobranca mensal.`,
            sort: tier.sort,
        });
        plans.push({
            ...base,
            code: `${slug(tier.name)}-${tier.instances}-yearly`,
            name: `${tier.name} Anual`,
            priceCents: yearlyCents,
            period: "YEARLY",
            description: `${tier.description} Cobranca anual com 10% de desconto sobre o mensal.`,
            sort: tier.sort + 1,
        });
    }
    return plans;
}

const brl = (cents) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function main() {
    const catalog = buildCatalog();

    console.log("====================================================");
    console.log("   WOOHUB - GERADOR DE PLANOS (mensal + anual)      ");
    console.log("====================================================");
    console.log(`Base: precos UazAPI com -25%; anual com ${ANNUAL_DISCOUNT * 100}% adicional`);
    console.log(DRY_RUN ? "MODO DRY-RUN (nada sera gravado)" : "");

    if (!DRY_RUN) {
        for (const plan of catalog) {
            const { code, ...data } = plan;
            await prisma.plan.upsert({
                where: { code },
                update: data,
                create: { code, ...data },
            });
        }
    }

    let prevInstances = null;
    for (const plan of catalog) {
        if (plan.maxInstances !== prevInstances) {
            console.log(`\n${plan.name} - ate ${plan.maxInstances} instancia(s):`);
            prevInstances = plan.maxInstances;
        }
        const label = plan.period === "YEARLY" ? "anual " : "mensal";
        const equiv = plan.period === "YEARLY" ? ` (equiv. ${brl(Math.round(plan.priceCents / 12))}/mes)` : "";
        console.log(
            `  ${DRY_RUN ? "[dry] " : ""}${label} ${plan.code.padEnd(24)} ${brl(plan.priceCents).padStart(12)}${equiv}`
        );
    }

    console.log("\nResumo de economia do anual vs 12x mensal:");
    for (let i = 0; i < catalog.length; i += 2) {
        const monthly = catalog[i];
        const yearly = catalog[i + 1];
        const full = monthly.priceCents * 12;
        console.log(
            `  ${monthly.name}: 12x ${brl(monthly.priceCents)} = ${brl(full)} -> anual ${brl(yearly.priceCents)} (-${((1 - yearly.priceCents / full) * 100).toFixed(1)}%)`
        );
    }

    if (!DRY_RUN) console.log("\nPlanos gravados/upsertados com sucesso.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
