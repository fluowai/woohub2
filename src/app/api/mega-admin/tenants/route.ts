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
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");

    const skip = (page - 1) * limit;

    try {
        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
            ];
        }
        if (status) {
            where.status = status;
        }

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            members: true,
                            sessions: true,
                            subscriptions: true,
                        },
                    },
                },
            }),
            prisma.tenant.count({ where }),
        ]);

        return NextResponse.json({
            status: true,
            message: "Tenants fetched successfully",
            data: tenants,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Fetch tenants error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch tenants", error: "Failed to fetch tenants" }, { status: 500 });
    }
}