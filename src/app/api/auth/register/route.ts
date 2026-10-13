import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/security/password";

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: passwordSchema,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password, name } = registerSchema.parse(body);

        // Check if registration is enabled
        const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
        // @ts-ignore
        if (systemConfig && systemConfig.enableRegistration === false) {
            return NextResponse.json(
                { error: "Registration is currently disabled by the administrator" },
                { status: 403 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "User with this email already exists" },
                { status: 400 }
            );
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the user
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });

        // Every user starts with their own company (tenant) and an OWNER membership.
        const { ensureTenantForUser } = await import("@/lib/access");
        const tenant = await ensureTenantForUser({
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
        });

        await prisma.auditLog.create({
            data: {
                tenantId: tenant.tenantId,
                actorUserId: newUser.id,
                actorLabel: newUser.email,
                actorType: "USER",
                action: "auth.register",
                resource: "user",
                resourceId: newUser.id,
            },
        });

        return NextResponse.json({
            success: true,
            message: "User registered successfully",
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid registration data provided" },
                { status: 400 }
            );
        }

        console.error("Registration error:", error);
        return NextResponse.json(
            { error: "Internal server error during registration" },
            { status: 500 }
        );
    }
}
