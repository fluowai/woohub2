import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, can } from "@/lib/api-auth";
import { generateApiKey, hashApiKey, redactApiKey } from "@/lib/security/api-keys";
import { API_KEY_SCOPES, parseScopes } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * API key management (company scoped).
 *
 * The full secret is returned ONLY by POST /api/api-keys (creation) and by the legacy
 * POST /api/user/api-key route. Everywhere else only the public prefix is exposed.
 */

export const dynamic = "force-dynamic";

const createSchema = z.object({
    name: z.string().min(1).max(80),
    scopes: z.array(z.string()).min(1).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
    instanceId: z.string().min(1).max(64).optional().nullable(),
});

function scopeList(scopes?: string[] | null): string {
    if (!scopes || scopes.length === 0) return API_KEY_SCOPES.join(" ");
    const allowed = new Set<string>(API_KEY_SCOPES);
    const filtered = scopes.filter((s) => allowed.has(s));
    return filtered.length > 0 ? filtered.join(" ") : API_KEY_SCOPES.join(" ");
}

// GET: list keys for the caller's company (never returns secrets)
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "apikeys:read")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const keys = await prisma.apiKey.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                publicId: true,
                name: true,
                scopes: true,
                instanceId: true,
                expiresAt: true,
                revokedAt: true,
                lastUsedAt: true,
                createdAt: true,
            },
        });

        return NextResponse.json({
            status: true,
            message: "API keys fetched",
            data: keys.map((k) => ({
                ...k,
                display: redactApiKey(`whk_${k.publicId}`),
                scopes: parseScopes(k.scopes),
            })),
        });
    } catch (error) {
        logger.error("ApiKeys", "Falha ao listar chaves de API:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch API keys", error: "Failed to fetch API keys" }, { status: 500 });
    }
}

// POST: create a key — the plaintext secret is returned exactly once here.
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "apikeys:write")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: "Invalid payload" }, { status: 400 });
        }

        if (parsed.data.instanceId) {
            const owned = await prisma.session.findFirst({
                where: {
                    sessionId: parsed.data.instanceId,
                    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
                },
                select: { id: true },
            });
            if (!owned) {
                return NextResponse.json({ status: false, message: "Instance not found", error: "Instance not found" }, { status: 404 });
            }
        }

        const generated = generateApiKey();
        const record = await prisma.apiKey.create({
            data: {
                tenantId: user.tenantId,
                publicId: generated.publicId,
                name: parsed.data.name,
                hash: generated.hash,
                scopes: scopeList(parsed.data.scopes),
                instanceId: parsed.data.instanceId ?? null,
                expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
                createdById: user.id || null,
            },
        });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || user.context.apiKey?.publicId || "api-key",
            action: "apikey.create",
            resource: "apikey",
            resourceId: record.id,
            metadata: { publicId: record.publicId, scopes: record.scopes, instanceId: record.instanceId },
        });

        return NextResponse.json({
            status: true,
            message: "API key created — this secret is shown only once",
            data: {
                id: record.id,
                publicId: record.publicId,
                name: record.name,
                key: generated.key,
                display: generated.display,
                scopes: parseScopes(record.scopes),
                instanceId: record.instanceId,
                expiresAt: record.expiresAt,
                createdAt: record.createdAt,
            },
        });
    } catch (error) {
        logger.error("ApiKeys", "Falha ao criar chave de API:", error);
        return NextResponse.json({ status: false, message: "Failed to create API key", error: "Failed to create API key" }, { status: 500 });
    }
}

// DELETE: revoke a key. Body: { id } (all company keys when omitted).
export async function DELETE(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "apikeys:write")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const where = body?.id
            ? { id: body.id, tenantId: user.tenantId }
            : { tenantId: user.tenantId, revokedAt: null };

        const result = await prisma.apiKey.updateMany({
            where,
            data: { revokedAt: new Date() },
        });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "api-key",
            action: "apikey.revoke",
            resource: "apikey",
            resourceId: (body?.id as string) ?? null,
            metadata: { revoked: result.count },
        });

        return NextResponse.json({ status: true, message: "API key revoked", data: { revoked: result.count } });
    } catch (error) {
        logger.error("ApiKeys", "Falha ao revogar chave de API:", error);
        return NextResponse.json({ status: false, message: "Failed to revoke API key", error: "Failed to revoke API key" }, { status: 500 });
    }
}

/** Rotation helper used by PATCH /api/api-keys/{id} semantics (create + revoke). */
export async function rotateKey(tenantId: string, keyId: string, actor: { userId: string | null; label: string }) {
    const existing = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId } });
    if (!existing) return null;

    const generated = generateApiKey();
    const record = await prisma.apiKey.create({
        data: {
            tenantId,
            publicId: generated.publicId,
            name: existing.name,
            hash: hashApiKey(generated.key),
            scopes: existing.scopes,
            instanceId: existing.instanceId,
            expiresAt: existing.expiresAt,
            createdById: actor.userId,
        },
    });

    await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

    await audit({
        tenantId,
        actorUserId: actor.userId,
        actorLabel: actor.label,
        action: "apikey.rotate",
        resource: "apikey",
        resourceId: record.id,
        metadata: { rotatedFrom: existing.id, publicId: record.publicId },
    });

    return { record, key: generated.key, display: generated.display };
}
