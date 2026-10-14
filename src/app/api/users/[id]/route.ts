import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin, canManageUser } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/security/password";
import { audit } from "@/lib/audit";

const updateSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: passwordSchema.optional(),
    // MEGA_ADMIN is intentionally not assignable here: platform admins are
    // provisioned only through /api/mega-admin/* (isMegaAdmin gate).
    role: z.enum(["SUPERADMIN", "OWNER", "STAFF"]).optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    // Only platform admins can update users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Validation error", error: parsed.error.flatten() }, { status: 400 });
        }
        const { name, email, password, role } = parsed.data;

        const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, role: true },
        });
        if (!target) {
            return NextResponse.json({ status: false, message: "User not found", error: "Not found" }, { status: 404 });
        }

        // Privilege guard: cannot manage users at/above your own tier.
        // SUPERADMIN can only manage OWNER/STAFF; MEGA_ADMIN manages everyone.
        if (!canManageUser(user, target.role)) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }
        // Privilege guard on the new role as well (cannot promote beyond own tier).
        if (role && !canManageUser(user, role)) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }
        // Self role change is not allowed (prevents accidental lock-out / self-promotion).
        if (id === user.id && role && role !== target.role) {
            return NextResponse.json({ status: false, message: "Cannot change your own role", error: "Cannot change your own role" }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                updatedAt: true
            }
        });

        await audit({
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "user.update",
            resource: "user",
            resourceId: id,
            metadata: {
                targetEmail: target.email,
                changed: Object.keys(updateData),
                roleChange: role && role !== target.role ? { from: target.role, to: role } : undefined,
            },
        });

        return NextResponse.json({ status: true, message: "User updated successfully", data: updatedUser });

    } catch (error) {
        console.error("Update user error:", error);
        return NextResponse.json({ status: false, message: "Failed to update user", error: "Failed to update user" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    // Only platform admins can delete users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    if (id === user.id) {
        return NextResponse.json({ status: false, message: "Cannot delete yourself", error: "Cannot delete yourself" }, { status: 400 });
    }

    try {
        const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, role: true },
        });
        if (!target) {
            return NextResponse.json({ status: false, message: "User not found", error: "Not found" }, { status: 404 });
        }

        // Privilege guard: cannot delete users at/above your own tier.
        if (!canManageUser(user, target.role)) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        await prisma.user.delete({ where: { id } });

        await audit({
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "user.delete",
            resource: "user",
            resourceId: id,
            metadata: { targetEmail: target.email, targetRole: target.role },
        });

        return NextResponse.json({ status: true, message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete user error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete user", error: "Failed to delete user" }, { status: 500 });
    }
}
