import { prisma } from "@/lib/prisma";
import { WhatsAppInstance } from "./instance";
import { Server } from "socket.io";
import { logger } from "@/lib/logger";
import nodeCrypto from "node:crypto";
import { emitToInstance } from "@/lib/realtime";
import { createSessionWithCapacity } from "@/lib/commercial";

export class WhatsAppManager {
    private static instance: WhatsAppManager;
    private sessions: Map<string, WhatsAppInstance> = new Map();
    public io: Server | null = null;

    private constructor() {
    }

    public static getInstance(): WhatsAppManager {
        if (!WhatsAppManager.instance) {
            WhatsAppManager.instance = new WhatsAppManager();
        }
        return WhatsAppManager.instance;
    }

    setup(io: Server) {
        this.io = io;
    }

    async loadSessions() {
        if (!this.io) throw new Error("Socket.IO not initialized in WhatsAppManager");
        const sessions = await prisma.session.findMany({
            where: {
                status: { not: "LOGGED_OUT" }
            },
            select: { sessionId: true, userId: true, status: true }
        });

        let started = 0;
        for (const session of sessions) {
            // Only auto-init sessions that were CONNECTED before (have auth creds)
            const authCount = await prisma.authState.count({
                where: { sessionId: session.sessionId }
            });
            if (authCount === 0) {
                // No credentials â€” session was created but never connected
                // Set to STOPPED so it doesn't spam reconnect
                // NUMBER_MISMATCH has no creds on purpose (wrong scan was wiped)
                // and must survive restarts so the support panel stays visible.
                if (session.status !== "NUMBER_MISMATCH") {
                    await prisma.session.update({
                        where: { sessionId: session.sessionId },
                        data: { status: "STOPPED" }
                    }).catch((err) => logger.warn("Manager", `Failed to persist status for ${session.sessionId}:`, err));
                }
                continue;
            }

            const instance = new WhatsAppInstance(session.sessionId, session.userId, this.io);
            instance.onRemovedFromManager = () => this.removeInstance(session.sessionId, instance);
            this.sessions.set(session.sessionId, instance);
            await instance.init();
            started++;
        }
        logger.success("Manager", `Loaded ${started} sessions (${sessions.length - started} idle skipped).`);
    }

    async createSession(userId: string, name: string, customSessionId?: string, tenantId?: string) {
        if (!this.io && (global as any).io) {
            this.io = (global as any).io;
        }

        if (!this.io) {
            logger.error("Manager", "Socket.IO not initialized in WhatsAppManager");
            throw new Error("Socket.IO not initialized");
        }

        const sessionId = customSessionId || nodeCrypto.randomBytes(9).toString("base64url");

        // Always resolve the owning company so every instance is tenant-isolated.
        let ownerTenantId = tenantId ?? null;
        if (!ownerTenantId) {
            const membership = await prisma.tenantMember.findFirst({ where: { userId } });
            ownerTenantId = membership?.tenantId ?? null;
        }

        const session = await createSessionWithCapacity({
            tenantId: ownerTenantId ?? "",
            create: (tx) => tx.session.create({
              data: {
                userId,
                tenantId: ownerTenantId,
                name,
                sessionId,
                status: "STOPPED", // Default: stopped, user must click Start
                botConfig: {
                    create: {
                        enabled: true,
                        botMode: "OWNER",
                        autoReplyMode: "ALL"
                    }
                }
              }
            })
        });

        // Don't init socket â€” user clicks Start manually
        logger.info("Manager", `Session ${sessionId} created (STOPPED). User must click Start to connect.`);
        return session;
    }

    public getInstance(sessionId: string) {
        return this.sessions.get(sessionId);
    }

    /** Remove instance from memory manager (cleanup after stop/logout) */
    public removeInstance(sessionId: string, expected?: WhatsAppInstance) {
        const inst = this.sessions.get(sessionId);
        if (!inst) return;
        // A delayed `connection.close` from a replaced socket must never evict the
        // instance that took over the session.
        if (expected && inst !== expected) return;
        logger.info("Manager", `Removing session ${sessionId} from memory.`);
        this.sessions.delete(sessionId);
    }

    async deleteSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            await instance.shutdown();
            this.sessions.delete(sessionId);
        }
        await prisma.session.delete({ where: { sessionId } });
    }

    /**
     * Clean shutdown of every live instance (SIGTERM/SIGINT).
     * Detaches Baileys listeners and closes sockets without rewriting session
     * status in the DB, so the next boot re-connects them as before.
     */
    async shutdownAll() {
        const instances = [...this.sessions.entries()];
        this.sessions.clear();
        await Promise.allSettled(instances.map(([, instance]) => instance.shutdown()));
        logger.info("Manager", `Shut down ${instances.length} session(s).`);
    }

    async stopSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            // shutdown() detaches the Baileys listeners before closing the socket, so a
            // late `connection: 'close'` cannot re-write the DB or evict a replacement.
            await instance.shutdown();
            this.sessions.delete(sessionId);
        }
        emitToInstance(this.io, sessionId, "connection.update", { status: "STOPPED", qr: null });
        await prisma.session.update({
            where: { sessionId },
            data: { status: "STOPPED", qr: null }
        }).catch((err) => logger.warn("Manager", `Failed to persist status for ${sessionId}:`, err));
    }

    async startSession(sessionId: string) {
        const session = await prisma.session.findUnique({ where: { sessionId } });
        if (!session) throw new Error("Session not found");

        let instance = this.sessions.get(sessionId);
        if (!instance) {
            const created = new WhatsAppInstance(sessionId, session.userId, this.io!);
            created.onRemovedFromManager = () => this.removeInstance(sessionId, created);
            this.sessions.set(sessionId, created);
            instance = created;
        } else if (instance.status === "CONNECTED" && instance.socket) {
            // Already running with a live socket.
            return;
        }

        // init() disposes any previous socket, so calling it twice never opens two
        // connections with the same credentials, and it clears the stale QR.
        instance.isStopped = false;
        await instance.init();
    }

    async restartSession(sessionId: string) {
        await this.stopSession(sessionId);
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.startSession(sessionId);
    }

    async requestPairingCode(sessionId: string, phoneNumber: string) {
        const instance = this.sessions.get(sessionId);
        if (!instance) throw new Error("Instance not found or not running");
        return await instance.requestPairingCode(phoneNumber);
    }
}

const globalForWhatsapp = global as unknown as { waManager: WhatsAppManager };

export const waManager = globalForWhatsapp.waManager || WhatsAppManager.getInstance();

globalForWhatsapp.waManager = waManager;
