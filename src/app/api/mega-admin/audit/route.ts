import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId");
    const actorType = searchParams.get("actorType");

    const skip = (page - 1) * limit;

    try {
        const where: any = {};
        if (action) where.action = { contains: action, mode: "insensitive" };
        if (tenantId) where.tenantId = tenantId;
        if (actorType) where.actorType = actorType;

        const [auditLogs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    tenant: { select: { id: true, name: true, slug: true } },
                },
            }),
            prisma.auditLog.count({ where }),
        ]);

        return NextResponse.json({
            status: true,
            message: "Audit logs fetched successfully",
            data: auditLogs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Fetch audit logs error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch audit logs", error: "Failed to fetch audit logs" }, { status: 500 });
    }
}