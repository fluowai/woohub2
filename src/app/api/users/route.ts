import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin, canManageUser, type AuthenticatedUser } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/security/password";
import { audit } from "@/lib/audit";

// Roles that /api/users may create. MEGA_ADMIN is intentionally NOT in this enum:
// only /api/mega-admin/* (isMegaAdmin gate) can provision platform admins.
const creatableRoles = z.enum(["SUPERADMIN", "OWNER", "STAFF"]);

const createUserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: passwordSchema,
    role: creatableRoles.default("OWNER"),
});

function usersWhereFor(user: AuthenticatedUser): Record<string, unknown> | undefined {
    // SUPERADMIN (non-mega) only sees users who belong to tenants under their reseller.
    if (user.role === "SUPERADMIN" && !user.isMegaAdmin) {
        const resellerId = user.context.resellerId;
        if (!resellerId) return { id: "__none__" };
        return { memberships: { some: { tenant: { resellerId } } } };
    }
    return undefined;
}

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    // Only platform admins can list users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const users = await prisma.user.findMany({
            where: usersWhereFor(user),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                _count: {
                    select: { sessions: true }
                }
            }
        });

        return NextResponse.json({ status: true, message: "Users fetched successfully", data: users });
    } catch (error) {
        console.error("List users error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch users", error: "Failed to fetch users" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    // Only platform admins can create users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const parseResult = createUserSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
        }

        const { name, email, password, role } = parseResult.data;

        // Privilege guard: SUPERADMIN cannot create SUPERADMIN (escalation).
        if (!canManageUser(user, role)) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        // Check if email exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json({ status: false, message: "Email already exists", error: "Email already exists" }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true
            }
        });

        await audit({
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "user.create",
            resource: "user",
            resourceId: newUser.id,
            metadata: { email, role },
        });

        return NextResponse.json({ status: true, message: "User created successfully", data: newUser }, { status: 201 });

    } catch (error) {
        console.error("Create user error:", error);
        return NextResponse.json({ status: false, message: "Failed to create user", error: "Failed to create user" }, { status: 500 });
    }
}
