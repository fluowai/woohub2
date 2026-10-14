import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin, canAccessTenant } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    const { tenantId } = await params;
    if (!isAdmin(user.role)) {
        if (user.tenantId !== tenantId) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }
    } else if (!(await canAccessTenant(user, tenantId))) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true,
                _count: { select: { members: true, sessions: true, subscriptions: true, invoices: true } },
            },
        });
        if (!tenant) {
            return NextResponse.json({ status: false, message: "Tenant not found", error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ status: true, message: "Tenant fetched", data: tenant });
    } catch (error) {
        console.error("Fetch tenant error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch tenant", error: "Failed to fetch tenant" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }
    const { tenantId } = await params;
    if (!(await canAccessTenant(user, tenantId))) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: parsed.data,
            select: { id: true, slug: true, name: true, status: true, updatedAt: true },
        });

        await audit({
            tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "superadmin",
            action: "tenant.update",
            resource: "tenant",
            resourceId: tenant.id,
            metadata: parsed.data,
        });

        return NextResponse.json({ status: true, message: "Tenant updated", data: tenant });
    } catch (error) {
        console.error("Update tenant error:", error);
        return NextResponse.json({ status: false, message: "Failed to update tenant", error: "Failed to update tenant" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }
    const { tenantId } = await params;
    if (!(await canAccessTenant(user, tenantId))) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        await prisma.tenant.delete({ where: { id: tenantId } });

        await audit({
            tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "superadmin",
            action: "tenant.delete",
            resource: "tenant",
            resourceId: tenantId,
        });

        return NextResponse.json({ status: true, message: "Tenant deleted" });
    } catch (error) {
        console.error("Delete tenant error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete tenant", error: "Failed to delete tenant" }, { status: 500 });
    }
}
