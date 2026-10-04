import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { invalidateQuotaCache } from "@/lib/quota";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional().nullable(),
    priceCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    period: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).optional(),
    maxInstances: z.number().int().min(0).max(10_000).optional(),
    maxUsers: z.number().int().min(0).max(10_000).optional(),
    requestLimit: z.number().int().min(0).max(100_000_000).optional(),
    sendLimit: z.number().int().min(0).max(100_000_000).optional(),
    storageLimitMb: z.number().int().min(0).max(10_000_000).optional(),
    retentionDays: z.number().int().min(0).max(3650).optional(),
    sort: z.number().int().optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

// PATCH: update a plan (platform admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const existing = await prisma.plan.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Plan not found", error: "Plan not found" }, { status: 404 });
        }

        const plan = await prisma.plan.update({ where: { id }, data: parsed.data });

        // Every company on this plan may see the new limits on their next check (30s TTL).
        invalidateQuotaCache();

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "plan.update",
            resource: "plan",
            resourceId: plan.id,
            metadata: { code: plan.code, changed: Object.keys(parsed.data) },
        });

        return NextResponse.json({ status: true, message: "Plan updated", data: plan });
    } catch (error) {
        console.error("Update plan error:", error);
        return NextResponse.json({ status: false, message: "Failed to update plan", error: "Failed to update plan" }, { status: 500 });
    }
}
