import crypto from "node:crypto";

/**
 * API key generation, hashing and verification.
 *
 * Full key layout:   whk_<publicId>_<secret>
 *   - publicId: 12 chars, stored in clear (identification, rotation, audit, redaction)
 *   - secret:   32 chars, NEVER stored; only sha256(fullKey) is persisted
 *
 * The full key is returned exactly once, at creation time.
 */

const KEY_PREFIX = "whk";
const PUBLIC_ID_CHARS = 12;
const SECRET_CHARS = 32;
// Crockford-ish base32 alphabet (no confusing I/L/O/U)
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";

function randomString(length: number): string {
    const bytes = crypto.randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

export interface GeneratedApiKey {
    /** Full secret. Store nowhere; show to the user only once. */
    key: string;
    /** Public, non-secret identifier prefix stored in ApiKey.publicId. */
    publicId: string;
    /** sha256 hex of the full key, stored in ApiKey.hash. */
    hash: string;
    /** Redacted form for logs/UI: whk_ABCD1234… */
    display: string;
}

export function generateApiKey(): GeneratedApiKey {
    const publicId = randomString(PUBLIC_ID_CHARS);
    const secret = randomString(SECRET_CHARS);
    const key = `${KEY_PREFIX}_${publicId}_${secret}`;
    return { key, publicId, hash: hashApiKey(key), display: redactApiKey(key) };
}

export function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

/** Extracts the public id from a full key without revealing the secret. */
export function extractPublicId(key: string): string | null {
    if (!key.startsWith(`${KEY_PREFIX}_`)) return null;
    const parts = key.split("_");
    if (parts.length !== 3) return null;
    const publicId = parts[1];
    if (publicId.length !== PUBLIC_ID_CHARS) return null;
    return publicId;
}

export function isValidKeyFormat(key: string): boolean {
    if (!key.startsWith(`${KEY_PREFIX}_`)) return false;
    const parts = key.split("_");
    if (parts.length !== 3) return false;
    if (parts[1].length !== PUBLIC_ID_CHARS || parts[2].length !== SECRET_CHARS) return false;
    return /^[A-Z0-9]+$/.test(parts[1]) && /^[A-Z0-9]+$/.test(parts[2]);
}

/** Constant-time comparison of a candidate key hash against the stored hash. */
export function verifyKeyHash(key: string, storedHash: string): boolean {
    const candidate = Buffer.from(hashApiKey(key), "hex");
    const expected = Buffer.from(storedHash || "", "hex");
    if (candidate.length !== expected.length || candidate.length === 0) return false;
    return crypto.timingSafeEqual(candidate, expected);
}

/** Safe for logs/UI: keeps the public prefix, hides the secret. */
export function redactApiKey(key: string): string {
    if (isLegacyKeyFormat(key)) return redactLegacyKey(key);
    const publicId = extractPublicId(key);
    if (publicId) return `${KEY_PREFIX}_${publicId}…`;
    if (key.length <= 8) return "whk_…";
    return `${key.slice(0, 8)}…`;
}

// ---------------------------------------------------------------------------------------
// Legacy upstream keys (Woohub v1.x): `wag_...`, stored in plaintext in User.apiKey.
// Migrated by scripts/migrate-tenancy.js into ApiKey rows (hash only). Kept readable for
// one deprecation window so existing integrations do not break the day tenancy lands.
// ---------------------------------------------------------------------------------------

const LEGACY_PREFIX = "wag_";
const LEGACY_MIN_BODY = 4;
const LEGACY_MAX_BODY = 64;
const LEGACY_BODY_RE = /^[A-Za-z0-9]+$/;

export function isLegacyKeyFormat(key: string): boolean {
    if (!key.startsWith(LEGACY_PREFIX)) return false;
    const body = key.slice(LEGACY_PREFIX.length);
    if (body.length < LEGACY_MIN_BODY || body.length > LEGACY_MAX_BODY) return false;
    return LEGACY_BODY_RE.test(body);
}

export function redactLegacyKey(key: string): string {
    if (key.length <= LEGACY_PREFIX.length + 4) return "wag_…";
    return `${key.slice(0, LEGACY_PREFIX.length + 4)}…`;
}
