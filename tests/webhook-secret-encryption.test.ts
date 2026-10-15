import { describe, it, expect } from "vitest";
import {
    encryptWebhookSecret,
    decryptWebhookSecret,
    redactWebhook,
} from "@/lib/webhook";

describe("Webhook secret at-rest encryption", () => {
    it("encrypts a plaintext secret bound to the webhook id (AAD)", () => {
        const id = "wh-123";
        const plain = "super-secret-hmac-key";
        const encrypted = encryptWebhookSecret(id, plain);
        expect(encrypted).toBeTruthy();
        expect(encrypted).not.toContain(plain);
        expect(encrypted!.startsWith("v1.")).toBe(true);
        expect(decryptWebhookSecret(id, encrypted)).toBe(plain);
    });

    it("fails to decrypt with a different webhook id (AAD mismatch)", () => {
        const encrypted = encryptWebhookSecret("wh-1", "secret-value");
        expect(decryptWebhookSecret("wh-2", encrypted)).toBeNull();
    });

    it("is idempotent (already-encrypted values are left as-is)", () => {
        const once = encryptWebhookSecret("wh-a", "key-1")!;
        const twice = encryptWebhookSecret("wh-a", once)!;
        expect(twice).toBe(once);
    });

    it("returns null for empty/null secrets", () => {
        expect(encryptWebhookSecret("wh-a", null)).toBeNull();
        expect(encryptWebhookSecret("wh-a", undefined)).toBeNull();
        expect(encryptWebhookSecret("wh-a", "")).toBeNull();
        expect(decryptWebhookSecret("wh-a", null)).toBeNull();
        expect(decryptWebhookSecret("wh-a", undefined)).toBeNull();
        expect(decryptWebhookSecret("wh-a", "")).toBeNull();
    });

    it("accepts legacy plaintext secrets (backward compat)", () => {
        // Rows written before encryption was introduced keep working.
        expect(decryptWebhookSecret("wh-legacy", "plain-old-secret")).toBe("plain-old-secret");
    });

    it("fails closed on a tampered envelope", () => {
        const encrypted = encryptWebhookSecret("wh-t", "original")!;
        const parts = encrypted.split(".");
        // Corrupt the ciphertext segment
        parts[4] = Buffer.from("tampered-ciphertext").toString("base64url");
        const tampered = parts.join(".");
        expect(decryptWebhookSecret("wh-t", tampered)).toBeNull();
    });

    it("redactWebhook strips the secret and exposes only secret_configured", () => {
        const row = {
            id: "wh-1",
            name: "Test",
            url: "https://example.com/hook",
            secret: encryptWebhookSecret("wh-1", "s3cret")!,
            events: ["message.received"],
            isActive: true,
        };
        const out = redactWebhook(row) as typeof row & { secret_configured: boolean };
        expect("secret" in out).toBe(false);
        expect(out.secret_configured).toBe(true);

        const noSecret = redactWebhook({ ...row, secret: null }) as typeof row & { secret_configured: boolean };
        expect(noSecret.secret_configured).toBe(false);
    });
});
