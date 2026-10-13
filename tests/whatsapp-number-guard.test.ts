import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The number guard: an instance may only stay connected with the phone number
 * registered for it. A scan with a different SIM must be refused, its
 * credentials wiped and the session parked on NUMBER_MISMATCH (support flow).
 */

const { prismaMock, emitMock } = vi.hoisted(() => ({
    prismaMock: {
        session: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        authState: {
            deleteMany: vi.fn(),
        },
        $transaction: vi.fn(),
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
vi.mock("@/lib/quota", () => ({ assertSendQuota: vi.fn() }));
vi.mock("@/modules/whatsapp/antispam", () => ({ antispam: { enqueue: vi.fn() } }));

import type { WASocket } from "@whiskeysockets/baileys";
import type { Server } from "socket.io";
import { WhatsAppInstance } from "@/modules/whatsapp/instance";

function fakeSocket(userJid: string): WASocket {
    return {
        user: { id: userJid },
        ev: { removeAllListeners: vi.fn(), on: vi.fn() },
        end: vi.fn(),
        logout: vi.fn(),
        query: vi.fn(),
        sendMessage: vi.fn(),
    } as unknown as WASocket;
}

function makeInstance() {
    const instance = new WhatsAppInstance("sess-guard", "user-1", {} as Server);
    instance.socket = fakeSocket("554792701014:11@s.whatsapp.net");
    return instance;
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.session.findUnique.mockResolvedValue({
        botConfig: {},
        config: {},
        tenantId: null,
        linkedPhone: null,
        mismatchPhone: null,
    });
    prismaMock.authState.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("number guard on connection.open", () => {
    it("registers the number on the first successful connection", async () => {
        const instance = makeInstance();

        await instance.handleConnectionUpdate({ connection: "open" });

        expect(instance.status).toBe("CONNECTED");
        expect(instance.linkedPhone).toBe("4792701014");
        expect(prismaMock.session.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ linkedPhone: "4792701014", mismatchPhone: null }),
            })
        );
    });

    it("keeps the session connected when the scanned number matches", async () => {
        const instance = makeInstance();
        instance.linkedPhone = "554792701014";

        await instance.handleConnectionUpdate({ connection: "open" });

        expect(instance.status).toBe("CONNECTED");
        expect(instance.linkedPhone).toBe("554792701014");
        expect(instance.mismatchPhone).toBeNull();
    });

    it("rejects a scan with a different number and wipes its credentials", async () => {
        const instance = makeInstance();
        instance.linkedPhone = "4792701014";
        instance.socket = fakeSocket("5511999999999:11@s.whatsapp.net");

        await instance.handleConnectionUpdate({ connection: "open" });

        expect(instance.status).toBe("NUMBER_MISMATCH");
        expect(instance.mismatchPhone).toBe("11999999999");
        expect(instance.isStopped).toBe(true);
        expect(instance.socket).toBeNull();

        const updateCall = prismaMock.session.update.mock.calls.find(
            (call) => call[0]?.data?.status === "NUMBER_MISMATCH"
        );
        expect(updateCall).toBeTruthy();
        expect(updateCall?.[0].data.mismatchPhone).toBe("11999999999");

        expect(prismaMock.authState.deleteMany).toHaveBeenCalledWith({
            where: { sessionId: "sess-guard" },
        });

        const emitted = emitMock.mock.calls.find((call) => call[1] === "sess-guard");
        expect(emitted?.[3]).toMatchObject({ status: "NUMBER_MISMATCH", mismatchPhone: "11999999999" });
    });

    it("never validates against a LID (non-phone) connection id", async () => {
        const instance = makeInstance();
        instance.linkedPhone = "4792701014";
        instance.socket = fakeSocket("126126630420639:11@lid");

        await instance.handleConnectionUpdate({ connection: "open" });

        expect(instance.status).toBe("CONNECTED");
        expect(instance.linkedPhone).toBe("4792701014");
        expect(prismaMock.authState.deleteMany).not.toHaveBeenCalled();
    });
});
