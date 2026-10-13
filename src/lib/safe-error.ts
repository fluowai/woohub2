/**
 * Converts an unknown thrown value into a message that is safe to return to API
 * clients. System/infrastructure errors (Prisma, Node errno, fetch, etc.) are
 * replaced by a generic fallback so internal details never leave the server —
 * the real error is still logged by the caller.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === "object") {
        const e = error as { name?: string; code?: unknown; message?: unknown };
        const isSystemError =
            typeof e.code === "string" ||
            e.name === "PrismaClientKnownRequestError" ||
            e.name === "PrismaClientInitializationError" ||
            e.name === "PrismaClientUnknownRequestError" ||
            e.name === "PrismaClientValidationError" ||
            e.name === "TypeError" ||
            e.name === "SyntaxError";

        if (!isSystemError && typeof e.message === "string" && e.message.length > 0) {
            const leaksInternals =
                /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|fetch failed|getaddrinfo|SQLSTATE|Prisma|connect E\w+|MODULE_NOT_FOUND|Unexpected token)\b/i.test(
                    e.message
                );
            if (!leaksInternals) {
                return e.message.slice(0, 300);
            }
        }
    }
    return fallback;
}
