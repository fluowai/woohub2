import crypto from "node:crypto";

/**
 * Authenticated encryption for sensitive records (WhatsApp Engine credentials, webhook secrets).
 *
 * Envelope format:  v1.<keyId>.<iv>.<tag>.<ciphertext>   (base64url segments)
 * Algorithm:        AES-256-GCM (12-byte IV, 128-bit tag)
 * AAD:              caller-supplied context (e.g. "authstate:<sessionId>:<key>")
 *                   binds a ciphertext to its row so records cannot be swapped.
 *
 * Keys live ONLY in the environment:
 *   CREDENTIALS_ENCRYPTION_KEY          base64(32 bytes)  -> current key (encrypt + decrypt)
 *   CREDENTIALS_ENCRYPTION_KEY_PREVIOUS comma-separated base64(32 bytes) -> decrypt only (rotation)
 *
 * In development, if the key is missing, a key is derived from AUTH_SECRET and a warning is
 * printed. In production a missing key is a hard failure: we never silently fall back to
 * plaintext storage.
 */

const ENC_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class CryptoConfigError extends Error {}

interface KeyRing {
    primary: { kid: string; key: Buffer };
    previous: Map<string, Buffer>;
    devFallback: boolean;
}

let cachedRing: KeyRing | null = null;
let warned = false;

function decodeKey(value: string, label: string): Buffer {
    const raw = Buffer.from(value.trim(), "base64");
    if (raw.length !== KEY_BYTES) {
        throw new CryptoConfigError(
            `${label} must be base64 of exactly ${KEY_BYTES} bytes (got ${raw.length}). Generate with: openssl rand -base64 32`
        );
    }
    return raw;
}

function kidOf(key: Buffer): string {
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function warnOnce(message: string) {
    if (warned) return;
    warned = true;
    console.warn(`[Woohub][security] ${message}`);
}

export function getKeyRing(): KeyRing {
    if (cachedRing) return cachedRing;

    const primaryRaw = process.env.CREDENTIALS_ENCRYPTION_KEY;
    const previousRaw = process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;

    const previous = new Map<string, Buffer>();
    if (previousRaw) {
        for (const part of previousRaw.split(",")) {
            if (!part.trim()) continue;
            const key = decodeKey(part, "CREDENTIALS_ENCRYPTION_KEY_PREVIOUS");
            previous.set(kidOf(key), key);
        }
    }

    if (primaryRaw && primaryRaw.trim()) {
        const key = decodeKey(primaryRaw, "CREDENTIALS_ENCRYPTION_KEY");
        cachedRing = { primary: { kid: kidOf(key), key }, previous, devFallback: false };
        return cachedRing;
    }

    if (process.env.NODE_ENV === "production") {
        throw new CryptoConfigError(
            "CREDENTIALS_ENCRYPTION_KEY is required in production. Refusing to store WhatsApp credentials without encryption."
        );
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new CryptoConfigError(
            "Neither CREDENTIALS_ENCRYPTION_KEY nor AUTH_SECRET is set; cannot encrypt credentials."
        );
    }

    warnOnce(
        "CREDENTIALS_ENCRYPTION_KEY is not set. Deriving a development-only key from AUTH_SECRET. " +
            "Set CREDENTIALS_ENCRYPTION_KEY (openssl rand -base64 32) before production use."
    );
    const devKey = crypto.createHash("sha256").update(`woohub-dev-cred:${secret}`).digest();
    const ring: KeyRing = { primary: { kid: kidOf(devKey), key: devKey }, previous, devFallback: true };
    cachedRing = ring;
    return ring;
}

/** Clears the cached key ring (tests / key rotation within a process). */
export function resetKeyRing(): void {
    cachedRing = null;
    warned = false;
}

export function currentKeyId(): string {
    return getKeyRing().primary.kid;
}

/**
 * Encrypts a UTF-8 string. Returns a self-describing envelope.
 */
export function encryptSecret(plaintext: string, aad: string): string {
    const ring = getKeyRing();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", ring.primary.key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [ENC_VERSION, ring.primary.kid, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/**
 * Decrypts an envelope produced by encryptSecret. Throws on tampering, unknown key or bad AAD.
 * Never returns partial/plaintext data on failure so callers cannot "repair" credentials silently.
 */
export function decryptSecret(envelope: string, aad: string): string {
    const ring = getKeyRing();
    const parts = envelope.split(".");
    if (parts.length !== 5 || parts[0] !== ENC_VERSION) {
        throw new Error("Unsupported credential envelope format");
    }
    const [, kid, ivB64, tagB64, ctB64] = parts;
    const key = ring.primary.kid === kid ? ring.primary.key : ring.previous.get(kid);
    if (!key) {
        throw new Error(`Unknown credential key id ${kid}; cannot decrypt (key rotation missing?)`);
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown, aad: string): string {
    return encryptSecret(JSON.stringify(value), aad);
}

export function decryptJson<T>(envelope: string, aad: string): T {
    return JSON.parse(decryptSecret(envelope, aad)) as T;
}

/** Returns true when a stored value uses the current encryption envelope (used to skip re-encrypts). */
export function isEncrypted(value: string): boolean {
    return typeof value === "string" && value.startsWith(`${ENC_VERSION}.`);
}
