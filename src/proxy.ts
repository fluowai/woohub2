import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import nodeCrypto from "node:crypto";
import { authenticateRequest } from "@/lib/access";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { checkRequestQuotaForTenant, isQuotaError, quotaErrorResponse, trackRequest } from "@/lib/quota";
import { logger } from "@/lib/logger";

/**
 * Edge/proxy layer for Woohub.
 *
 * Responsibilities (single choke point for every /api request):
 *   1. abuse protection for credential endpoints (login/register) by IP
 *   2. authentication: session cookie or API key (validated, not merely accepted)
 *   3. authorization: required scope for API keys -> 403
 *   4. rate limiting per credential and per IP -> 429 with Retry-After
 *   5. request headers carrying the derived identity for downstream handlers
 *
 * Identity headers are always overwritten here, so a client cannot spoof them.
 */

// Gateway webhooks cannot present credentials: authenticity is verified by the
// HMAC signature inside the handler (`src/lib/payments.ts`), never by the client.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/docs", "/api/payments/webhook"];
// The OpenAPI document is a static contract (no tenant data) and must be fetchable
// without credentials so external tooling can read it. The health endpoint only
// reports process/database liveness for orchestrator probes.
const PUBLIC_API_EXACT = ["/api/v1/openapi.json", "/api/system/health"];

const RATE_LIMIT_PER_MINUTE = Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MINUTE || "120", 10));
const AUTH_RATE_LIMIT_PER_15MIN = Math.max(1, parseInt(process.env.AUTH_RATE_LIMIT_PER_15MIN || "10", 10));
const REGISTER_RATE_LIMIT_PER_HOUR = Math.max(1, parseInt(process.env.REGISTER_RATE_LIMIT_PER_HOUR || "5", 10));

function clientIp(request: NextRequest): string {
    const fwd = request.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return request.headers.get("x-real-ip") || "unknown";
}

function hashCredential(value: string): string {
    return nodeCrypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function presentApiKey(request: NextRequest): string | null {
    const header = request.headers.get("x-api-key");
    if (header && header.trim()) return header.trim();
    const authHeader = request.headers.get("authorization");
    if (authHeader && /^Bearer\s+/i.test(authHeader)) {
        const value = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (value) return value;
    }
    return null;
}

function isV1(pathname: string): boolean {
    return pathname.startsWith("/api/v1");
}

/**
 * Error envelope:
 *   legacy/dashboard routes keep `{ status:false, code, message, error }`;
 *   `/api/v1` answers with the public API envelope `{ error:{code,message}, request_id }`.
 */
function errorBody(pathname: string, code: string, message: string, request_id?: string): Record<string, unknown> {
    if (isV1(pathname)) {
        return { error: { code, message }, request_id: request_id ?? nodeCrypto.randomUUID() };
    }
    return { status: false, code, message, error: message };
}

function limitResponse(
    pathname: string,
    limit: number,
    remaining: number,
    resetAt: number,
    retryAfterSec: number,
    message = "Rate limit exceeded"
): NextResponse {
    const headers = new Headers({
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": String(retryAfterSec),
    });
    return new NextResponse(JSON.stringify(errorBody(pathname, "rate_limited", message)), {
        status: 429,
        headers,
    });
}

/** IP-only throttling for credential endpoints (login/register). */
function protectCredentialEndpoint(request: NextRequest, pathname: string): NextResponse | null {
    if (request.method !== "POST") return null;

    const ip = clientIp(request);
    let result = null;
    let label = "";

    if (pathname.startsWith("/api/auth/register")) {
        result = consumeRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
        label = "register";
    } else if (pathname.startsWith("/api/auth/callback") || pathname.startsWith("/api/auth/signin")) {
        result = consumeRateLimit(`signin:${ip}`, AUTH_RATE_LIMIT_PER_15MIN, 15 * 60 * 1000);
        label = "signin";
    }

    if (!result) return null;
    if (result.allowed) return null;

    logger.warn("Proxy", `Rate limit hit for ${label} from ${ip}`);
    return limitResponse(pathname, result.limit, result.remaining, result.resetAt, result.retryAfterSec, "Too many attempts");
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Next.js internals / static assets
    if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
        return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
        const credentialGuard = protectCredentialEndpoint(request, pathname);
        if (credentialGuard) return credentialGuard;

        const isPublic =
            PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
            PUBLIC_API_EXACT.includes(pathname);
        if (isPublic) {
            return NextResponse.next();
        }

        const ip = clientIp(request);
        const rawKey = presentApiKey(request);
        const credentialId = rawKey ? `key:${hashCredential(rawKey)}` : `ip:${ip}`;

        // Per-credential rate limit (applies before any DB work so invalid keys cannot hammer the DB).
        const keyed = consumeRateLimit(credentialId, RATE_LIMIT_PER_MINUTE, 60 * 1000);
        if (!keyed.allowed) {
            return limitResponse(pathname, keyed.limit, keyed.remaining, keyed.resetAt, keyed.retryAfterSec);
        }

        try {
            const result = await authenticateRequest(request);

            if (!result.ok) {
                return NextResponse.json(
                    errorBody(pathname, result.code, result.message),
                    {
                        status: result.status,
                        headers: {
                            "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE),
                            "X-RateLimit-Remaining": String(keyed.remaining),
                            "X-RateLimit-Reset": String(Math.ceil(keyed.resetAt / 1000)),
                        },
                    }
                );
            }

            const headers = new Headers(request.headers);
            headers.set("x-woohub-request-id", result.context.requestId);
            headers.set("x-woohub-auth", result.context.authMethod);
            if (result.context.tenantId) headers.set("x-woohub-tenant", result.context.tenantId);
            if (result.context.apiKey) headers.set("x-woohub-key", result.context.apiKey.publicId);
            if (result.context.userId) headers.set("x-woohub-user", result.context.userId);
            headers.set("x-woohub-scopes", [...result.context.permissions].join(" "));

            // Public API quota (plan request limit) — /api/v1 only, never the dashboard routes.
            if (isV1(pathname)) {
                try {
                    await checkRequestQuotaForTenant(result.context.tenantId);
                } catch (error) {
                    if (isQuotaError(error)) {
                        return NextResponse.json(
                            errorBody(pathname, error.code, error.message, result.context.requestId),
                            { status: error.status }
                        );
                    }
                    const mapped = quotaErrorResponse(error);
                    if (mapped) return mapped;
                    throw error;
                }
                trackRequest(result.context.tenantId);
            }

            headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE));
            headers.set("X-RateLimit-Remaining", String(keyed.remaining));
            headers.set("X-RateLimit-Reset", String(Math.ceil(keyed.resetAt / 1000)));

            return NextResponse.next({ request: { headers } });
        } catch (error) {
            // Fail closed: never let an unverified request reach a handler.
            logger.error("Proxy", `Authentication pipeline failed for ${pathname}:`, error);
            return NextResponse.json(
                errorBody(pathname, "auth_unavailable", "Authentication unavailable"),
                { status: 401 }
            );
        }
    }

    const publicRoutes = ["/auth/login", "/auth/register", "/terms", "/privacy"];

    const staticExtensions = [".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".ttf"];
    if (pathname.lastIndexOf("/") === 0 && staticExtensions.some((ext) => pathname.endsWith(ext))) {
        return NextResponse.next();
    }

    const { auth } = await import("@/lib/auth");

    if (pathname.startsWith("/dashboard")) {
        const session = await auth();
        if (!session?.user) {
            const loginUrl = new URL("/auth/login", request.url);
            loginUrl.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
    }

    if (pathname === "/") {
        const session = await auth();
        if (session?.user) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        return NextResponse.next();
    }

    if (publicRoutes.some((route) => pathname.startsWith(route))) {
        const session = await auth();
        if (session?.user && (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register"))) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        return NextResponse.next();
    }

    const session = await auth();
    if (!session?.user) {
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
