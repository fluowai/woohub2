import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { invalidateQuotaCache } from "@/lib/quota";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "EXPIRED"]).optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    periodDays: z.number().int().min(1).max(730).optional(),
    graceDays: z.number().int().min(0).max(90).optional(),
});

// PATCH: change a subscription (platform admin only, audited)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const { tenantId } = await params;
        const body = await request.json().catch(() => ({}));
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const existing = await prisma.subscription.findUnique({ where: { tenantId } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Subscription not found", error: "Subscription not found" }, { status: 404 });
        }

        const now = new Date();
        const data: Record<string, unknown> = { ...parsed.data };
        if (parsed.data.periodDays) {
            data.currentPeriodStart = now;
            data.currentPeriodEnd = new Date(now.getTime() + parsed.data.periodDays * 24 * 60 * 60 * 1000);
        }
        if (parsed.data.graceDays !== undefined) {
            data.graceEndsAt = parsed.data.graceDays === 0
                ? null
                : new Date(now.getTime() + parsed.data.graceDays * 24 * 60 * 60 * 1000);
        }
        if (parsed.data.status === "CANCELED") data.canceledAt = now;
        if (parsed.data.status === "SUSPENDED") data.suspendedAt = now;
        delete data.periodDays;
        delete data.graceDays;

        const subscription = await prisma.subscription.update({ where: { tenantId }, data });
        invalidateQuotaCache(tenantId);

        await audit({
            tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "subscription.update",
            resource: "subscription",
            resourceId: subscription.id,
            metadata: { status: subscription.status, changed: Object.keys(parsed.data) },
        });

        return NextResponse.json({ status: true, message: "Subscription updated", data: subscription });
    } catch (error) {
        console.error("Update subscription error:", error);
        return NextResponse.json({ status: false, message: "Failed to update subscription", error: "Failed to update subscription" }, { status: 500 });
    }
}
