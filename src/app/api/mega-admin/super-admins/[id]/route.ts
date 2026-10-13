import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/security/password";

const updateSuperAdminSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: passwordSchema.optional(),
    role: z.enum(["SUPERADMIN", "OWNER", "STAFF"]).optional(),
    isActive: z.boolean().optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    if (id === user.id) {
        return NextResponse.json({ status: false, message: "Cannot modify yourself", error: "Cannot modify yourself" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const parseResult = updateSuperAdminSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
        }

        const { name, email, password, role, isActive } = parseResult.data;

        const updateData: any = {};
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
                updatedAt: true,
            },
        });

        return NextResponse.json({ status: true, message: "Super admin updated successfully", data: updatedUser });

    } catch (error) {
        console.error("Update super admin error:", error);
        return NextResponse.json({ status: false, message: "Failed to update super admin", error: "Failed to update super admin" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    if (id === user.id) {
        return NextResponse.json({ status: false, message: "Cannot delete yourself", error: "Cannot delete yourself" }, { status: 400 });
    }

    try {
        await prisma.user.delete({ where: { id } });
        return NextResponse.json({ status: true, message: "Super admin deleted successfully" });
    } catch (error) {
        console.error("Delete super admin error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete super admin", error: "Failed to delete super admin" }, { status: 500 });
    }
}