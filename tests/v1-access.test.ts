import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/woohub_test";

const { requiredScopeFor } = await import("@/lib/access");
const { idempotencyKey, requestFingerprint } = await import("@/lib/v1/idempotency");

describe("requiredScopeFor — rotas administrativas", () => {
    const adminRoutes: Array<[string, string]> = [
        ["GET", "/api/tenants"],
        ["POST", "/api/tenants"],
        ["PATCH", "/api/tenants/abc"],
        ["GET", "/api/plans"],
        ["GET", "/api/subscriptions"],
        ["GET", "/api/users"],
        ["GET", "/api/system/health"],
        ["GET", "/api/audit"],
        ["POST", "/api/payments/checkout"],
        ["POST", "/api/auth/session"],
    ];

    it.each(adminRoutes)("%s %s nunca aceita chave de cliente", (method, path) => {
        expect(requiredScopeFor(path, method)).toBeNull();
    });
});

describe("requiredScopeFor — API v1", () => {
    it("mensagens exigem leitura na leitura e envio na escrita", () => {
        expect(requiredScopeFor("/api/v1/instances/i1/messages", "GET")).toBe("messages:read");
        expect(requiredScopeFor("/api/v1/instances/i1/messages", "POST")).toBe("messages:send");
        expect(requiredScopeFor("/api/v1/instances/i1/messages/m1", "GET")).toBe("messages:read");
    });

    it("instâncias usam instances:read/write, incluindo connect/disconnect/qr", () => {
        expect(requiredScopeFor("/api/v1/instances", "GET")).toBe("instances:read");
        expect(requiredScopeFor("/api/v1/instances", "POST")).toBe("instances:write");
        expect(requiredScopeFor("/api/v1/instances/i1/connect", "POST")).toBe("instances:write");
        expect(requiredScopeFor("/api/v1/instances/i1/disconnect", "POST")).toBe("instances:write");
        expect(requiredScopeFor("/api/v1/instances/i1/qr", "GET")).toBe("instances:read");
    });

    it("webhooks: logs são sempre leitura; escrita exige webhooks:write", () => {
        expect(requiredScopeFor("/api/v1/webhooks/w1/logs", "GET")).toBe("webhooks:read");
        expect(requiredScopeFor("/api/v1/webhooks", "GET")).toBe("webhooks:read");
        expect(requiredScopeFor("/api/v1/webhooks", "POST")).toBe("webhooks:write");
        expect(requiredScopeFor("/api/v1/webhooks/w1", "DELETE")).toBe("webhooks:write");
    });

    it("usage só aceita leitura (escrita é administrativa)", () => {
        expect(requiredScopeFor("/api/v1/usage", "GET")).toBe("instances:read");
        expect(requiredScopeFor("/api/v1/usage", "POST")).toBeNull();
    });
});

describe("requiredScopeFor — rotas legadas", () => {
    it("leitura x escrita nos grupos principais", () => {
        expect(requiredScopeFor("/api/messages/s1/send", "POST")).toBe("messages:send");
        expect(requiredScopeFor("/api/chat/s1", "GET")).toBe("messages:read");
        expect(requiredScopeFor("/api/contacts/s1", "GET")).toBe("contacts:read");
        expect(requiredScopeFor("/api/contacts/s1", "POST")).toBe("instances:write");
        expect(requiredScopeFor("/api/sessions", "GET")).toBe("instances:read");
        expect(requiredScopeFor("/api/sessions", "POST")).toBe("instances:write");
    });

    it("rota desconhecida cai no padrão instances:read/write", () => {
        expect(requiredScopeFor("/api/qualquer-coisa", "GET")).toBe("instances:read");
        expect(requiredScopeFor("/api/qualquer-coisa", "DELETE")).toBe("instances:write");
    });
});

describe("idempotencyKey / requestFingerprint", () => {
    it("lê e normaliza o header Idempotency-Key", () => {
        const req = new NextRequest("http://localhost/api/v1/instances/i1/messages", {
            headers: { "Idempotency-Key": "  abc-123  " },
        });
        expect(idempotencyKey(req)).toBe("abc-123");
    });

    it("trunca chaves longas em 200 caracteres", () => {
        const req = new NextRequest("http://localhost/api/v1/instances/i1/messages", {
            headers: { "Idempotency-Key": "x".repeat(500) },
        });
        expect(idempotencyKey(req)?.length).toBe(200);
    });

    it("retorna null quando o header não existe", () => {
        const req = new NextRequest("http://localhost/api/v1/instances/i1/messages");
        expect(idempotencyKey(req)).toBeNull();
    });

    it("fingerprint é determinístico e sensível a cada parte", () => {
        const a = requestFingerprint(["POST", "/api/v1/instances/i1/messages", '{"text":"oi"}']);
        const b = requestFingerprint(["POST", "/api/v1/instances/i1/messages", '{"text":"oi"}']);
        const c = requestFingerprint(["POST", "/api/v1/instances/i1/messages", '{"text":"ola"}']);
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("distingue endpoints com o mesmo corpo", () => {
        expect(requestFingerprint(["POST", "/a", "x"])).not.toBe(requestFingerprint(["POST", "/b", "x"]));
    });
});
