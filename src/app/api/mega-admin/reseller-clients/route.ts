import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const clients = await prisma.tenant.findMany({
            where: { resellerId: { not: null } },
            orderBy: { createdAt: "desc" },
            include: {
                reseller: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        owner: { select: { email: true, name: true } },
                    },
                },
                members: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                subscriptions: {
                    include: { plan: true },
                },
                _count: {
                    select: { sessions: true, members: true },
                },
            },
        });

        const formatted = clients.map((c) => {
            const owner = c.members.find((m) => m.role === "OWNER" || m.role === "ADMIN") || c.members[0];
            const sub = c.subscriptions[0];

            return {
                id: c.id,
                name: c.name,
                slug: c.slug,
                status: c.status,
                maxInstances: c.maxInstances,
                sessionCount: c._count.sessions,
                memberCount: c._count.members,
                clientOwnerName: owner?.user?.name || "Sem nome",
                clientOwnerEmail: owner?.user?.email || "Sem e-mail",
                resellerId: c.reseller?.id,
                resellerName: c.reseller?.name,
                resellerSlug: c.reseller?.slug,
                resellerOwnerEmail: c.reseller?.owner.email,
                planName: sub?.plan?.name || "Plano Revenda",
                subscriptionStatus: sub?.status || "ACTIVE",
                createdAt: c.createdAt,
            };
        });

        return NextResponse.json({ status: true, data: formatted });
    } catch (error) {
        console.error("Error fetching reseller clients:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar clientes dos revendedores" }, { status: 500 });
    }
}
