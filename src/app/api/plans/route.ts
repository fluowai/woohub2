import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Plan catalog.
 *
 *   GET    -> any signed-in user sees the ACTIVE plans (pricing/limits display).
 *   POST   -> platform admin creates a plan.
 *
 * Prices are stored in cents and are set by the operator; nothing is invented here.
 */

const planSchema = z.object({
    code: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase code, e.g. pro-monthly"),
    name: z.string().min(1).max(80),
    description: z.string().max(500).optional().nullable(),
    priceCents: z.number().int().min(0).default(0),
    currency: z.string().length(3).default("BRL"),
    period: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).default("MONTHLY"),
    maxInstances: z.number().int().min(0).max(10_000).default(1),
    maxUsers: z.number().int().min(0).max(10_000).default(1),
    requestLimit: z.number().int().min(0).max(100_000_000).default(1000),
    sendLimit: z.number().int().min(0).max(100_000_000).default(500),
    storageLimitMb: z.number().int().min(0).max(10_000_000).default(100),
    retentionDays: z.number().int().min(0).max(3650).default(30),
    commercialMode: z.enum(["DIRECT", "RESELLER", "WHITE_LABEL"]).default("DIRECT"),
    maxInstallations: z.number().int().min(0).max(10_000).default(0),
    trialDays: z.number().int().min(0).max(365).default(0),
    gracePeriodDays: z.number().int().min(0).max(90).default(0),
    resellerId: z.string().min(1).nullable().optional(),
    sort: z.number().int().default(0),
});

// GET: plan catalog
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const includeArchived = isAdmin(user.role) && request.nextUrl.searchParams.get("all") === "1";
        const plans = await prisma.plan.findMany({
            where: includeArchived ? {} : { status: "ACTIVE" },
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
        });
        return NextResponse.json({ status: true, message: "Plans fetched", data: plans });
    } catch (error) {
        console.error("List plans error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch plans", error: "Failed to fetch plans" }, { status: 500 });
    }
}

// POST: create a plan (platform admin only)
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = planSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const exists = await prisma.plan.findUnique({ where: { code: parsed.data.code } });
        if (exists) {
            return NextResponse.json({ status: false, message: "Plan code already exists", error: "Duplicate code" }, { status: 409 });
        }

        if (parsed.data.commercialMode === "RESELLER" && !parsed.data.resellerId) {
            return NextResponse.json({ status: false, message: "Planos RESELLER exigem uma revenda." }, { status: 422 });
        }
        if (parsed.data.commercialMode !== "RESELLER" && parsed.data.resellerId) {
            return NextResponse.json({ status: false, message: "Somente planos RESELLER podem pertencer a uma revenda." }, { status: 422 });
        }
        const plan = await prisma.plan.create({ data: parsed.data });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "plan.create",
            resource: "plan",
            resourceId: plan.id,
            metadata: { code: plan.code, priceCents: plan.priceCents, currency: plan.currency },
        });

        return NextResponse.json({ status: true, message: "Plan created", data: plan }, { status: 201 });
    } catch (error) {
        console.error("Create plan error:", error);
        return NextResponse.json({ status: false, message: "Failed to create plan", error: "Failed to create plan" }, { status: 500 });
    }
}
