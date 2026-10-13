import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { verifyDomainDns } from "@/lib/domains";
import { recordAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const domain = await prisma.domain.findFirst({
            where: { resellerId },
            orderBy: { createdAt: "desc" },
        });

        if (!domain) {
            return NextResponse.json({ status: false, message: "Nenhum domínio configurado para verificação" }, { status: 404 });
        }

        const check = await verifyDomainDns(domain.id);

        if (check.verified) {
            await recordAudit({
                actorType: "USER",
                actorLabel: authResult.context.email || "super_admin",
                actorUserId: authResult.context.userId || undefined,
                action: "reseller.domain_verified",
                resource: "Domain",
                resourceId: domain.id,
                metadata: { hostname: domain.hostname, resellerId },
            });
        }

        return NextResponse.json({
            status: check.verified,
            message: check.message,
            data: {
                domainId: domain.id,
                hostname: domain.hostname,
                status: check.status,
                details: check.details,
            },
        });
    } catch (error: any) {
        console.error("Error verifying domain:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro na validação do domínio" }, { status: 500 });
    }
}
