import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for the WhatsApp lifecycle manager.
 *
 * They cover the two failure modes behind "the QR never comes back / scanning
 * does nothing":
 *   - a delayed `connection.close` from a replaced socket evicting the
 *     instance that took over the session;
 *   - an expired QR surviving a stop/start cycle because it was never cleared.
 */

const { prismaMock, emitMock } = vi.hoisted(() => ({
    prismaMock: {
        session: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
    emitMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/realtime", () => ({
    emitToInstance: emitMock,
    resolveInstanceRoom: vi.fn(),
    instanceRoom: vi.fn(),
    userRoom: vi.fn(),
}));

vi.mock("@/modules/whatsapp/instance", () => {
    class FakeInstance {
        sessionId: string;
        userId: string;
        io: unknown;
        socket: unknown = null;
        qr: string | null = null;
        qrGeneratedAt: number | null = null;
        status = "DISCONNECTED";
        isStopped = false;
        pairingCode: string | null = null;
        onRemovedFromManager: (() => void) | null = null;
        initCalls = 0;
        shutdownCalls = 0;

        constructor(sessionId: string, userId: string, io: unknown) {
            this.sessionId = sessionId;
            this.userId = userId;
            this.io = io;
        }

        async init() {
            this.initCalls++;
        }

        async shutdown() {
            this.shutdownCalls++;
            this.isStopped = true;
            this.status = "STOPPED";
            this.qr = null;
            this.qrGeneratedAt = null;
        }
    }
    return { WhatsAppInstance: FakeInstance };
});

import { waManager, WhatsAppManager } from "@/modules/whatsapp/manager";

/** Shape of the fake instance returned by the mocked module above. */
type FakeInstanceHandle = {
    socket: unknown;
    qr: string | null;
    qrGeneratedAt: number | null;
    status: string;
    isStopped: boolean;
    pairingCode: string | null;
    onRemovedFromManager: (() => void) | null;
    initCalls: number;
    shutdownCalls: number;
};

function instanceOf(sessionId: string): FakeInstanceHandle | undefined {
    return waManager.getInstance(sessionId) as unknown as FakeInstanceHandle | undefined;
}

function requireInstance(sessionId: string): FakeInstanceHandle {
    const instance = instanceOf(sessionId);
    if (!instance) throw new Error(`expected an in-memory instance for ${sessionId}`);
    return instance;
}

beforeEach(() => {
    vi.clearAllMocks();
    (waManager as unknown as { sessions: Map<string, unknown> }).sessions.clear();
    prismaMock.session.findUnique.mockImplementation(async ({ where }: { where: { sessionId: string } }) => ({
        id: "db-row-id",
        userId: "user-1",
        sessionId: where.sessionId,
        status: "STOPPED",
        qr: null,
    }));
    prismaMock.session.update.mockResolvedValue({});
});

describe("WhatsAppManager.removeInstance", () => {
    it("only evicts the instance it was called on", async () => {
        const id = "identity-guard";
        await waManager.startSession(id);
        const first = requireInstance(id);

        await waManager.stopSession(id);
        expect(instanceOf(id)).toBeUndefined();

        await waManager.startSession(id);
        const second = requireInstance(id);
        expect(second).not.toBe(first);

        // The old socket's `connection.close` lands after the replacement started.
        first.onRemovedFromManager?.();

        expect(instanceOf(id)).toBe(second);
    });

    it("removes the instance when it is still the current one", async () => {
        const id = "current-owner";
        await waManager.startSession(id);
        const instance = requireInstance(id);

        instance.onRemovedFromManager?.();

        expect(instanceOf(id)).toBeUndefined();
    });

    it("is a no-op when the session is already gone", () => {
        expect(() => waManager.removeInstance("never-existed")).not.toThrow();
    });
});

describe("WhatsAppManager.stopSession", () => {
    it("shuts the instance down, clears the QR and drops it from memory", async () => {
        const id = "stop-clears-qr";
        await waManager.startSession(id);
        const instance = requireInstance(id);
        instance.qr = "expired-qr-value";
        instance.qrGeneratedAt = Date.now();
        instance.status = "SCAN_QR";

        await waManager.stopSession(id);

        expect(instance.shutdownCalls).toBe(1);
        expect(instance.qr).toBeNull();
        expect(instanceOf(id)).toBeUndefined();
        expect(prismaMock.session.update).toHaveBeenCalledWith({
            where: { sessionId: id },
            data: { status: "STOPPED", qr: null },
        });
        const [, emittedSessionId, event, payload] = emitMock.mock.calls[0] ?? [];
        expect(emittedSessionId).toBe(id);
        expect(event).toBe("connection.update");
        expect(payload).toEqual({ status: "STOPPED", qr: null });
    });

    it("still marks the row as stopped when nothing is in memory", async () => {
        const id = "stop-without-instance";

        await waManager.stopSession(id);

        expect(prismaMock.session.update).toHaveBeenCalledWith({
            where: { sessionId: id },
            data: { status: "STOPPED", qr: null },
        });
    });
});

describe("WhatsAppManager.startSession", () => {
    it("reuses the running instance instead of opening a second connection", async () => {
        const id = "reuse-existing";
        await waManager.startSession(id);
        const instance = requireInstance(id);

        instance.isStopped = true;
        await waManager.startSession(id);

        expect(instanceOf(id)).toBe(instance);
        expect(instance.initCalls).toBe(2);
        expect(instance.isStopped).toBe(false);
    });

    it("is a no-op when the instance is connected with a live socket", async () => {
        const id = "already-connected";
        await waManager.startSession(id);
        const instance = requireInstance(id);
        instance.status = "CONNECTED";
        instance.socket = { user: {} };

        await waManager.startSession(id);

        expect(instance.initCalls).toBe(1);
        expect(instanceOf(id)).toBe(instance);
    });

    it("re-initialises a CONNECTED instance whose socket already died", async () => {
        const id = "stale-socket";
        await waManager.startSession(id);
        const instance = requireInstance(id);
        instance.status = "CONNECTED";
        instance.socket = null;

        await waManager.startSession(id);

        expect(instance.initCalls).toBe(2);
        expect(instanceOf(id)).toBe(instance);
    });

    it("throws when the session row does not exist", async () => {
        prismaMock.session.findUnique.mockImplementation(async () => null);

        await expect(waManager.startSession("missing")).rejects.toThrow("Session not found");
        expect(instanceOf("missing")).toBeUndefined();
    });
});

describe("WhatsAppManager.restartSession", () => {
    it("replaces the instance and leaves no stale QR behind", async () => {
        const id = "regenerate-qr";
        await waManager.startSession(id);
        const first = requireInstance(id);
        first.qr = "expired-qr-value";
        first.status = "SCAN_QR";

        await waManager.restartSession(id);

        const second = requireInstance(id);
        expect(second).not.toBe(first);
        expect(second.qr).toBeNull();
        expect(prismaMock.session.update).toHaveBeenCalledWith({
            where: { sessionId: id },
            data: { status: "STOPPED", qr: null },
        });
    });

    it("starts the session again even when nothing was running", async () => {
        const id = "restart-cold";

        await waManager.restartSession(id);

        expect(instanceOf(id)).toBeTruthy();
    });
});

describe("WhatsAppManager singleton", () => {
    it("always returns the same manager", () => {
        expect(WhatsAppManager.getInstance()).toBe(waManager);
    });
});
