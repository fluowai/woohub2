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
        const instances = await prisma.session.findMany({
            where: {
                tenant: {
                    resellerId,
                },
            },
            orderBy: { createdAt: "desc" },
            include: {
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        contacts: true,
                        messages: true,
                    },
                },
            },
        });

        const formatted = instances.map((inst) => ({
            id: inst.id,
            name: inst.name,
            sessionId: inst.sessionId,
            status: inst.status,
            tenantId: inst.tenant?.id,
            tenantName: inst.tenant?.name || "Sem empresa",
            tenantStatus: inst.tenant?.status,
            contactsCount: inst._count.contacts,
            messagesCount: inst._count.messages,
            createdAt: inst.createdAt,
            updatedAt: inst.updatedAt,
        }));

        return NextResponse.json({ status: true, data: formatted });
    } catch (error) {
        console.error("Error fetching reseller instances:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar instâncias dos clientes" }, { status: 500 });
    }
}
