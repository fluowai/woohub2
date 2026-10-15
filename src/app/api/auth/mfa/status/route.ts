import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRole, mfaRequiredForAdmins } from "@/lib/mfa";

const bodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

/**
 * POST /api/auth/mfa/status
 * Checks credentials and reports whether MFA is required for this account.
 * Does NOT create a session. Returns the same response for wrong password
 * (mfaRequired: false) so it can't be used as a password oracle.
 */
export async function POST(req: NextRequest) {
    let parsed;
    try {
        parsed = bodySchema.safeParse(await req.json());
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
        return NextResponse.json({ mfaRequired: false });
    }

    const passwordsMatch = await bcrypt.compare(password, user.password);
    if (!passwordsMatch) {
        return NextResponse.json({ mfaRequired: false });
    }

    const mfaRequired = user.mfaEnabled;
    const adminMfaEnforced = !user.mfaEnabled && mfaRequiredForAdmins() && isAdminRole(user.role);

    return NextResponse.json({
        mfaRequired,
        adminMfaEnforced,
    });
}
