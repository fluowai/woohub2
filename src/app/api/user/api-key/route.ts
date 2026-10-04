import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { generateApiKey, redactApiKey } from "@/lib/security/api-keys";
import { audit } from "@/lib/audit";

/**
 * Legacy API-key endpoint (kept for compatibility).
 *
 * Behavior change (documented): plaintext keys are no longer stored in the database.
 *   GET    -> returns active keys (public prefix only); `data.apiKey` is always null.
 *   POST   -> creates a new key and returns the full secret exactly once (same shape as before).
 *   DELETE -> revokes every active key of the company.
 *
 * Prefer /api/api-keys for scoped management (expiry, instance binding, rotation).
 */

export const dynamic = "force-dynamic";

// Get current user's API keys (public prefixes only)
export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const tenant = user.tenantId
            ? await prisma.tenantMember.findFirst({ where: { userId: user.id }, select: { tenantId: true } })
            : null;
        const tenantId = user.tenantId ?? tenant?.tenantId;
        if (!tenantId) {
            return NextResponse.json({ status: true, message: "API key fetched", data: { apiKey: null, keys: [] } });
        }

        const keys = await prisma.apiKey.findMany({
            where: { tenantId, revokedAt: null },
            orderBy: { createdAt: "desc" },
            select: { id: true, publicId: true, name: true, scopes: true, createdAt: true, lastUsedAt: true, expiresAt: true },
        });

        return NextResponse.json({
            status: true,
            message: "API key fetched",
            data: {
                // Kept for backward compatibility; secrets are never persisted anymore.
                apiKey: null,
                keys: keys.map((k) => ({ ...k, display: redactApiKey(`whk_${k.publicId}`) })),
            },
        });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to fetch API key", error: "Failed to fetch API key" }, { status: 500 });
    }
}

// Generate new API key (secret returned once)
export async function POST() {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        if (!user.tenantId) {
            return NextResponse.json({ status: false, message: "No company associated with this user", error: "No company" }, { status: 400 });
        }

        const generated = generateApiKey();
        const record = await prisma.apiKey.create({
            data: {
                tenantId: user.tenantId,
                publicId: generated.publicId,
                name: "Chave padrão",
                hash: generated.hash,
                createdById: user.id || null,
            },
        });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "api-key",
            action: "apikey.create",
            resource: "apikey",
            resourceId: record.id,
            metadata: { publicId: record.publicId, via: "legacy-route" },
        });

        return NextResponse.json({ status: true, message: "API key generated", data: { apiKey: generated.key, publicId: record.publicId } });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to generate API key", error: "Failed to generate API key" }, { status: 500 });
    }
}

// Delete/revoke API keys
export async function DELETE() {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        if (!user.tenantId) {
            return NextResponse.json({ status: true, message: "API key revoked" });
        }

        const result = await prisma.apiKey.updateMany({
            where: { tenantId: user.tenantId, revokedAt: null },
            data: { revokedAt: new Date() },
        });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "api-key",
            action: "apikey.revoke",
            resource: "apikey",
            metadata: { revoked: result.count, via: "legacy-route" },
        });

        return NextResponse.json({ status: true, message: "API key revoked", data: { revoked: result.count } });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to revoke API key", error: "Failed to revoke API key" }, { status: 500 });
    }
}
