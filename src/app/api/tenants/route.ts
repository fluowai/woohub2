import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin, can } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const tenantSchema = z.object({
    name: z.string().min(1).max(120),
    slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase slug, e.g. minha-empresa"),
});

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        let tenants: any[];
        if (isAdmin(user.role)) {
            tenants = await prisma.tenant.findMany({
                orderBy: { createdAt: "desc" },
                select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true, _count: { select: { members: true, sessions: true, subscriptions: true } } },
            });
        } else if (can(user, "members:read")) {
            const memberships = await prisma.tenantMember.findMany({ where: { userId: user.id }, select: { tenantId: true } });
            const tenantIds = memberships.map(m => m.tenantId);
            tenants = await prisma.tenant.findMany({
                where: { id: { in: tenantIds } },
                orderBy: { createdAt: "desc" },
                select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true, _count: { select: { members: true, sessions: true } } },
            });
        } else {
            tenants = [];
        }

        return NextResponse.json({ status: true, message: "Tenants fetched", data: tenants });
    } catch (error) {
        console.error("List tenants error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch tenants", error: "Failed to fetch tenants" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = tenantSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const exists = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
        if (exists) {
            return NextResponse.json({ status: false, message: "Slug already exists", error: "Duplicate slug" }, { status: 409 });
        }

        const tenant = await prisma.tenant.create({ data: { slug: parsed.data.slug, name: parsed.data.name } });

        await audit({
            tenantId: tenant.id,
            actorUserId: user.id || null,
            actorLabel: user.email || "superadmin",
            action: "tenant.create",
            resource: "tenant",
            resourceId: tenant.id,
            metadata: { slug: tenant.slug, name: tenant.name },
        });

        return NextResponse.json({ status: true, message: "Tenant created", data: tenant }, { status: 201 });
    } catch (error) {
        console.error("Create tenant error:", error);
        return NextResponse.json({ status: false, message: "Failed to create tenant", error: "Failed to create tenant" }, { status: 500 });
    }
}
