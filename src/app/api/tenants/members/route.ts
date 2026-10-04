import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, can } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { assertMemberQuota, quotaErrorResponse } from "@/lib/quota";

export const dynamic = "force-dynamic";

/**
 * Company members (team).
 *
 * A user can belong to several companies; the membership role decides the permissions
 * inside each one. Adding a member consumes the plan's `maxUsers` quota.
 */

const addMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(["ADMIN", "STAFF", "BILLING"]).default("STAFF"),
});

// GET: list members of the caller's company
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "members:read")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const members = await prisma.tenantMember.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                role: true,
                createdAt: true,
                user: { select: { id: true, name: true, email: true, createdAt: true } },
            },
        });

        return NextResponse.json({ status: true, message: "Members fetched", data: members });
    } catch (error) {
        console.error("List members error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch members", error: "Failed to fetch members" }, { status: 500 });
    }
}

// POST: add an existing user to the caller's company
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "members:write")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = addMemberSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!target) {
            return NextResponse.json({ status: false, message: "User not found", error: "User not found" }, { status: 404 });
        }

        const existing = await prisma.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: user.tenantId, userId: target.id } },
        });
        if (existing) {
            return NextResponse.json({ status: false, message: "User is already a member", error: "Already a member" }, { status: 409 });
        }

        // Plan quota: members per company.
        await assertMemberQuota(user.tenantId);

        const member = await prisma.tenantMember.create({
            data: { tenantId: user.tenantId, userId: target.id, role: parsed.data.role },
            select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
        });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "member",
            action: "member.add",
            resource: "tenant_member",
            resourceId: member.id,
            metadata: { userId: target.id, email: target.email, role: parsed.data.role },
        });

        return NextResponse.json({ status: true, message: "Member added", data: member }, { status: 201 });
    } catch (error) {
        const quotaError = quotaErrorResponse(error);
        if (quotaError) return quotaError;
        console.error("Add member error:", error);
        return NextResponse.json({ status: false, message: "Failed to add member", error: "Failed to add member" }, { status: 500 });
    }
}
