import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
});

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const record = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
        });
        if (!record) {
            return NextResponse.json({ status: false, message: "User not found", error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ status: true, message: "Profile fetched", data: record });
    } catch (error) {
        console.error("Fetch profile error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch profile", error: "Failed to fetch profile" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = updateProfileSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const data: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) data.name = parsed.data.name;
        if (parsed.data.email !== undefined) {
            const existing = await prisma.user.findFirst({ where: { email: parsed.data.email, NOT: { id: user.id } } });
            if (existing) {
                return NextResponse.json({ status: false, message: "Email already in use", error: "Duplicate email" }, { status: 409 });
            }
            data.email = parsed.data.email;
        }

        const updated = await prisma.user.update({ where: { id: user.id }, data, select: { id: true, name: true, email: true, updatedAt: true } });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id,
            actorLabel: user.email || "user",
            actorType: "USER",
            action: "user.profile.update",
            resource: "user",
            resourceId: user.id,
            metadata: data,
        });

        return NextResponse.json({ status: true, message: "Profile updated", data: updated });
    } catch (error) {
        console.error("Update profile error:", error);
        return NextResponse.json({ status: false, message: "Failed to update profile", error: "Failed to update profile" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = changePasswordSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const record = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
        if (!record) {
            return NextResponse.json({ status: false, message: "User not found", error: "Not found" }, { status: 404 });
        }

        const valid = await bcrypt.compare(parsed.data.currentPassword, record.password);
        if (!valid) {
            return NextResponse.json({ status: false, message: "Current password is incorrect", error: "Invalid password" }, { status: 400 });
        }

        const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id,
            actorLabel: user.email || "user",
            actorType: "USER",
            action: "user.password.change",
            resource: "user",
            resourceId: user.id,
        });

        return NextResponse.json({ status: true, message: "Password changed successfully" });
    } catch (error) {
        console.error("Change password error:", error);
        return NextResponse.json({ status: false, message: "Failed to change password", error: "Failed to change password" }, { status: 500 });
    }
}
