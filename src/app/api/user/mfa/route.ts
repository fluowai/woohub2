import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    generateTotpSecret,
    encryptTotpSecret,
    decryptTotpSecret,
    verifyTotp,
    otpauthUri,
} from "@/lib/mfa";
import { audit } from "@/lib/audit";

const enableSchema = z.object({
    code: z.string().min(6).max(8),
    secret: z.string().regex(/^[A-Za-z2-7]{16,64}$/),
});

/**
 * GET /api/user/mfa — returns current MFA state + a fresh pending secret + otpauth URI.
 * Generating a new secret every call is safe: nothing is persisted until POST /enable.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, mfaEnabled: true, mfaSecret: true, role: true },
    });
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.mfaEnabled) {
        return NextResponse.json({ enabled: true, role: user.role });
    }

    const secret = generateTotpSecret();
    return NextResponse.json({
        enabled: false,
        role: user.role,
        pendingSecret: secret,
        otpauthUri: otpauthUri(secret, user.email),
    });
}

/**
 * POST /api/user/mfa — enable MFA after the user proves possession of the secret.
 * Body: { code, secret? } — secret is the pendingSecret from GET.
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let parsed;
    try {
        parsed = enableSchema.safeParse(await req.json());
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { code, secret: pendingSecret } = parsed.data;

    if (!verifyTotp(pendingSecret, code)) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const encrypted = encryptTotpSecret(session.user.id, pendingSecret);
    await prisma.user.update({
        where: { id: session.user.id },
        data: { mfaEnabled: true, mfaSecret: encrypted },
    });
    await audit({ actorUserId: session.user.id, actorLabel: session.user.email ?? session.user.id, action: "user.mfa.enabled", resource: "user", resourceId: session.user.id });

    return NextResponse.json({ enabled: true });
}

const disableSchema = z.object({
    code: z.string().min(6).max(8),
});

/**
 * DELETE /api/user/mfa — disable MFA (requires a valid current code).
 */
export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, mfaEnabled: true, mfaSecret: true },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) {
        return NextResponse.json({ error: "MFA not enabled" }, { status: 400 });
    }

    let parsed;
    try {
        parsed = disableSchema.safeParse(await req.json());
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    let secret: string;
    try {
        secret = decryptTotpSecret(user.id, user.mfaSecret);
    } catch {
        return NextResponse.json({ error: "MFA secret unavailable" }, { status: 500 });
    }
    if (!verifyTotp(secret, parsed.data.code)) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { mfaEnabled: false, mfaSecret: null },
    });
    await audit({ actorUserId: session.user.id, actorLabel: session.user.email ?? session.user.id, action: "user.mfa.disabled", resource: "user", resourceId: session.user.id });

    return NextResponse.json({ enabled: false });
}
