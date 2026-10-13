import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/security/password";

const createSuperAdminSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: passwordSchema,
});

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const superAdmins = await prisma.user.findMany({
            where: { role: "SUPERADMIN" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                _count: { select: { sessions: true, memberships: true } },
            },
        });

        return NextResponse.json({ status: true, message: "Super admins fetched successfully", data: superAdmins });
    } catch (error) {
        console.error("Fetch super admins error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch super admins", error: "Failed to fetch super admins" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const parseResult = createSuperAdminSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
        }

        const { name, email, password } = parseResult.data;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json({ status: false, message: "Email already exists", error: "Email already exists" }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newSuperAdmin = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: "SUPERADMIN",
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ status: true, message: "Super admin created successfully", data: newSuperAdmin }, { status: 201 });

    } catch (error) {
        console.error("Create super admin error:", error);
        return NextResponse.json({ status: false, message: "Failed to create super admin", error: "Failed to create super admin" }, { status: 500 });
    }
}