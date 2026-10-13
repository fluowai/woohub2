import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const reseller = await prisma.reseller.findUnique({
            where: { id: resellerId },
            include: {
                subscriptions: {
                    include: { plan: true },
                    orderBy: { createdAt: "desc" },
                },
                tenants: {
                    select: { maxInstances: true },
                },
            },
        });

        if (!reseller) {
            return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 404 });
        }

        const allocatedInstances = reseller.tenants.reduce((sum, t) => sum + (t.maxInstances || 0), 0);

        return NextResponse.json({
            status: true,
            data: {
                resellerId: reseller.id,
                resellerName: reseller.name,
                status: reseller.status,
                contractedInstances: reseller.maxInstances,
                allocatedInstances,
                availableInstances: Math.max(0, reseller.maxInstances - allocatedInstances),
                maxTenants: reseller.maxTenants,
                maxUsers: reseller.maxUsers,
                storageLimitMb: reseller.storageLimitMb,
                retentionDays: reseller.retentionDays,
                customDomainAllowed: reseller.customDomainAllowed,
                features: reseller.features,
                subscription: reseller.subscriptions[0] || null,
                notes: reseller.notes,
            },
        });
    } catch (error) {
        console.error("Error fetching my subscription:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar assinatura da revenda" }, { status: 500 });
    }
}
