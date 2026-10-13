import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { invalidateQuotaCache } from "@/lib/quota";
import { assertPlanForMode, CommercialRuleError } from "@/lib/commercial";

export const dynamic = "force-dynamic";

/**
 * Subscriptions.
 *
 * While no payment gateway is configured, activation is MANUAL and audited
 * (pilot operation): a platform admin assigns a plan to a company, and the
 * plan limits start applying immediately.
 */

const assignSchema = z.object({
    tenantId: z.string().min(1),
    planId: z.string().min(1),
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "EXPIRED"]).default("TRIALING"),
    periodDays: z.number().int().min(1).max(730).default(30),
    trialDays: z.number().int().min(0).max(365).optional(),
    graceDays: z.number().int().min(0).max(90).optional(),
});

// GET: subscriptions (platform admin sees all; everyone else sees their own)
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const where = isAdmin(user.role) ? {} : { tenantId: user.tenantId ?? "__none__" };
        const subscriptions = await prisma.subscription.findMany({
            where,
            include: { plan: true, tenant: { select: { id: true, name: true, slug: true } } },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ status: true, message: "Subscriptions fetched", data: subscriptions });
    } catch (error) {
        console.error("List subscriptions error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch subscriptions", error: "Failed to fetch subscriptions" }, { status: 500 });
    }
}

// POST: assign (or re-assign) a plan to a company — platform admin only, audited
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = assignSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.tenantId } });
        if (!tenant) {
            return NextResponse.json({ status: false, message: "Company not found", error: "Company not found" }, { status: 404 });
        }

        const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
        if (!plan) {
            return NextResponse.json({ status: false, message: "Plan not found", error: "Plan not found" }, { status: 404 });
        }

        const mode = tenant.commercialMode;
        assertPlanForMode({ plan, mode, resellerId: tenant.resellerId });

        const now = new Date();
        const periodEnd = new Date(now.getTime() + parsed.data.periodDays * 24 * 60 * 60 * 1000);
        const trialEndsAt = parsed.data.trialDays
            ? new Date(now.getTime() + parsed.data.trialDays * 24 * 60 * 60 * 1000)
            : null;
        const graceEndsAt = parsed.data.graceDays
            ? new Date(now.getTime() + parsed.data.graceDays * 24 * 60 * 60 * 1000)
            : null;

        const subscription = await prisma.subscription.upsert({
            where: { tenantId: parsed.data.tenantId },
            update: {
                planId: plan.id,
                commercialMode: mode,
                contractedMaxInstances: plan.maxInstances,
                contractedMaxUsers: plan.maxUsers,
                contractedMaxInstallations: plan.maxInstallations,
                termsVersion: plan.updatedAt.toISOString(),
                status: parsed.data.status,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                trialEndsAt,
                graceEndsAt,
                canceledAt: null,
                suspendedAt: null,
                cancelAtPeriodEnd: false,
            },
            create: {
                tenantId: parsed.data.tenantId,
                planId: plan.id,
                commercialMode: mode,
                contractedMaxInstances: plan.maxInstances,
                contractedMaxUsers: plan.maxUsers,
                contractedMaxInstallations: plan.maxInstallations,
                termsVersion: plan.updatedAt.toISOString(),
                status: parsed.data.status,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                trialEndsAt,
                graceEndsAt,
            },
        });

        invalidateQuotaCache(parsed.data.tenantId);

        await audit({
            tenantId: parsed.data.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "subscription.assign",
            resource: "subscription",
            resourceId: subscription.id,
            metadata: { planCode: plan.code, status: subscription.status, periodDays: parsed.data.periodDays },
        });

        return NextResponse.json({ status: true, message: "Subscription assigned", data: subscription }, { status: 201 });
    } catch (error) {
        if (error instanceof CommercialRuleError) {
            return NextResponse.json({ status: false, code: error.code, message: error.message }, { status: error.status });
        }
        console.error("Assign subscription error:", error);
        return NextResponse.json({ status: false, message: "Failed to assign subscription", error: "Failed to assign subscription" }, { status: 500 });
    }
}
