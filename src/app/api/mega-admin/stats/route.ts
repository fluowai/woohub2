import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);

    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const [
            activeResellersCount,
            totalResellersCount,
            directClientsCount,
            resellerClientsCount,
            totalInstancesProvisioned,
            connectedInstancesCount,
            verifiedDomainsCount,
            pendingDomainsCount,
            pendingOrSuspendedSubsCount,
            recentResellers,
            totalUsersCount,
        ] = await Promise.all([
            prisma.reseller.count({ where: { status: "ACTIVE" } }),
            prisma.reseller.count(),
            prisma.tenant.count({ where: { resellerId: null } }),
            prisma.tenant.count({ where: { resellerId: { not: null } } }),
            prisma.session.count(),
            prisma.session.count({ where: { status: "CONNECTED" } }),
            prisma.domain.count({ where: { status: { in: ["VERIFIED", "ACTIVE"] } } }),
            prisma.domain.count({ where: { status: "PENDING_VERIFICATION" } }),
            prisma.subscription.count({ where: { status: { in: ["PAST_DUE", "SUSPENDED", "TRIALING"] } } }),
            prisma.reseller.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
                include: {
                    owner: { select: { id: true, name: true, email: true } },
                    branding: { select: { name: true, primaryColor: true } },
                    domains: { select: { hostname: true, status: true } },
                    tenants: { select: { id: true, maxInstances: true, status: true } },
                    _count: { select: { tenants: true } },
                },
            }),
            prisma.user.count(),
        ]);

        // Map recent resellers with allocated vs contracted instances
        const formattedResellers = recentResellers.map((r) => {
            const allocatedInstances = r.tenants.reduce((sum, t) => sum + (t.maxInstances || 0), 0);
            const primaryDomain = r.domains[0]?.hostname || "woohub.local";
            return {
                id: r.id,
                name: r.name,
                ownerName: r.owner.name,
                ownerEmail: r.owner.email,
                domain: primaryDomain,
                instancesAllocated: allocatedInstances,
                instancesContracted: r.maxInstances,
                status: r.status,
                clientCount: r._count.tenants,
                createdAt: r.createdAt,
            };
        });

        return NextResponse.json({
            status: true,
            data: {
                totals: {
                    activeResellers: activeResellersCount,
                    totalResellers: totalResellersCount,
                    directClients: directClientsCount,
                    resellerClients: resellerClientsCount,
                    totalClients: directClientsCount + resellerClientsCount,
                    totalInstances: totalInstancesProvisioned,
                    connectedInstances: connectedInstancesCount,
                    verifiedDomains: verifiedDomainsCount,
                    pendingDomains: pendingDomainsCount,
                    pendingOrSuspendedSubs: pendingOrSuspendedSubsCount,
                    totalUsers: totalUsersCount,
                },
                recentResellers: formattedResellers,
            },
        });
    } catch (error) {
        console.error("Mega admin stats error:", error);
        return NextResponse.json({ status: false, message: "Falha ao buscar estatísticas" }, { status: 500 });
    }
}