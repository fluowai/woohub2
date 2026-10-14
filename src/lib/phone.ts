const NOT_DIGITS = /[^0-9]/g;

export function phoneDigits(value?: string | null): string {
    return (value ?? "").replace(NOT_DIGITS, "");
}

/**
 * Canonical form used to compare "the same number" written in different ways:
 * digits only, with the Brazilian country code (55) stripped when the length
 * matches a national number with DDI.
 */
export function normalizePhone(value?: string | null): string {
    const digits = phoneDigits(value);
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
        return digits.slice(2);
    }
    return digits;
}

export function isPhoneJid(jid?: string | null): boolean {
    return !!jid && jid.endsWith("@s.whatsapp.net");
}

export function phoneFromJid(jid?: string | null): string | null {
    if (!isPhoneJid(jid)) return null;
    const local = (jid as string).split("@")[0].split(":")[0];
    return normalizePhone(local) || null;
}

export function samePhone(a?: string | null, b?: string | null): boolean {
    const left = normalizePhone(a);
    const right = normalizePhone(b);
    if (!left || !right) return false;
    if (left === right) return true;

    // Brazilian 9th digit equivalence (10 vs 11 national digits)
    if ((left.length === 10 && right.length === 11) || (left.length === 11 && right.length === 10)) {
        const shorter = left.length === 10 ? left : right;
        const longer = left.length === 11 ? left : right;
        const dddShort = shorter.slice(0, 2);
        const dddLong = longer.slice(0, 2);
        const numShort = shorter.slice(2);
        const numLong = longer.slice(3); // skip '9'
        return dddShort === dddLong && longer[2] === "9" && numShort === numLong;
    }

    return false;
}

export function formatPhoneForJid(value?: string | null): string {
    if (!value) return "";
    const clean = value.trim();
    if (clean.endsWith("@g.us") || clean.endsWith("@newsletter") || clean.endsWith("@lid") || clean.endsWith("@broadcast")) {
        return clean;
    }
    const local = clean.includes("@") ? clean.split("@")[0].split(":")[0] : clean;
    const digits = phoneDigits(local);
    if (!digits) return "";
    if (digits.startsWith("55")) return digits;
    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }
    return digits;
}

export function toPhoneJid(value?: string | null): string {
    if (!value) return "";
    const clean = value.trim();
    if (clean.endsWith("@g.us") || clean.endsWith("@newsletter") || clean.endsWith("@lid") || clean.endsWith("@broadcast")) {
        return clean;
    }
    const formatted = formatPhoneForJid(clean);
    return formatted ? `${formatted}@s.whatsapp.net` : "";
}

export function getBrazilianPhoneVariants(value?: string | null): { jidWith9: string; jidWithout9: string } | null {
    if (!value) return null;
    const clean = value.trim();
    if (clean.endsWith("@g.us") || clean.endsWith("@newsletter") || clean.endsWith("@lid") || clean.endsWith("@broadcast")) {
        return null;
    }
    const local = clean.includes("@") ? clean.split("@")[0].split(":")[0] : clean;
    let digits = phoneDigits(local);
    if (!digits) return null;

    if (!digits.startsWith("55")) {
        if (digits.length === 10 || digits.length === 11) {
            digits = `55${digits}`;
        } else {
            return null;
        }
    }

    if (digits.length !== 12 && digits.length !== 13) {
        return null;
    }

    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);

    let with9: string;
    let without9: string;

    if (rest.length === 9 && rest.startsWith("9")) {
        with9 = `55${ddd}${rest}@s.whatsapp.net`;
        without9 = `55${ddd}${rest.slice(1)}@s.whatsapp.net`;
    } else if (rest.length === 8) {
        with9 = `55${ddd}9${rest}@s.whatsapp.net`;
        without9 = `55${ddd}${rest}@s.whatsapp.net`;
    } else {
        return null;
    }

    return { jidWith9: with9, jidWithout9: without9 };
}

/**
 * Resolves the true WhatsApp network JID for a phone number.
 * Especially critical in Brazil where older accounts are registered in WhatsApp's
 * routing servers without the 9th digit (55 + DDD + 8 digits), while newer accounts
 * are registered with the 9th digit (55 + DDD + 9 + 8 digits).
 *
 * Resolution strategy:
 * 1. Checks local Contact table for existing synchronized contact JID.
 * 2. Checks local Message table for existing conversation remoteJid.
 * 3. Queries WhatsApp servers in real-time via socket.onWhatsApp if available.
 * 4. Fallback: for DDD >= 31, prefers without9 (standard legacy Brazilian WhatsApp routing).
 */
export async function resolveWhatsAppJid(
    targetJid: string,
    options?: {
        sessionId?: string;
        sessionPk?: string;
        socket?: any;
    }
): Promise<string> {
    if (!targetJid) return "";
    const clean = targetJid.trim();
    if (clean.endsWith("@g.us") || clean.endsWith("@newsletter") || clean.endsWith("@lid") || clean.endsWith("@broadcast")) {
        return clean;
    }

    const variants = getBrazilianPhoneVariants(clean);
    if (!variants) {
        return toPhoneJid(clean) || clean;
    }

    const { jidWith9, jidWithout9 } = variants;

    // 1. Check local DB (Contact table)
    try {
        const { prisma } = await import("./prisma");
        const sessionFilter = options?.sessionPk
            ? { sessionId: options.sessionPk }
            : options?.sessionId
            ? { session: { sessionId: options.sessionId } }
            : {};

        const contact = await prisma.contact.findFirst({
            where: {
                ...sessionFilter,
                OR: [
                    { jid: jidWithout9 },
                    { jid: jidWith9 },
                    { remoteJidAlt: jidWithout9 },
                    { remoteJidAlt: jidWith9 },
                ]
            },
            select: { jid: true, remoteJidAlt: true }
        });

        if (contact) {
            if (contact.jid === jidWithout9 || contact.remoteJidAlt === jidWithout9) {
                return jidWithout9;
            }
            if (contact.jid === jidWith9 || contact.remoteJidAlt === jidWith9) {
                return jidWith9;
            }
        }

        // Check recent messages
        const recentMsg = await prisma.message.findFirst({
            where: {
                remoteJid: { in: [jidWithout9, jidWith9] }
            },
            select: { remoteJid: true }
        });
        if (recentMsg?.remoteJid) {
            return recentMsg.remoteJid;
        }
    } catch {
        // DB check is non-fatal
    }

    // 2. Query WhatsApp server via socket.onWhatsApp
    const socket = options?.socket;
    if (socket && typeof socket.onWhatsApp === "function") {
        try {
            const results = await socket.onWhatsApp(jidWithout9, jidWith9);
            if (Array.isArray(results) && results.length > 0) {
                const found = results.find(r => r && r.exists && r.jid);
                if (found?.jid) {
                    return found.jid;
                }
            }
        } catch {
            // onWhatsApp check is non-fatal
        }
    }

    // 3. Fallback: for Brazilian DDD >= 31, WhatsApp legacy routing uses without 9
    return jidWithout9;
}
