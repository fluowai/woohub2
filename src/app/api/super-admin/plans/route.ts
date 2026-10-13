import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { validateResalePlanFeatures } from "@/lib/quotas/commercial";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const [plans, reseller] = await Promise.all([
            prisma.plan.findMany({
                where: { resellerId },
                orderBy: { sort: "asc" },
                include: {
                    _count: { select: { subscriptions: true } },
                },
            }),
            prisma.reseller.findUnique({
                where: { id: resellerId },
                select: { features: true },
            }),
        ]);

        return NextResponse.json({
            status: true,
            data: {
                plans,
                allowedFeatures: reseller?.features || {},
            },
        });
    } catch (error) {
        console.error("Error fetching resale plans:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar planos de revenda" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const body = await request.json();
        const {
            name,
            code,
            priceCents = 0,
            maxInstances = 1,
            maxUsers = 1,
            features = {},
            description,
        } = body;

        if (!name || !code) {
            return NextResponse.json({ status: false, message: "Nome e código do plano são obrigatórios" }, { status: 400 });
        }

        const reseller = await prisma.reseller.findUnique({
            where: { id: resellerId },
            select: { features: true },
        });

        // Enforce rule: Revendedor não pode oferecer recurso que não possui!
        const featureCheck = validateResalePlanFeatures(reseller?.features as any, features);
        if (!featureCheck.valid) {
            return NextResponse.json(
                {
                    status: false,
                    message: `Você não pode oferecer recursos que não foram liberados pelo Mega Admin: ${featureCheck.forbiddenFeatures.join(", ")}`,
                },
                { status: 403 }
            );
        }

        const scopedCode = `r_${resellerId.slice(-4)}_${code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;

        const existing = await prisma.plan.findUnique({ where: { code: scopedCode } });
        if (existing) {
            return NextResponse.json({ status: false, message: "Já existe um plano com este código" }, { status: 400 });
        }

        const plan = await prisma.plan.create({
            data: {
                name,
                code: scopedCode,
                resellerId,
                priceCents: Number(priceCents),
                currency: "BRL",
                period: "MONTHLY",
                maxInstances: Number(maxInstances),
                maxUsers: Number(maxUsers),
                features,
                description,
                status: "ACTIVE",
            },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.plan_create",
            resource: "Plan",
            resourceId: plan.id,
            metadata: { name, code: scopedCode, resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Plano de revenda criado com sucesso!",
            data: plan,
        });
    } catch (error: any) {
        console.error("Error creating resale plan:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao criar plano" }, { status: 400 });
    }
}
