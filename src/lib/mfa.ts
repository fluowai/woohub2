import crypto from "node:crypto";
import { encryptSecret, decryptSecret, isEncrypted } from "./security/crypto";

/**
 * TOTP (RFC 6238) for admin MFA — no external dependency.
 *
 * - 30s period, 6 digits, SHA-1 (Google Authenticator compatible)
 * - Secret is generated as 20 random bytes, base32-encoded for the otpauth URI
 * - Stored AES-256-GCM encrypted (AAD binds the secret to the user id)
 * - Verification accepts ±1 time step to tolerate clock skew
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const TOTP_STEP_SKEW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

export function base32Decode(input: string): Buffer {
    const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = BASE32_ALPHABET.indexOf(ch);
        if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/** Generates a new random base32 secret (160 bits, RFC 4226 recommendation). */
export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf: Buffer, counter: number, digits = TOTP_DIGITS): string {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac("sha1", secretBuf).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 10 ** digits).padStart(digits, "0");
}

export function totpAt(secretBase32: string, timestampMs = Date.now()): string {
    const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
    return hotp(base32Decode(secretBase32), counter);
}

/** Verifies a 6-digit code, allowing ±1 time-step drift. */
export function verifyTotp(secretBase32: string, token: string, timestampMs = Date.now()): boolean {
    const code = token.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) return false;

    const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
    const secretBuf = base32Decode(secretBase32);
    for (let delta = -TOTP_STEP_SKEW; delta <= TOTP_STEP_SKEW; delta++) {
        if (hotp(secretBuf, counter + delta) === code) return true;
    }
    return false;
}

/** otpauth:// URI for QR-code enrollment (Google Authenticator / Authy compatible). */
export function otpauthUri(secretBase32: string, accountEmail: string, issuer = "Woohub"): string {
    const label = encodeURIComponent(`${issuer}:${accountEmail}`);
    const params = new URLSearchParams({
        secret: secretBase32,
        issuer,
        algorithm: "SHA1",
        digits: String(TOTP_DIGITS),
        period: String(TOTP_PERIOD_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

function secretAad(userId: string): string {
    return `mfa:${userId}`;
}

/** Encrypts the TOTP secret for storage (AES-256-GCM, bound to the user id). */
export function encryptTotpSecret(userId: string, secretBase32: string): string {
    return encryptSecret(secretBase32, secretAad(userId));
}

/** Decrypts a stored TOTP secret. Accepts legacy plaintext (re-encrypted on next write). */
export function decryptTotpSecret(userId: string, stored: string): string {
    if (isEncrypted(stored)) {
        return decryptSecret(stored, secretAad(userId));
    }
    return stored;
}

/** Admin roles for which MFA is supported/recommended. */
export function isAdminRole(role: string): boolean {
    return role === "MEGA_ADMIN" || role === "SUPERADMIN";
}

/** True when the deployment requires admins to have MFA enrolled. */
export function mfaRequiredForAdmins(): boolean {
    return process.env.MFA_REQUIRED_FOR_ADMINS === "true";
}
