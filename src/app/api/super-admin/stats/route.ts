import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin, isReseller } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { getResellerQuotaSummary } from "@/lib/quotas/commercial";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    const supportResellerId = request.nextUrl.searchParams.get("supportResellerId");
    const supportMode = !!supportResellerId && authResult.ok && isMegaAdmin(authResult.context);
    if (!authResult.ok || (!isReseller(authResult.context) && !supportMode) || (!authResult.context.resellerId && !supportMode)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin (Revendedor)" }, { status: 403 });
    }

    const resellerId = supportMode ? supportResellerId! : authResult.context.resellerId!;
    if (supportMode) await recordAudit({ actorType: "USER", actorLabel: authResult.context.email || "mega_admin", actorUserId: authResult.context.userId || undefined, action: "reseller.support_panel", resource: "Reseller", resourceId: resellerId, metadata: { mode: "support_panel_read" } });

    try {
        const [quotaSummary, reseller, recentTenants] = await Promise.all([
            getResellerQuotaSummary(resellerId),
            prisma.reseller.findUnique({
                where: { id: resellerId },
                include: {
                    branding: true,
                    domains: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                    subscriptions: {
                        where: { status: "ACTIVE" },
                        include: { plan: true },
                        take: 1,
                    },
                },
            }),
            prisma.tenant.findMany({
                where: { resellerId },
                orderBy: { createdAt: "desc" },
                take: 5,
                include: {
                    members: {
                        include: {
                            user: { select: { name: true, email: true } },
                        },
                    },
                    subscriptions: {
                        include: { plan: true },
                    },
                    _count: { select: { sessions: true } },
                },
            }),
        ]);

        if (!reseller) {
            return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 404 });
        }

        const formattedTenants = recentTenants.map((t) => {
            const owner = t.members.find((m) => m.role === "OWNER" || m.role === "ADMIN") || t.members[0];
            const sub = t.subscriptions[0];
            return {
                id: t.id,
                name: t.name,
                slug: t.slug,
                status: t.status,
                instancesAllocated: t.maxInstances,
                sessionsCount: t._count.sessions,
                ownerName: owner?.user?.name || "Sem nome",
                ownerEmail: owner?.user?.email || "Sem e-mail",
                planName: sub?.plan?.name || "Plano Padrão",
            };
        });

        const primaryDomain = reseller.domains[0] || null;
        const currentSubscription = reseller.subscriptions[0] || null;

        return NextResponse.json({
            status: true,
            data: {
                quotas: quotaSummary,
                branding: reseller.branding,
                domain: primaryDomain,
                subscription: currentSubscription,
                recentClients: formattedTenants,
            },
        });
    } catch (error) {
        console.error("Super Admin stats error:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar indicadores da revenda" }, { status: 500 });
    }
}
