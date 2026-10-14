import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Auditoria da plataforma (leitura) — SUPERADMIN apenas.
 *
 * Filtros suportados (query string):
 *   tenantId, action, resource, actorLabel, from (ISO), to (ISO),
 *   limit (1..200, padrão 50), offset (>= 0)
 */
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const limitRaw = Number(sp.get("limit") ?? 50);
    const offsetRaw = Number(sp.get("offset") ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

    const from = sp.get("from") ? new Date(sp.get("from") as string) : null;
    const to = sp.get("to") ? new Date(sp.get("to") as string) : null;

    const where: Record<string, unknown> = {};
    const tenantId = sp.get("tenantId");
    const action = sp.get("action");
    const resource = sp.get("resource");
    const actorLabel = sp.get("actorLabel");
    if (tenantId) where.tenantId = tenantId;
    if (action) where.action = { contains: action };
    if (resource) where.resource = resource;
    if (actorLabel) where.actorLabel = { contains: actorLabel, mode: "insensitive" };
    if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt as object), gte: from };
    if (to && !Number.isNaN(to.getTime())) where.createdAt = { ...(where.createdAt as object), lte: to };

    // Reseller scope: SUPERADMIN only sees audit entries of their own reseller
    // (or of a tenant under it). MEGA_ADMIN sees the global trail.
    if (!user.isMegaAdmin) {
        const resellerId = user.context.resellerId;
        if (!resellerId) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }
        if (tenantId) {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { resellerId: true },
            });
            if (!tenant || tenant.resellerId !== resellerId) {
                return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
            }
        } else {
            where.resellerId = resellerId;
        }
    }

    try {
        const [total, items] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    tenantId: true,
                    actorLabel: true,
                    actorType: true,
                    action: true,
                    resource: true,
                    resourceId: true,
                    metadata: true,
                    ip: true,
                    requestId: true,
                    createdAt: true,
                },
            }),
        ]);

        return NextResponse.json({
            status: true,
            message: "Audit fetched",
            data: items,
            meta: { total, limit, offset, hasMore: offset + items.length < total },
        });
    } catch (error) {
        console.error("List audit error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch audit", error: "Failed to fetch audit" }, { status: 500 });
    }
}

/**
 * Registra na própria trilha o acesso do superadmin à auditoria
 * (quem olhou o log é também um evento de log).
 */
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    await audit({
        tenantId: user.tenantId,
        actorUserId: user.id || null,
        actorLabel: user.email || "superadmin",
        action: "audit.access",
        resource: "audit",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    });

    return NextResponse.json({ status: true, message: "Audit access recorded" });
}
