import { describe, it, expect } from "vitest";
import {
    base32Encode,
    base32Decode,
    generateTotpSecret,
    totpAt,
    verifyTotp,
    otpauthUri,
    encryptTotpSecret,
    decryptTotpSecret,
    isAdminRole,
    mfaRequiredForAdmins,
} from "@/lib/mfa";

describe("MFA TOTP", () => {
    it("base32 encode/decode roundtrips", () => {
        const buf = Buffer.from("Hello World!!", "utf-8");
        const encoded = base32Encode(buf);
        expect(encoded).toMatch(/^[A-Z2-7]+$/);
        expect(base32Decode(encoded).equals(buf)).toBe(true);
    });

    it("base32 decode rejects invalid characters", () => {
        expect(() => base32Decode("ABC1!")).toThrow(/Invalid base32/);
    });

    it("generates a 32-char base32 secret (160 bits)", () => {
        const secret = generateTotpSecret();
        expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    });

    it("verifies correct TOTP codes within clock skew", () => {
        const secret = generateTotpSecret();
        const now = Date.now();
        const code = totpAt(secret, now);
        expect(code).toMatch(/^\d{6}$/);
        expect(verifyTotp(secret, code, now)).toBe(true);
    });

    it("rejects wrong codes", () => {
        const secret = generateTotpSecret();
        const now = Date.now();
        const code = totpAt(secret, now);
        // Flip a digit
        const wrong = String((parseInt(code, 10) + 1) % 1_000_000).padStart(6, "0");
        expect(verifyTotp(secret, wrong, now)).toBe(false);
    });

    it("rejects malformed codes", () => {
        const secret = generateTotpSecret();
        expect(verifyTotp(secret, "", Date.now())).toBe(false);
        expect(verifyTotp(secret, "12345", Date.now())).toBe(false);
        expect(verifyTotp(secret, "abcdef", Date.now())).toBe(false);
    });

    it("accepts ±1 time-step drift", () => {
        const secret = generateTotpSecret();
        const step = 30_000;
        const now = 1_700_000_000_000;
        // Code from previous step should still verify within skew
        const prevCode = totpAt(secret, now - step);
        expect(verifyTotp(secret, prevCode, now)).toBe(true);
        const nextCode = totpAt(secret, now + step);
        expect(verifyTotp(secret, nextCode, now)).toBe(true);
    });

    it("otpauth URI has correct format", () => {
        const secret = generateTotpSecret();
        const uri = otpauthUri(secret, "user@example.com", "Woohub");
        expect(uri).toMatch(/^otpauth:\/\/totp\/Woohub%3Auser%40example\.com\?/);
        expect(uri).toContain(`secret=${secret}`);
        expect(uri).toContain("issuer=Woohub");
        expect(uri).toContain("algorithm=SHA1");
        expect(uri).toContain("digits=6");
        expect(uri).toContain("period=30");
    });

    it("encrypts/decrypts secret bound to user id (AAD)", () => {
        const userId = "user-abc";
        const secret = generateTotpSecret();
        const encrypted = encryptTotpSecret(userId, secret);
        expect(encrypted).not.toContain(secret);
        expect(decryptTotpSecret(userId, encrypted)).toBe(secret);
    });

    it("fails to decrypt with wrong user id (AAD mismatch)", () => {
        const secret = generateTotpSecret();
        const encrypted = encryptTotpSecret("user-abc", secret);
        expect(() => decryptTotpSecret("user-xyz", encrypted)).toThrow();
    });

    it("accepts legacy plaintext secrets (backward compat)", () => {
        const userId = "user-legacy";
        const secret = generateTotpSecret();
        // Not encrypted — stored as-is before the migration
        expect(decryptTotpSecret(userId, secret)).toBe(secret);
    });

    it("isAdminRole recognizes MEGA_ADMIN and SUPERADMIN", () => {
        expect(isAdminRole("MEGA_ADMIN")).toBe(true);
        expect(isAdminRole("SUPERADMIN")).toBe(true);
        expect(isAdminRole("OWNER")).toBe(false);
        expect(isAdminRole("USER")).toBe(false);
    });

    it("mfaRequiredForAdmins reads env flag", () => {
        const prev = process.env.MFA_REQUIRED_FOR_ADMINS;
        try {
            delete process.env.MFA_REQUIRED_FOR_ADMINS;
            expect(mfaRequiredForAdmins()).toBe(false);
            process.env.MFA_REQUIRED_FOR_ADMINS = "true";
            expect(mfaRequiredForAdmins()).toBe(true);
            process.env.MFA_REQUIRED_FOR_ADMINS = "false";
            expect(mfaRequiredForAdmins()).toBe(false);
        } finally {
            if (prev === undefined) delete process.env.MFA_REQUIRED_FOR_ADMINS;
            else process.env.MFA_REQUIRED_FOR_ADMINS = prev;
        }
    });
});
