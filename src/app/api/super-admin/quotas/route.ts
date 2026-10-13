import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { getResellerQuotaSummary } from "@/lib/quotas/commercial";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const summary = await getResellerQuotaSummary(resellerId);

        // Get detailed breakdown of tenants
        const allocations = await prisma.instanceAllocation.findMany({
            where: { resellerId },
            include: {
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        _count: { select: { sessions: true } },
                    },
                },
            },
        });

        return NextResponse.json({
            status: true,
            data: {
                summary,
                allocations: allocations.map((a) => ({
                    tenantId: a.tenantId,
                    tenantName: a.tenant.name,
                    tenantStatus: a.tenant.status,
                    allocated: a.allocated,
                    activeSessions: a.tenant._count.sessions,
                    updatedAt: a.updatedAt,
                })),
            },
        });
    } catch (error) {
        console.error("Error fetching reseller quotas:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar cotas" }, { status: 500 });
    }
}
