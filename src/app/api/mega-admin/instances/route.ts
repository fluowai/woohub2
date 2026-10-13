import { NextResponse, NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";
import { assertInstanceQuota, quotaErrorResponse } from "@/lib/quota";
import { waManager } from "@/modules/whatsapp/manager";

export const dynamic = "force-dynamic";

const include = {
    tenant: { select: { id: true, name: true, slug: true, status: true, resellerId: true } },
    user: { select: { id: true, name: true, email: true } },
    _count: { select: { contacts: true, messages: true, groups: true } },
} satisfies Prisma.SessionInclude;

function deny() {
    return NextResponse.json(
        { status: false, message: "Acesso restrito ao Mega Admin" },
        { status: 403 }
    );
}

/** GET /api/mega-admin/instances — todas as instâncias da plataforma. */
export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) return deny();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const tenantId = (searchParams.get("tenantId") || "").trim();

    const where: Prisma.SessionWhereInput = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { sessionId: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
        ];
    }
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    try {
        const [sessions, total] = await Promise.all([
            prisma.session.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include,
            }),
            prisma.session.count({ where }),
        ]);

        const data = sessions.map((session) => {
            const live = waManager.getInstance(session.sessionId);
            return {
                id: session.id,
                name: session.name,
                sessionId: session.sessionId,
                // A instância viva manda: o espelho do banco fica defasado entre
                // reconexões (é o mesmo defeito do QR).
                status: live?.status || session.status,
                dbStatus: session.status,
                tenantId: session.tenantId,
                tenantName: session.tenant?.name || "Sem empresa",
                tenantStatus: session.tenant?.status || null,
                resellerId: session.tenant?.resellerId ?? null,
                ownerId: session.userId,
                ownerName: session.user?.name || null,
                ownerEmail: session.user?.email || null,
                running: !!live,
                contactsCount: session._count.contacts,
                messagesCount: session._count.messages,
                groupsCount: session._count.groups,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            };
        });

        return NextResponse.json({
            status: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    } catch (error) {
        console.error("Mega admin instances error:", error);
        return NextResponse.json(
            { status: false, message: "Falha ao buscar instâncias" },
            { status: 500 }
        );
    }
}

/** POST /api/mega-admin/instances — provisiona uma instância para uma empresa. */
export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) return deny();

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";

    if (!name) {
        return NextResponse.json(
            { status: false, message: "Nome da instância é obrigatório" },
            { status: 400 }
        );
    }

    try {
        let ownerUserId = authResult.context.userId;
        let resolvedTenantId: string | null = null;

        if (tenantId) {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { id: true, name: true },
            });
            if (!tenant) {
                return NextResponse.json(
                    { status: false, message: "Empresa não encontrada" },
                    { status: 404 }
                );
            }

            // A instância precisa de um dono dentro da empresa; preferimos OWNER.
            const members = await prisma.tenantMember.findMany({
                where: { tenantId },
                select: { userId: true, role: true },
            });
            const owner =
                members.find((m) => m.role === "OWNER") ||
                members.find((m) => m.role === "ADMIN") ||
                members[0];

            if (!owner) {
                return NextResponse.json(
                    { status: false, message: "A empresa não tem membros para serem donos da instância" },
                    { status: 409 }
                );
            }
            ownerUserId = owner.userId;
            resolvedTenantId = tenantId;
        }

        if (!ownerUserId) {
            return NextResponse.json(
                { status: false, message: "Nenhum usuário dono disponível" },
                { status: 409 }
            );
        }

        await assertInstanceQuota(resolvedTenantId);

        const session = await waManager.createSession(
            ownerUserId,
            name,
            sessionId || undefined,
            resolvedTenantId ?? undefined
        );

        return NextResponse.json({ status: true, message: "Instância criada", data: session });
    } catch (error) {
        const quotaError = quotaErrorResponse(error);
        if (quotaError) return quotaError;
        console.error("Mega admin create instance error:", error);
        const message = (error as Error)?.message || "Falha ao criar instância";
        return NextResponse.json({ status: false, message }, { status: 500 });
    }
}
