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
    return !!left && !!right && left === right;
}
