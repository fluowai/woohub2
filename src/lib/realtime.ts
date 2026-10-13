import type { Server } from "socket.io";
import { prisma } from "./prisma";
import { logger } from "./logger";

/**
 * Room naming and emission helpers.
 *
 * Room names are always tenant-scoped so a socket can only ever receive events for the
 * company it authenticated as:
 *   instance room:  i:<tenantId>:<sessionPk>
 *   user room:      u:<tenantId>:<userId>
 *
 * A short-lived cache maps the WhatsApp Engine instance id (used by every emit site) to its room.
 */

interface CachedRoom {
    room: string;
    expires: number;
}

const instanceRooms = new Map<string, CachedRoom>();
const TTL_MS = 60_000;

export function instanceRoom(sessionPk: string, tenantId: string | null): string {
    return `i:${tenantId ?? "legacy"}:${sessionPk}`;
}

export function userRoom(tenantId: string | null | undefined, userId: string): string {
    return `u:${tenantId ?? "legacy"}:${userId}`;
}

export function cacheInstanceRoom(sessionIdOrPk: string, room: string): void {
    instanceRooms.set(sessionIdOrPk, { room, expires: Date.now() + TTL_MS });
}

export function invalidateInstanceRoom(sessionIdOrPk?: string): void {
    if (sessionIdOrPk) {
        instanceRooms.delete(sessionIdOrPk);
        return;
    }
    instanceRooms.clear();
}

/** Resolves the tenant-scoped room for an instance id (WhatsApp Engine sessionId or CUID). */
export async function resolveInstanceRoom(sessionIdOrPk: string): Promise<string | null> {
    const cached = instanceRooms.get(sessionIdOrPk);
    if (cached && cached.expires > Date.now()) return cached.room;

    const session = await prisma.session.findFirst({
        where: { OR: [{ sessionId: sessionIdOrPk }, { id: sessionIdOrPk }] },
        select: { id: true, sessionId: true, tenantId: true },
    });
    if (!session) return null;

    const room = instanceRoom(session.id, session.tenantId);
    cacheInstanceRoom(session.sessionId, room);
    cacheInstanceRoom(session.id, room);
    return room;
}

/** Emits an event to everyone authorized to see this instance. */
export async function emitToInstance(
    io: Server | null | undefined,
    sessionIdOrPk: string,
    event: string,
    payload: unknown
): Promise<void> {
    if (!io) return;
    try {
        const room = await resolveInstanceRoom(sessionIdOrPk);
        if (!room) return;
        io.to(room).emit(event, payload);
    } catch (error) {
        logger.error("Realtime", `Failed to emit ${event} for ${sessionIdOrPk}:`, error);
    }
}

/** Emits an event to a specific user's tenant-scoped room. */
export async function emitToUser(
    io: Server | null | undefined,
    tenantId: string | null | undefined,
    userId: string,
    event: string,
    payload: unknown
): Promise<void> {
    if (!io) return;
    try {
        io.to(userRoom(tenantId, userId)).emit(event, payload);
    } catch (error) {
        logger.error("Realtime", `Failed to emit ${event} to user ${userId}:`, error);
    }
}

/**
 * Emits an event to a user's room resolving their tenant first.
 * Used by notification fan-out where only the user id is known.
 */
export async function emitToUserRoom(
    io: Server | null | undefined,
    userId: string,
    event: string,
    payload: unknown
): Promise<void> {
    if (!io) return;
    try {
        const membership = await prisma.tenantMember.findFirst({
            where: { userId },
            select: { tenantId: true },
        });
        io.to(userRoom(membership?.tenantId ?? null, userId)).emit(event, payload);
    } catch (error) {
        logger.error("Realtime", `Failed to emit ${event} to user ${userId}:`, error);
    }
}

/**
 * Force-disconnects every socket from an instance room. Called when access is revoked,
 * an instance is deleted or a company loses access.
 */
export async function revokeInstanceRoom(io: Server | null | undefined, sessionIdOrPk: string): Promise<void> {
    if (!io) return;
    try {
        const room = await resolveInstanceRoom(sessionIdOrPk);
        invalidateInstanceRoom(sessionIdOrPk);
        if (!room) return;
        const sockets = await io.in(room).fetchSockets();
        for (const socket of sockets) {
            socket.leave(room);
            const authorized = socket.data?.authorizedRooms as Set<string> | undefined;
            authorized?.delete(room);
        }
        logger.info("Realtime", `Revoked ${sockets.length} socket(s) from instance room`);
    } catch (error) {
        logger.error("Realtime", "Failed to revoke instance room:", error);
    }
}
