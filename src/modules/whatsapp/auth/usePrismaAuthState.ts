import { prisma } from "@/lib/prisma";
import {
    AuthenticationCreds,
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { decryptJson, encryptJson, isEncrypted } from "@/lib/security/crypto";

/**
 * Baileys auth state stored in the database with application-level encryption.
 *
 * - Every value is encrypted with AES-256-GCM (authenticated) before persistence.
 * - The envelope carries key id, nonce and tag; the key itself only exists in the
 *   environment (CREDENTIALS_ENCRYPTION_KEY).
 * - AAD binds each ciphertext to its (sessionId, key) row so records cannot be swapped.
 * - Read failures THROW instead of silently returning null: a decryption error must never
 *   cause fresh credentials to be generated (that would log the device out).
 * - Write failures are retried and surfaced; they are never swallowed.
 */

const ENC_FIELD = "__enc";
const WRITE_RETRIES = 3;
const WRITE_RETRY_DELAY_MS = 500;

function aadFor(sessionId: string, key: string): string {
    return `authstate:${sessionId}:${key}`;
}

function toStoredValue(value: unknown, sessionId: string, key: string): unknown {
    const envelope = encryptJson(value, aadFor(sessionId, key));
    return { [ENC_FIELD]: envelope };
}

function fromStoredValue(raw: unknown, sessionId: string, key: string): unknown {
    if (raw && typeof raw === "object" && ENC_FIELD in (raw as Record<string, unknown>)) {
        const envelope = (raw as Record<string, unknown>)[ENC_FIELD];
        if (typeof envelope !== "string") {
            throw new Error(`Corrupt auth state envelope for ${key}`);
        }
        return decryptJson(envelope, aadFor(sessionId, key));
    }
    // Legacy plaintext row (pre-encryption). Returned as-is and re-encrypted on next write.
    return raw;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const usePrismaAuthState = async (
    sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
    /** Returns null only when the row does not exist; throws on any read/decryption error. */
    const readData = async (type: string, id: string): Promise<unknown | null> => {
        const key = `${type}-${id}`;
        const data = await prisma.authState.findUnique({
            where: { sessionId_key: { sessionId, key } },
        });
        if (!data || data.value === null || data.value === undefined) return null;
        try {
            return fromStoredValue(data.value, sessionId, key);
        } catch (error) {
            logger.error(
                "Auth",
                `Failed to decrypt auth state ${key} for session ${sessionId}; refusing to create new credentials.`
            );
            throw new Error(`AUTH_STATE_DECRYPT_FAILED:${key}`, { cause: error });
        }
    };

    const writeDataOnce = async (type: string, id: string, data: unknown): Promise<void> => {
        const key = `${type}-${id}`;
        const value = toStoredValue(JSON.parse(JSON.stringify(data, BufferJSON.replacer)), sessionId, key);

        await prisma.authState.upsert({
            where: { sessionId_key: { sessionId, key } },
            create: { sessionId, key, value: value as never },
            update: { value: value as never },
        });
    };

    const writeData = async (type: string, id: string, data: unknown): Promise<void> => {
        const key = `${type}-${id}`;
        let lastError: unknown;
        for (let attempt = 1; attempt <= WRITE_RETRIES; attempt++) {
            try {
                await writeDataOnce(type, id, data);
                return;
            } catch (error) {
                lastError = error;
                logger.error(
                    "Auth",
                    `Failed to persist auth state ${key} for session ${sessionId} (attempt ${attempt}/${WRITE_RETRIES}).`
                );
                if (attempt < WRITE_RETRIES) await sleep(WRITE_RETRY_DELAY_MS * attempt);
            }
        }
        logger.error("Auth", `AUTH_STATE_PERSIST_FAILED ${key} for session ${sessionId}`);
        throw new Error(`AUTH_STATE_PERSIST_FAILED:${key}`, { cause: lastError });
    };

    const removeData = async (type: string, id: string): Promise<void> => {
        const key = `${type}-${id}`;
        await prisma.authState.deleteMany({ where: { sessionId, key } });
    };

    // Throws when existing credentials cannot be read/decrypted: never fall back to initAuthCreds().
    const storedCreds = await readData("creds", "me");
    const creds: AuthenticationCreds = (storedCreds as AuthenticationCreds) || initAuthCreds();
    if (!storedCreds) {
        logger.info("Auth", `No stored credentials for session ${sessionId}; a fresh login will be required.`);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = (await readData(type, id)) as SignalDataTypeMap[typeof type] | null;
                            if (type === "app-state-sync-key" && value) {
                                value = BufferJSON.reviver(null, value as never);
                            }
                            if (value) {
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        const categoryData = data[category as keyof typeof data];
                        if (!categoryData) continue;

                        for (const id in categoryData) {
                            const value = categoryData[id];
                            if (value) {
                                tasks.push(writeData(category, id, value));
                            } else {
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: async () => {
            await writeData("creds", "me", creds);
        },
    };
};

/** True when the given stored value is already encrypted (used by migration tooling). */
export function isStoredValueEncrypted(value: unknown): boolean {
    if (value && typeof value === "object" && ENC_FIELD in (value as Record<string, unknown>)) {
        const envelope = (value as Record<string, unknown>)[ENC_FIELD];
        return typeof envelope === "string" && isEncrypted(envelope);
    }
    return false;
}
