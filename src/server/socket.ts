import { Server, Socket } from "socket.io";
import { decode } from "next-auth/jwt";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { extractPublicId, hashApiKey, isLegacyKeyFormat, isValidKeyFormat, verifyKeyHash } from "../lib/security/api-keys";
import { resolveInstanceRoom, userRoom } from "../lib/realtime";

/**
 * Socket.IO authentication and room authorization.
 *
 * Every connection must present a valid credential in the handshake:
 *   - auth.apiKey  : a Woohub API key (tenant-bound, scope-checked)
 *   - cookie       : the NextAuth session JWT
 *
 * Identity is always derived server-side. Client-supplied userId/tenantId values are never
 * trusted: rooms are derived from the authenticated identity and re-validated on every join.
 */

interface SocketIdentity {
    kind: "session" | "apiKey";
    userId: string | null;
    tenantId: string;
    isSuperAdmin: boolean;
    label: string;
}

function parseCookies(header?: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    }
    return out;
}

async function identifyByApiKey(rawKey: string): Promise<SocketIdentity | null> {
    const legacy = isLegacyKeyFormat(rawKey);
    if (!legacy && !isValidKeyFormat(rawKey)) return null;

    let record = legacy
        ? await prisma.apiKey.findUnique({ where: { hash: hashApiKey(rawKey) }, include: { tenant: true } })
        : null;

    if (!record) {
        const publicId = legacy ? null : extractPublicId(rawKey);
        if (!publicId) return null;
        record = await prisma.apiKey.findUnique({
            where: { publicId },
            include: { tenant: true },
        });
        if (!record || !verifyKeyHash(rawKey, record.hash)) return null;
    }

    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;
    if (record.tenant.status !== "ACTIVE") return null;

    return {
        kind: "apiKey",
        userId: record.createdById,
        tenantId: record.tenantId,
        isSuperAdmin: false,
        label: `apikey:${record.publicId}`,
    };
}

async function identifyBySessionCookie(cookieHeader?: string): Promise<SocketIdentity | null> {
    const cookies = parseCookies(cookieHeader);
    const cookieNames = [
        "authjs.session-token",
        "__Secure-authjs.session-token",
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
    ];
    const salt = cookieNames.find((name) => !!cookies[name]);
    if (!salt) return null;
    const token = cookies[salt];

    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;

    const payload = await decode({ token, secret, salt }).catch(() => null);
    if (!payload) return null;

    const userId = (payload.id as string | undefined) || payload.sub;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
    });
    if (!user) return null;

    const membership = await prisma.tenantMember.findFirst({
        where: { userId: user.id },
        select: { tenantId: true },
    });
    if (!membership && user.role !== "SUPERADMIN") return null;

    return {
        kind: "session",
        userId: user.id,
        tenantId: membership?.tenantId ?? "platform",
        isSuperAdmin: user.role === "SUPERADMIN",
        label: user.email ?? user.id,
    };
}

async function authenticate(socket: Socket): Promise<SocketIdentity | null> {
    const apiKey = socket.handshake.auth?.apiKey;
    if (typeof apiKey === "string" && apiKey.trim()) {
        return identifyByApiKey(apiKey.trim());
    }
    return identifyBySessionCookie(socket.handshake.headers.cookie);
}

/** Re-validates that this identity may access the given instance. */
async function canAccessInstance(identity: SocketIdentity, sessionRef: string): Promise<boolean> {
    const session = await prisma.session.findFirst({
        where: { OR: [{ id: sessionRef }, { sessionId: sessionRef }] },
        select: { id: true, userId: true, tenantId: true },
    });
    if (!session) return false;

    if (identity.isSuperAdmin) return true;
    if (!identity.tenantId || identity.tenantId === "platform") return false;
    if (session.tenantId && session.tenantId !== identity.tenantId) return false;
    if (session.userId === identity.userId) return true;

    // Legacy rows without tenantId are only visible to their owner.
    if (!session.tenantId) return false;

    const shared = await prisma.sessionAccess.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: identity.userId ?? "" } },
    });
    if (shared) return true;

    const membership = await prisma.tenantMember.findFirst({
        where: { userId: identity.userId ?? "", tenantId: identity.tenantId },
        select: { role: true },
    });
    return !!membership && membership.role !== "STAFF";
}

export function setupSocket(io: Server) {
    io.use(async (socket, next) => {
        try {
            const identity = await authenticate(socket);
            if (!identity) {
                return next(new Error("unauthorized"));
            }
            socket.data.identity = identity;
            socket.data.authorizedRooms = new Set<string>();
            next();
        } catch (error) {
            logger.warn("Socket", "Handshake authentication failed");
            next(new Error("unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const identity = socket.data.identity as SocketIdentity;
        logger.info("Socket", `Client connected: ${socket.id} (${identity.label})`);

        socket.on("disconnect", () => {
            logger.info("Socket", `Client disconnected: ${socket.id}`);
        });

        // Join a room for a specific WA instance — access is re-validated on every join.
        socket.on("join-session", async (sessionId: string, ack?: (r: unknown) => void) => {
            try {
                if (typeof sessionId !== "string" || !sessionId || sessionId.length > 64) {
                    ack?.({ ok: false, error: "invalid_instance" });
                    return;
                }
                const allowed = await canAccessInstance(identity, sessionId);
                if (!allowed) {
                    logger.warn("Socket", `Denied join-session for ${identity.label}`);
                    ack?.({ ok: false, error: "forbidden" });
                    return;
                }
                const room = await resolveInstanceRoom(sessionId);
                if (!room) {
                    ack?.({ ok: false, error: "not_found" });
                    return;
                }
                socket.join(room);
                (socket.data.authorizedRooms as Set<string>).add(room);
                ack?.({ ok: true, room });
            } catch (error) {
                logger.error("Socket", "join-session failed:", error);
                ack?.({ ok: false, error: "error" });
            }
        });

        // Notifications room — always derived from the authenticated identity.
        socket.on("join-user-room", (requestedUserId?: string, ack?: (r: unknown) => void) => {
            if (identity.isSuperAdmin && typeof requestedUserId === "string" && requestedUserId) {
                const room = userRoom(identity.tenantId, requestedUserId);
                socket.join(room);
                ack?.({ ok: true, room });
                return;
            }

            if (!identity.userId) {
                ack?.({ ok: false, error: "forbidden" });
                return;
            }
            // Ignore any client-supplied id that does not match the authenticated user.
            if (typeof requestedUserId === "string" && requestedUserId && requestedUserId !== identity.userId) {
                logger.warn("Socket", `Denied join-user-room impersonation attempt by ${identity.label}`);
                ack?.({ ok: false, error: "forbidden" });
                return;
            }

            const room = userRoom(identity.tenantId, identity.userId);
            socket.join(room);
            ack?.({ ok: true, room });
        });
    });
}
