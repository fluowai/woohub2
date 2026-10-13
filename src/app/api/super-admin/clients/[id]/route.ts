import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { allocateInstancesToTenant } from "@/lib/quotas/commercial";
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
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (!tenant || tenant.resellerId !== resellerId) {
            return NextResponse.json({ status: false, message: "Cliente não encontrado na sua revenda" }, { status: 404 });
        }

        const body = await request.json();
        const { name, status, maxInstances } = body;

        if (maxInstances !== undefined && Number(maxInstances) !== tenant.maxInstances) {
            await allocateInstancesToTenant({
                resellerId,
                tenantId: id,
                count: Number(maxInstances),
            });
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (status !== undefined) updateData.status = status;

        const updated = await prisma.tenant.update({
            where: { id },
            data: updateData,
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.client_update",
            resource: "Tenant",
            resourceId: id,
            metadata: { updateData, maxInstances, resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Cliente atualizado com sucesso",
            data: updated,
        });
    } catch (error: any) {
        console.error("Error updating client:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao atualizar cliente" }, { status: 400 });
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
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (!tenant || tenant.resellerId !== resellerId) {
            return NextResponse.json({ status: false, message: "Cliente não encontrado na sua revenda" }, { status: 404 });
        }

        // Suspend or mark as CLOSED rather than destructive delete
        await prisma.tenant.update({
            where: { id },
            data: { status: "CLOSED" },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.client_close",
            resource: "Tenant",
            resourceId: id,
            metadata: { resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Cliente encerrado com sucesso",
        });
    } catch (error: any) {
        console.error("Error deleting client:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao encerrar cliente" }, { status: 400 });
    }
}
