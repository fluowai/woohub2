import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { usePrismaAuthState } from "./auth/usePrismaAuthState";
import { Server } from "socket.io";
import pino from "pino";
import { bindSessionStore } from "./store";
import { syncGroups } from "./store/groups";
import { bindContactSync } from "./store/contacts";
import { bindAutoReply } from "./store/autoreply";
import { bindPpGuard } from "./store/ppguard";
import { antispam } from "./antispam";
import { logger } from "@/lib/logger";
import { emitToInstance } from "@/lib/realtime";
import { assertSendQuota } from "@/lib/quota";
import { normalizePhone, phoneFromJid, samePhone } from "@/lib/phone";

const MAX_RECONNECT_ATTEMPTS = 3;

export class WhatsAppInstance {
    socket: WASocket | null = null;
    qr: string | null = null;
    /** When the in-memory QR was produced. Baileys rotates the code every ~20s. */
    qrGeneratedAt: number | null = null;
    rq: string | null = null;
    status: string = "DISCONNECTED";
    sessionId: string;
    userId: string;
    io: Server;
    config: any = {};
    startTime: Date | null = null;
    pairingCode: string | null = null;
    /** Company that owns this instance (plan quotas). Loaded once at init. */
    tenantId: string | null = null;
    /** Number (digits only) this instance is allowed to connect with. */
    linkedPhone: string | null = null;
    /** Last scanned number that did not match `linkedPhone`. */
    mismatchPhone: string | null = null;

    isStopped: boolean = false;
    private reconnectCount: number = 0;
    /**
     * Incremented on every socket disposal. `connection.update` events from a
     * socket belonging to a previous generation are dropped, so a late `close`
     * can never wipe the QR/status of the instance that replaced it.
     */
    private gen: number = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    /** Called when instance auto-stops or logs out â€” lets manager remove it from Map */
    onRemovedFromManager: (() => void) | null = null;

    constructor(sessionId: string, userId: string, io: Server) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.io = io;
    }

    /**
     * Detach and close the current socket, bumping `gen` so any event already in
     * flight from it becomes a no-op. Baileys only emits `connection: 'close'`
     * after `end()` finishes its WebSocket teardown (which can take seconds), so
     * without this a stop/restart would race against the replacement instance.
     */
    private disposeSocket() {
        this.gen++;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            try {
                socket.ev.removeAllListeners("connection.update");
            } catch { /* ignore */ }
            Promise.resolve(socket.end(undefined)).catch(() => { /* ignore */ });
        }
    }

    async init() {
        // Never keep two Baileys sockets alive for the same credentials: WhatsApp
        // invalidates the pair and reports `loggedOut` right after the scan.
        this.disposeSocket();
        const gen = this.gen;
        this.isStopped = false;
        this.reconnectCount = 0;
        this.qr = null;
        this.qrGeneratedAt = null;
        this.pairingCode = null;

        const sessionData = await prisma.session.findUnique({
            where: { sessionId: this.sessionId },
            include: { botConfig: true }
        });
        if (!sessionData) {
            logger.warn("Instance", `Session ${this.sessionId} not found in DB, aborting init`);
            return;
        }
        this.config = sessionData?.config || {};
        this.tenantId = sessionData.tenantId;
        this.linkedPhone = normalizePhone(sessionData.linkedPhone) || null;
        this.mismatchPhone = normalizePhone(sessionData.mismatchPhone) || null;
        const botConfig = (sessionData as any)?.botConfig;

        // Any previously persisted QR is dead as soon as we open a new connection.
        await prisma.session.update({
            where: { sessionId: this.sessionId },
            data: { qr: null }
        }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));

        const { state, saveCreds } = await usePrismaAuthState(this.sessionId);
        const { version } = await fetchLatestBaileysVersion();

        this.socket = makeWASocket({
            version,
            logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" }) as any,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" }) as any),
            },
            // Identidade exibida pelo WhatsApp ao usuário. Mantemos a marca
            // WooHub em vez de expor o ambiente técnico de execução.
            browser: ["WooHub", "Desktop", "1.0.0"],
            markOnlineOnConnect: botConfig?.alwaysOnline ?? true,
            // Full history sync consumes large amounts of RAM (can OOM the process
            // with busy sessions). Messages are persisted via the store on receive.
            syncFullHistory: false,
        });

        // Plan send quota, then anti-spam, then the engine.
        const originalSendMessage = this.socket.sendMessage.bind(this.socket);
        const sessionId = this.sessionId;
        const tenantIdOf = () => this.tenantId;
        this.socket.sendMessage = async function (jid: string, content: any, options?: any) {
            await assertSendQuota(tenantIdOf());
            await antispam.enqueue(sessionId, jid, content);
            return originalSendMessage(jid, content, options);
        } as any;

        // Bind Store for DB Sync
        bindSessionStore(this.socket, this.sessionId, this.io);

        // Bind Contact Sync
        bindContactSync(this.socket, this.sessionId);

        this.socket.ev.on("creds.update", () => {
                saveCreds().catch((error) => {
                    logger.error("Auth", `Credential persistence failed for ${this.sessionId}:`, error);
                });
            });

        this.socket.ev.on("connection.update", async (update) => {
            if (gen !== this.gen) return; // stale socket: a newer connection owns this instance
            await this.handleConnectionUpdate(update, gen);
        });
    }

    async handleConnectionUpdate(update: Partial<ConnectionState>, gen?: number) {
        if (gen !== undefined && gen !== this.gen) return;
        const { connection, lastDisconnect, qr } = update;

        try {
            if (qr) {
                if (this.isStopped) return;
                // Reset reconnect count on new QR (user is re-scanning)
                this.reconnectCount = 0;
                this.qr = qr;
                this.qrGeneratedAt = Date.now();
                this.status = "SCAN_QR";

                emitToInstance(this.io, this.sessionId, "connection.update", { status: this.status, qr });

                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { qr, status: "SCAN_QR" }
                });
            }

            if (connection === "close") {
                // Baileys only emits this from inside `end()`, so the socket is dead now.
                this.socket = null;
                const code = (lastDisconnect?.error as any)?.output?.statusCode;
                const isLoggedOut = code === DisconnectReason.loggedOut;

                if (isLoggedOut) {
                    // Logged out: stop permanently, remove from memory
                    this.status = "LOGGED_OUT";
                    this.socket = null;
                    this.config = {};
                    emitToInstance(this.io, this.sessionId, "connection.update", { status: "LOGGED_OUT", qr: null });

                    logger.info("Instance", `Session ${this.sessionId} logged out. Deleting credentials...`);
                    try {
                        await prisma.$transaction([
                            prisma.session.update({
                                where: { sessionId: this.sessionId },
                                data: { status: "LOGGED_OUT", qr: null }
                            }),
                            prisma.authState.deleteMany({
                                where: { sessionId: this.sessionId }
                            })
                        ]);
                    } catch (e) { /* ignore */ }
                    logger.success("Instance", `Session ${this.sessionId} credentials deleted.`);

                    // Remove from memory manager
                    this.onRemovedFromManager?.();
                    return;
                }

                if (this.isStopped) {
                    // Explicitly stopped: preserve creds for restart
                    this.status = "STOPPED";
                    this.socket = null;
                    this.reconnectCount = 0;
                    emitToInstance(this.io, this.sessionId, "connection.update", { status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));
                    logger.warn("Instance", `Session ${this.sessionId} stopped. Credentials preserved.`);

                    // Remove from memory manager (identity-checked: never evicts a replacement)
                    this.onRemovedFromManager?.();
                    return;
                }

                // Unexpected disconnect: retry with limit
                this.reconnectCount++;
                const remaining = MAX_RECONNECT_ATTEMPTS - this.reconnectCount + 1;

                if (remaining > 0) {
                    this.status = "DISCONNECTED";
                    this.qr = null;
                    this.qrGeneratedAt = null;
                    emitToInstance(this.io, this.sessionId, "connection.update", { status: "DISCONNECTED", qr: null });
                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "DISCONNECTED", qr: null }
                    }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));

                    logger.warn("Instance",
                        `Session ${this.sessionId} disconnected. Reconnecting (${this.reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`
                    );
                    const gen = this.gen;
                    this.reconnectTimer = setTimeout(() => {
                        if (gen !== this.gen || this.isStopped) return;
                        this.reconnectTimer = null;
                        this.init().catch((e) => logger.error("Instance", "Reconnect failed:", e));
                    }, 3000);
                } else {
                    // Max retries exceeded â€” auto-stop
                    this.status = "STOPPED";
                    this.qr = null;
                    this.qrGeneratedAt = null;
                    this.reconnectCount = 0;
                    this.isStopped = true; // prevent further retries
                    emitToInstance(this.io, this.sessionId, "connection.update", { status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));
                    logger.error("Instance",
                        `Session ${this.sessionId} max reconnects (${MAX_RECONNECT_ATTEMPTS}) reached. Auto-stopped.`
                    );

                    // Remove from memory manager
                    this.onRemovedFromManager?.();
                }
            }

            if (connection === "open") {
                const connectedPhone = phoneFromJid(this.socket?.user?.id);

                if (connectedPhone && this.linkedPhone && !samePhone(this.linkedPhone, connectedPhone)) {
                    // Scanned a different SIM: refuse the session, wipe the creds it
                    // just wrote and park the instance on the support flow.
                    await this.rejectNumberMismatch(connectedPhone);
                    return;
                }

                if (connectedPhone && !this.linkedPhone) {
                    // First successful connection registers the number permanently.
                    this.linkedPhone = connectedPhone;
                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { linkedPhone: connectedPhone, mismatchPhone: null }
                    }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));
                }

                // Connected â€” reset reconnect count
                this.reconnectCount = 0;
                this.isStopped = false;
                this.status = "CONNECTED";
                this.qr = null;
                this.qrGeneratedAt = null;
                this.mismatchPhone = null;
                this.startTime = new Date();

                emitToInstance(this.io, this.sessionId, "connection.update", { status: "CONNECTED", qr: null });

                // Persist the connected status first: a failure inside the optional
                // bindings must not leave the session stuck in SCAN_QR.
                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { status: "CONNECTED", qr: null, mismatchPhone: null }
                });

                try {
                    await syncGroups(this.socket as WASocket, this.sessionId);
                } catch (e) {
                    logger.error("Instance", "Group sync failed:", e);
                }

                try {
                    bindAutoReply(this.socket as WASocket, this.sessionId);
                    bindPpGuard(this.socket as WASocket, this.sessionId);
                } catch (e) {
                    logger.error("Instance", "Handler binding failed:", e);
                }

                logger.success("Instance", `Session ${this.sessionId} connected and synced successfully`);
            }
        } catch (error: any) {
            if (error.code === 'P2025') {
                logger.warn("Instance", `Session ${this.sessionId} record not found during update. Stopping.`);
                this.disposeSocket();
            } else {
                logger.error("Instance", "Error in handleConnectionUpdate:", error);
            }
        }
    }

    /**
     * The scanned number does not match the registered one: drop the socket and
     * its credentials so the wrong number can never stay logged in, and expose
     * `NUMBER_MISMATCH` so the dashboard routes the owner to support.
     */
    private async rejectNumberMismatch(scannedPhone: string) {
        this.status = "NUMBER_MISMATCH";
        this.mismatchPhone = scannedPhone;
        this.isStopped = true;
        this.reconnectCount = 0;
        this.qr = null;
        this.qrGeneratedAt = null;
        this.pairingCode = null;
        this.startTime = null;
        this.disposeSocket();

        emitToInstance(this.io, this.sessionId, "connection.update", {
            status: this.status,
            qr: null,
            linkedPhone: this.linkedPhone,
            mismatchPhone: scannedPhone
        });

        try {
            await prisma.$transaction([
                prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { status: "NUMBER_MISMATCH", qr: null, mismatchPhone: scannedPhone }
                }),
                prisma.authState.deleteMany({
                    where: { sessionId: this.sessionId }
                })
            ]);
        } catch (e) {
            logger.error("Instance", `Failed to persist number mismatch for ${this.sessionId}:`, e);
        }

        logger.warn("Instance",
            `Session ${this.sessionId} scanned ${scannedPhone}, registered number is ${this.linkedPhone}. Rejected: support panel required.`
        );
    }

    async requestPairingCode(phoneNumber: string) {
        if (!this.socket) {
            throw new Error("Socket not initialized");
        }

        try {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            if (!cleanNumber) throw new Error("Invalid phone number");

            if (this.linkedPhone && !samePhone(this.linkedPhone, cleanNumber)) {
                const error = new Error(
                    `Numero informado difere do numero registrado (${this.linkedPhone}).`
                ) as Error & { code: string };
                error.code = "NUMBER_MISMATCH";
                throw error;
            }

            const code = await this.socket.requestPairingCode(cleanNumber);
            if (!this.linkedPhone) {
                this.linkedPhone = normalizePhone(cleanNumber);
                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { linkedPhone: this.linkedPhone }
                }).catch((err) => logger.warn("Instance", `Failed to persist session state for ${this.sessionId}:`, err));
            }
            this.pairingCode = code;
            this.status = "SCAN_QR";

            emitToInstance(this.io, this.sessionId, "connection.update", {
                status: this.status,
                qr: this.qr,
                pairingCode: code
            });

            return code;
        } catch (error) {
            logger.error("Instance", "Pairing code error:", error);
            throw error;
        }
    }

    /** Clean shutdown without triggering reconnect */
    async shutdown() {
        this.isStopped = true;
        this.status = "STOPPED";
        this.qr = null;
        this.qrGeneratedAt = null;
        this.reconnectCount = 0;
        this.disposeSocket();
    }
}
