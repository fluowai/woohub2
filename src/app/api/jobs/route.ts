import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const listSchema = z.object({
    status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "DEAD"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const parsed = listSchema.safeParse(Object.fromEntries(searchParams));
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid query", error: parsed.error.flatten() }, { status: 400 });
        }

        const where = parsed.data.status ? { status: parsed.data.status } : {};
        const jobs = await prisma.messageJob.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: parsed.data.limit,
            select: {
                id: true,
                tenantId: true,
                sessionPk: true,
                instanceId: true,
                type: true,
                status: true,
                priority: true,
                attempts: true,
                maxAttempts: true,
                availableAt: true,
                lockedAt: true,
                lockedBy: true,
                correlationId: true,
                lastError: true,
                resultKey: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ status: true, message: "Jobs fetched", data: jobs });
    } catch (error) {
        console.error("List jobs error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch jobs", error: "Failed to fetch jobs" }, { status: 500 });
    }
}
