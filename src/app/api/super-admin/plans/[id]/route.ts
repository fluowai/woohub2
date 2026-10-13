import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { validateResalePlanFeatures } from "@/lib/quotas/commercial";
import { recordAudit } from "@/lib/audit";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const plan = await prisma.plan.findUnique({ where: { id } });
        if (!plan || plan.resellerId !== resellerId) {
            return NextResponse.json({ status: false, message: "Plano não encontrado na sua revenda" }, { status: 404 });
        }

        const body = await request.json();
        const { name, priceCents, maxInstances, maxUsers, features, description, status } = body;

        if (features !== undefined) {
            const reseller = await prisma.reseller.findUnique({
                where: { id: resellerId },
                select: { features: true },
            });
            const check = validateResalePlanFeatures(reseller?.features as any, features);
            if (!check.valid) {
                return NextResponse.json(
                    {
                        status: false,
                        message: `Recursos não autorizados pelo Mega Admin: ${check.forbiddenFeatures.join(", ")}`,
                    },
                    { status: 403 }
                );
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (priceCents !== undefined) updateData.priceCents = Number(priceCents);
        if (maxInstances !== undefined) updateData.maxInstances = Number(maxInstances);
        if (maxUsers !== undefined) updateData.maxUsers = Number(maxUsers);
        if (features !== undefined) updateData.features = features;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status;

        const updated = await prisma.plan.update({
            where: { id },
            data: updateData,
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.plan_update",
            resource: "Plan",
            resourceId: id,
            metadata: updateData,
        });

        return NextResponse.json({ status: true, message: "Plano atualizado com sucesso", data: updated });
    } catch (error: any) {
        console.error("Error updating resale plan:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao atualizar plano" }, { status: 400 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const plan = await prisma.plan.findUnique({
            where: { id },
            include: { _count: { select: { subscriptions: true } } },
        });

        if (!plan || plan.resellerId !== resellerId) {
            return NextResponse.json({ status: false, message: "Plano não encontrado na sua revenda" }, { status: 404 });
        }

        if (plan._count.subscriptions > 0) {
            // Archive instead of delete to preserve active client history
            await prisma.plan.update({
                where: { id },
                data: { status: "ARCHIVED" },
            });
            return NextResponse.json({ status: true, message: "Plano possui assinaturas ativas e foi arquivado." });
        }

        await prisma.plan.delete({ where: { id } });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.plan_delete",
            resource: "Plan",
            resourceId: id,
            metadata: { name: plan.name, resellerId },
        });

        return NextResponse.json({ status: true, message: "Plano excluído com sucesso" });
    } catch (error: any) {
        console.error("Error deleting resale plan:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao excluir plano" }, { status: 400 });
    }
}
