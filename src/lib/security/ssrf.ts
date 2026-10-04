import dns from "node:dns";
import net from "node:net";

/**
 * SSRF protection for any URL that leaves the process (webhooks, user-supplied media,
 * avatar/status fetches, payment gateway callbacks).
 *
 * Rules enforced on the hostname AND on every resolved address:
 *   - only http/https
 *   - no loopback, private, link-local, CGNAT, multicast, unspecified or metadata ranges
 *   - no literal hostnames such as localhost / *.internal / metadata.google.internal
 *   - redirects are followed manually and re-validated hop by hop
 *   - total time and downloaded bytes are capped
 */

export class SsrfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SsrfError";
    }
}

const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
]);

function ipv4ToInt(ip: string): number {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isPrivateIpv4(ip: string): boolean {
    const value = ipv4ToInt(ip);
    const ranges: Array<[number, number]> = [
        [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")], // unspecified
        [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")], // private
        [ipv4ToInt("100.64.0.0"), ipv4ToInt("100.127.255.255")], // CGNAT
        [ipv4ToInt("127.0.0.0"), ipv4ToInt("127.255.255.255")], // loopback
        [ipv4ToInt("169.254.0.0"), ipv4ToInt("169.254.255.255")], // link-local (cloud metadata)
        [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")], // private
        [ipv4ToInt("192.0.0.0"), ipv4ToInt("192.0.0.255")], // IETF protocol assignments
        [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")], // private
        [ipv4ToInt("198.18.0.0"), ipv4ToInt("198.19.255.255")], // benchmarking
        [ipv4ToInt("224.0.0.0"), ipv4ToInt("239.255.255.255")], // multicast
        [ipv4ToInt("240.0.0.0"), ipv4ToInt("255.255.255.255")], // reserved/broadcast
    ];
    return ranges.some(([start, end]) => value >= start && value <= end);
}

export function isPrivateIpv6(ip: string): boolean {
    const addr = ip.toLowerCase().split("%")[0];
    if (addr === "::" || addr === "::1") return true;
    if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb")) {
        return true; // link-local
    }
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local (fc00::/7)
    if (addr.startsWith("ff")) return true; // multicast
    // IPv4-mapped (::ffff:127.0.0.1)
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
}

export function isPrivateAddress(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 4) return isPrivateIpv4(ip);
    if (family === 6) return isPrivateIpv6(ip);
    return true; // not a valid IP => treat as unsafe
}

function assertHostnameAllowed(hostname: string): void {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (BLOCKED_HOSTNAMES.has(host)) {
        throw new SsrfError(`Blocked hostname: ${host}`);
    }
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
        throw new SsrfError(`Blocked internal hostname: ${host}`);
    }
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) {
            throw new SsrfError(`Blocked address: ${host}`);
        }
    }
}

async function resolveAll(hostname: string): Promise<string[]> {
    if (net.isIP(hostname)) return [hostname];
    try {
        const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
        if (!records.length) throw new SsrfError(`DNS produced no records for ${hostname}`);
        return records.map((r) => r.address);
    } catch (err) {
        if (err instanceof SsrfError) throw err;
        throw new SsrfError(`DNS resolution failed for ${hostname}`);
    }
}

export interface UrlPolicy {
    allowedPorts?: number[];
    allowPrivateHosts?: boolean; // tests only
}

/**
 * Validates a URL and resolves it, rejecting private/internal destinations.
 * Returns the parsed URL so callers can reuse it without re-parsing.
 */
export async function assertSafeUrl(rawUrl: string, policy: UrlPolicy = {}): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfError("Invalid URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new SsrfError(`Scheme not allowed: ${url.protocol}`);
    }

    if (url.username || url.password) {
        throw new SsrfError("URLs with embedded credentials are not allowed");
    }

    const allowedPorts = policy.allowedPorts ?? [80, 443, 8080, 8443];
    if (url.port && !allowedPorts.includes(parseInt(url.port, 10))) {
        throw new SsrfError(`Port not allowed: ${url.port}`);
    }

    if (!policy.allowPrivateHosts) {
        assertHostnameAllowed(url.hostname);
        const addresses = await resolveAll(url.hostname);
        for (const address of addresses) {
            if (isPrivateAddress(address)) {
                throw new SsrfError(`Blocked resolved address ${address} for ${url.hostname}`);
            }
        }
    }

    return url;
}

export interface SafeFetchOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    maxRedirects?: number;
    maxBytes?: number;
    policy?: UrlPolicy;
}

export interface SafeFetchResult {
    ok: boolean;
    status: number;
    body: string;
    buffer: Buffer;
    url: string;
    truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * fetch() with SSRF validation, manual redirect handling and byte/time caps.
 * Throws SsrfError when a destination (including a redirect hop) is unsafe.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRedirects = options.maxRedirects ?? 3;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    let currentUrl = rawUrl;
    let method = options.method ?? "GET";

    for (let hop = 0; hop <= maxRedirects; hop++) {
        await assertSafeUrl(currentUrl, options.policy);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(currentUrl, {
                method,
                headers: options.headers,
                body: method === "GET" ? undefined : options.body,
                redirect: "manual",
                signal: controller.signal,
            });

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");
                if (!location) return { ok: false, status: response.status, body: "", buffer: Buffer.alloc(0), url: currentUrl, truncated: false };
                currentUrl = new URL(location, currentUrl).toString();
                if (response.status === 303) method = "GET";
                response.body?.cancel().catch(() => undefined);
                continue;
            }

            const reader = response.body?.getReader();
            let received = 0;
            let truncated = false;
            const chunks: Uint8Array[] = [];
            if (reader) {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        received += value.length;
                        if (received > maxBytes) {
                            truncated = true;
                            await reader.cancel().catch(() => undefined);
                            chunks.push(value.slice(0, Math.max(0, maxBytes - (received - value.length))));
                            break;
                        }
                        chunks.push(value);
                    }
                }
            }
            const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
            let body = buffer.toString("utf8");
            if (truncated) {
                body = body.slice(0, maxBytes);
            }

            return { ok: response.ok, status: response.status, body, buffer, url: currentUrl, truncated };
        } finally {
            clearTimeout(timer);
        }
    }

    throw new SsrfError(`Too many redirects fetching ${rawUrl}`);
}
