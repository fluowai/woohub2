import { prisma } from "./prisma";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { logger } from "./logger";

export const RESERVED_HOSTNAMES = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "woohub.local",
    "app.woohub.local",
    "api.woohub.local",
    "admin.woohub.local",
    "woohub.com",
    "example.com",
    "test.com",
]);

export interface HostValidationResult {
    valid: boolean;
    normalized?: string;
    error?: string;
}

export function normalizeHostname(raw: string): string {
    if (!raw) return "";
    let cleaned = raw.trim().toLowerCase();
    if (cleaned.includes("://")) {
        cleaned = cleaned.split("://")[1];
    }
    cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0];
    cleaned = cleaned.split(":")[0];
    return cleaned.replace(/\.$/, "");
}

export function isValidHostname(hostname: string): boolean {
    if (!hostname) return false;
    const domainRegex = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})*\.[a-z]{2,}$/i;
    return domainRegex.test(hostname);
}

export function isReservedHostname(hostname: string): boolean {
    const norm = normalizeHostname(hostname);
    return RESERVED_HOSTNAMES.has(norm);
}

export function generateVerificationToken(): string {
    return `whb_chk_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Validates and normalizes a custom hostname.
 * Strictly forbids paths, ports, schemes, IP addresses, and reserved domains.
 */
export function validateHostname(raw: string): HostValidationResult {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: "Hostname cannot be empty" };
    }

    let cleaned = raw.trim().toLowerCase();

    // Reject schemes
    if (cleaned.includes("://")) {
        return { valid: false, error: "Hostname cannot include protocol (http:// or https://)" };
    }

    // Reject paths, queries, hashes
    if (cleaned.includes("/") || cleaned.includes("?") || cleaned.includes("#")) {
        return { valid: false, error: "Hostname cannot include paths or query strings" };
    }

    // Reject ports
    if (cleaned.includes(":")) {
        return { valid: false, error: "Hostname cannot include port numbers" };
    }

    // Strip trailing dot if present
    cleaned = cleaned.replace(/\.$/, "");

    // Check reserved hosts
    if (RESERVED_HOSTNAMES.has(cleaned)) {
        return { valid: false, error: `Hostname '${cleaned}' is reserved and cannot be registered` };
    }

    // Reject IP addresses (IPv4 simple check)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleaned)) {
        return { valid: false, error: "Raw IP addresses are not permitted as hostnames" };
    }

    // RFC 1123 compliant domain regex
    const domainRegex = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})*\.[a-z]{2,}$/i;
    if (!domainRegex.test(cleaned)) {
        return { valid: false, error: "Invalid domain format. Must be a valid FQDN (e.g. api.minhaempresa.com.br)" };
    }

    return { valid: true, normalized: cleaned };
}

/**
 * Generates verification token and instructions for DNS challenge.
 */
export function generateDnsInstructions(hostname: string) {
    const token = `wh_verify_${crypto.randomBytes(16).toString("hex")}`;
    const txtRecord = `_woohub-challenge.${hostname}`;
    const cnameTarget = process.env.CNAME_TARGET || "proxy.woohub.local";

    return {
        verificationToken: token,
        instructions: {
            txt: {
                type: "TXT",
                host: txtRecord,
                value: token,
                ttl: 300,
                description: "Crie este registro TXT no seu gerenciador de DNS para comprovar a propriedade do domínio.",
            },
            cname: {
                type: "CNAME",
                host: hostname,
                value: cnameTarget,
                ttl: 300,
                description: "Aponte este registro CNAME para direcionar o tráfego para a plataforma.",
            },
        },
    };
}

/**
 * Attempts to verify a domain by checking the TXT challenge record.
 */
export async function verifyDomainDns(domainId: string): Promise<{
    verified: boolean;
    status: string;
    message: string;
    details?: any;
}> {
    const domain = await prisma.domain.findUnique({
        where: { id: domainId },
        include: { reseller: true },
    });

    if (!domain) {
        return { verified: false, status: "FAILED", message: "Domínio não encontrado" };
    }

    const expectedRecord = `_woohub-challenge.${domain.hostname}`;
    const expectedToken = domain.verificationToken;

    // Check for test mock bypass if configured in test/dev
    if (process.env.MOCK_DNS_VERIFICATION === "true") {
        const updated = await prisma.domain.update({
            where: { id: domainId },
            data: {
                status: "VERIFIED",
                validatedAt: new Date(),
                certificateStatus: "ISSUED",
                history: [
                    ...((domain.history as any[]) || []),
                    { event: "DNS_VERIFIED_MOCK", timestamp: new Date().toISOString() },
                ],
            },
        });
        return { verified: true, status: updated.status, message: "Domínio verificado com sucesso (modo sandbox/teste)" };
    }

    try {
        const records = await dns.resolveTxt(expectedRecord);
        const flatRecords = records.flat();
        const matched = flatRecords.some((txt) => txt.trim() === expectedToken.trim());

        if (matched) {
            const updated = await prisma.domain.update({
                where: { id: domainId },
                data: {
                    status: "VERIFIED",
                    validatedAt: new Date(),
                    certificateStatus: "ISSUED",
                    history: [
                        ...((domain.history as any[]) || []),
                        { event: "DNS_VERIFIED", record: expectedRecord, timestamp: new Date().toISOString() },
                    ],
                },
            });
            logger.info("Domain", `Domain ${domain.hostname} verified successfully via DNS TXT`);
            return { verified: true, status: updated.status, message: "Domínio verificado e aprovado com sucesso!" };
        } else {
            return {
                verified: false,
                status: domain.status,
                message: `Registro TXT encontrado em ${expectedRecord}, mas o token não correspondeu.`,
                details: { expected: expectedToken, found: flatRecords },
            };
        }
    } catch (error: any) {
        logger.warn("Domain", `DNS verification check failed for ${domain.hostname}: ${error.message}`);
        return {
            verified: false,
            status: domain.status,
            message: `Registro DNS TXT '${expectedRecord}' não encontrado ainda. A propagação de DNS pode levar até 24h.`,
            details: { error: error.code || error.message },
        };
    }
}

/**
 * Resolves white-label branding based on the incoming Host header.
 * If host is unknown or invalid, safely falls back to standard platform branding.
 */
export async function resolveBrandingForHost(hostHeader: string | null | undefined) {
    const defaultBranding = {
        name: "Woohub",
        logoUrl: null,
        faviconUrl: null,
        primaryColor: "#ff5a00",
        secondaryColor: "#0f172a",
        accentColor: "#f97316",
        supportEmail: "suporte@woohub.local",
        supportPhone: null,
        docBrandName: "Woohub API",
        isCustom: false,
        resellerId: null,
    };

    if (!hostHeader) return defaultBranding;

    // Remove port if present
    const cleanHost = hostHeader.split(":")[0].trim().toLowerCase();

    if (!cleanHost || RESERVED_HOSTNAMES.has(cleanHost)) {
        return defaultBranding;
    }

    try {
        const domain = await prisma.domain.findFirst({
            where: {
                hostname: cleanHost,
                status: { in: ["VERIFIED", "ACTIVE"] },
            },
            include: {
                reseller: {
                    include: {
                        branding: true,
                    },
                },
            },
        });

        if (domain?.reseller?.branding) {
            const b = domain.reseller.branding;
            return {
                name: b.name || domain.reseller.name,
                logoUrl: b.logoUrl,
                faviconUrl: b.faviconUrl,
                primaryColor: b.primaryColor || "#ff5a00",
                secondaryColor: b.secondaryColor || "#0f172a",
                accentColor: b.accentColor || "#f97316",
                supportEmail: b.supportEmail,
                supportPhone: b.supportPhone,
                docBrandName: b.docBrandName || b.name,
                isCustom: true,
                resellerId: domain.reseller.id,
            };
        }
    } catch (e) {
        logger.error("Domain", `Error resolving branding for host ${cleanHost}:`, e);
    }

    return defaultBranding;
}
