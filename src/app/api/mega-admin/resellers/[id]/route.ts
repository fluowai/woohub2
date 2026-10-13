import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";
import { recordAudit } from "@/lib/audit";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }
    const reseller = await prisma.reseller.findUnique({
        where: { id },
        include: {
            owner: { select: { id: true, name: true, email: true, createdAt: true } },
            branding: true,
            domains: true,
            tenants: {
                include: {
                    members: { include: { user: { select: { id: true, name: true, email: true } } } },
                    _count: { select: { sessions: true } },
                    subscriptions: { include: { plan: { select: { code: true, name: true } } }, take: 1 },
                },
                orderBy: { createdAt: "desc" },
            },
            _count: { select: { tenants: true, plans: true } },
        },
    });
    if (!reseller) return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 404 });
    await recordAudit({ actorType: "USER", actorLabel: authResult.context.email || "mega_admin", actorUserId: authResult.context.userId || undefined, action: "reseller.support_view", resource: "Reseller", resourceId: id, metadata: { mode: "read_only" } });
    return NextResponse.json({ status: true, data: reseller });
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const {
            name,
            status,
            maxInstances,
            maxTenants,
            maxUsers,
            features,
            customDomainAllowed,
            storageLimitMb,
            retentionDays,
            notes,
        } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (status !== undefined) updateData.status = status;
        if (maxInstances !== undefined) updateData.maxInstances = Number(maxInstances);
        if (maxTenants !== undefined) updateData.maxTenants = Number(maxTenants);
        if (maxUsers !== undefined) updateData.maxUsers = Number(maxUsers);
        if (features !== undefined) updateData.features = features;
        if (customDomainAllowed !== undefined) updateData.customDomainAllowed = Boolean(customDomainAllowed);
        if (storageLimitMb !== undefined) updateData.storageLimitMb = Number(storageLimitMb);
        if (retentionDays !== undefined) updateData.retentionDays = Number(retentionDays);
        if (notes !== undefined) updateData.notes = notes;

        const updated = await prisma.reseller.update({
            where: { id },
            data: updateData,
            include: { branding: true, owner: true },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.update",
            resource: "Reseller",
            resourceId: id,
            metadata: updateData,
        });

        return NextResponse.json({
            status: true,
            message: "Revendedor atualizado com sucesso",
            data: updated,
        });
    } catch (error: any) {
        console.error("Error updating reseller:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao atualizar revendedor" }, { status: 400 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const reseller = await prisma.reseller.findUnique({
            where: { id },
            include: {
                tenants: {
                    include: {
                        sessions: true,
                    },
                },
            },
        });

        if (!reseller) {
            return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 404 });
        }

        const totalSessions = reseller.tenants.reduce((sum, t) => sum + t.sessions.length, 0);
        if (totalSessions > 0) {
            // Soft-cancel instead of destructive delete to protect customer data
            await prisma.reseller.update({
                where: { id },
                data: { status: "CANCELED" },
            });
            return NextResponse.json({
                status: true,
                message: "Revendedor possui instâncias ativas associadas. Operação marcada como CANCELADA (soft delete seguro).",
            });
        }

        await prisma.reseller.delete({ where: { id } });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.delete",
            resource: "Reseller",
            resourceId: id,
            metadata: { name: reseller.name },
        });

        return NextResponse.json({
            status: true,
            message: "Revendedor removido com sucesso",
        });
    } catch (error: any) {
        console.error("Error deleting reseller:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao remover revendedor" }, { status: 400 });
    }
}
