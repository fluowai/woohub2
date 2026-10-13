import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";
import { verifyDomainDns } from "@/lib/domains";
import { recordAudit } from "@/lib/audit";

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
        const { action, status, certificateStatus, notes } = body;

        if (action === "verify") {
            const check = await verifyDomainDns(id);
            return NextResponse.json({
                status: check.verified,
                message: check.message,
                details: check.details,
            });
        }

        const updateData: any = {};
        if (status) updateData.status = status;
        if (certificateStatus) updateData.certificateStatus = certificateStatus;
        if (notes !== undefined) updateData.notes = notes;
        if (status === "VERIFIED" || status === "ACTIVE") {
            updateData.validatedAt = new Date();
        }

        const domain = await prisma.domain.update({
            where: { id },
            data: updateData,
            include: { reseller: true },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "domain.update",
            resource: "Domain",
            resourceId: id,
            metadata: updateData,
        });

        return NextResponse.json({ status: true, message: "Domínio atualizado com sucesso", data: domain });
    } catch (error: any) {
        console.error("Error updating domain:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao atualizar domínio" }, { status: 400 });
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
        const domain = await prisma.domain.findUnique({ where: { id } });
        if (!domain) {
            return NextResponse.json({ status: false, message: "Domínio não encontrado" }, { status: 404 });
        }

        // Removal of domain does NOT delete clients or instances (explicit requirement!)
        await prisma.domain.delete({ where: { id } });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "domain.delete",
            resource: "Domain",
            resourceId: id,
            metadata: { hostname: domain.hostname },
        });

        return NextResponse.json({ status: true, message: "Domínio excluído com sucesso (clientes e instâncias preservados)" });
    } catch (error: any) {
        console.error("Error deleting domain:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao excluir domínio" }, { status: 400 });
    }
}
