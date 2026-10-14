import type { NextRequest } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";
import nodeCrypto from "node:crypto";
import { prisma } from "./prisma";
import { auth } from "./auth";
import {
    API_KEY_SCOPES,
    ApiKeyScope,
    PERMISSIONS,
    Permission,
    SUPER_ADMIN_PERMISSIONS,
    TenantRole,
    fallbackTenantRole,
    parseScopes,
    permissionsForRole,
} from "./permissions";
import { extractPublicId, hashApiKey, isLegacyKeyFormat, isValidKeyFormat, verifyKeyHash } from "./security/api-keys";
import { logger } from "./logger";

/**
 * Central access resolution for every Woohub HTTP entry point.
 *
 * Two credential types are supported:
 *   - session cookie (NextAuth JWT)  -> full tenant role permissions
 *   - API key (Authorization: Bearer whk_... or X-Api-Key) -> only its scopes, tenant bound
 *
 * The resolved context is published through AsyncLocalStorage so legacy helpers
 * (canAccessSession, getAccessibleSessions, ...) can enforce tenant isolation and
 * API-key instance binding without changing their public signature.
 */

export interface AccessContext {
    authMethod: "session" | "apiKey";
    requestId: string;
    userId: string | null;
    email: string | null;
    name: string | null;
    platformRole: string;
    isSuperAdmin: boolean;
    isMegaAdmin: boolean;
    resellerId: string | null;
    tenantId: string | null;
    tenantRole: TenantRole | null;
    permissions: Set<Permission>;
    apiKey: {
        id: string;
        publicId: string;
        scopes: Set<ApiKeyScope>;
        instanceId: string | null;
    } | null;
    ip: string | null;
}

export type AuthFailure = {
    ok: false;
    status: 401 | 403;
    code: "missing_credentials" | "invalid_api_key" | "expired_api_key" | "revoked_api_key" | "insufficient_scope" | "tenant_disabled" | "no_tenant";
    message: string;
};

export type AuthSuccess = { ok: true; context: AccessContext };

export type AuthResult = AuthSuccess | AuthFailure;

const storage = new AsyncLocalStorage<AccessContext>();

/** Returns the context of the request being handled, when available. */
export function currentContext(): AccessContext | undefined {
    return storage.getStore();
}

/**
 * Async variant used by request-scoped consumers (audit, error envelopes).
 *
 * The proxy resolves identity in the middleware scope, which does not always
 * propagate through the router's async chain — so when the AsyncLocalStorage
 * store is empty it falls back to the `x-woohub-*` headers the proxy publishes
 * on the incoming request.
 */
export async function currentContextAsync(): Promise<AccessContext | null> {
    const stored = storage.getStore();
    if (stored) return stored;
    try {
        const { headers } = await import("next/headers");
        const h = await headers();
        const requestId = h.get("x-woohub-request-id");
        if (!requestId) return null;
        const scopes = (h.get("x-woohub-scopes") || "").split(" ").filter(Boolean);
        const keyPublicId = h.get("x-woohub-key");
        return {
            authMethod: h.get("x-woohub-auth") === "apiKey" ? "apiKey" : "session",
            requestId,
            userId: h.get("x-woohub-user"),
            email: null,
            name: null,
            platformRole: "STAFF",
            isSuperAdmin: false,
            isMegaAdmin: false,
            resellerId: null,
            tenantId: h.get("x-woohub-tenant"),
            tenantRole: null,
            permissions: new Set<Permission>(scopes as Permission[]),
            apiKey: keyPublicId ? { id: "", publicId: keyPublicId, scopes: new Set(scopes as ApiKeyScope[]), instanceId: null } : null,
            ip: h.get("x-woohub-ip"),
        };
    } catch {
        return null;
    }
}

export function runWithContext<T>(context: AccessContext, fn: () => T): T {
    return storage.run(context, fn);
}

/**
 * Required API-key scope for a given path/method.
 * Returns:
 *   - a scope string when the route is key-accessible
 *   - null        when the route is administrative and must never be reachable with a client key
 */
export function requiredScopeFor(pathname: string, method: string): ApiKeyScope | null {
    // Administrative / self-service surfaces: client keys are rejected outright.
    const adminPrefixes = [
        "/api/mega-admin",
        "/api/super-admin",
        "/api/users",
        "/api/user",
        "/api/tenants",
        "/api/plans",
        "/api/subscriptions",
        "/api/settings",
        "/api/system",
        "/api/notifications",
        "/api/auth",
        "/api/docs",
        "/api/media",
        "/api/audit",
        "/api/payments",
        "/api/invoices",
        "/api/jobs",
    ];
    if (adminPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`))) {
        return null;
    }

    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

    const read = (scope: ApiKeyScope): ApiKeyScope => (isRead ? scope : (scope === "instances:read" ? "instances:write" : scope));

    // v1 public API
    if (pathname.startsWith("/api/v1/usage")) return isRead ? "instances:read" : null;
    if (pathname.startsWith("/api/v1/webhooks")) {
        if (pathname.includes("/logs")) return "webhooks:read";
        return isRead ? "webhooks:read" : "webhooks:write";
    }
    if (pathname.startsWith("/api/v1/instances")) {
        if (pathname.endsWith("/messages") || pathname.includes("/messages/")) {
            return isRead ? "messages:read" : "messages:send";
        }
        if (pathname.endsWith("/contacts") || pathname.includes("/contacts/")) {
            return isRead ? "contacts:read" : "instances:write";
        }
        if (pathname.endsWith("/qr") || pathname.endsWith("/connect") || pathname.endsWith("/disconnect")) {
            return isRead ? "instances:read" : "instances:write";
        }
        return isRead ? "instances:read" : "instances:write";
    }

    // Legacy routes
    if (pathname.startsWith("/api/messages") || pathname.startsWith("/api/chat") || pathname.startsWith("/api/scheduler")) {
        return isRead ? "messages:read" : "messages:send";
    }
    if (pathname.startsWith("/api/broadcast")) return isRead ? "messages:read" : "messages:send";
    // Write-side of contacts has no dedicated API-key scope (same rule as v1):
    // mutations require instances:write.
    if (pathname.startsWith("/api/contacts")) return isRead ? "contacts:read" : "instances:write";
    if (pathname.startsWith("/api/groups")) return read(isRead ? "instances:read" : "instances:write");
    if (pathname.startsWith("/api/webhooks")) {
        if (pathname.includes("/logs")) return "webhooks:read";
        return isRead ? "webhooks:read" : "webhooks:write";
    }
    if (pathname.startsWith("/api/sessions")) return isRead ? "instances:read" : "instances:write";
    if (pathname.startsWith("/api/labels") || pathname.startsWith("/api/autoreplies") || pathname.startsWith("/api/profile")) {
        return isRead ? "instances:read" : "instances:write";
    }

    // Default: reads need instances:read, mutations need instances:write.
    return isRead ? "instances:read" : "instances:write";
}

function extractApiKey(request: NextRequest): string | null {
    const header = request.headers.get("x-api-key");
    if (header && header.trim()) return header.trim();
    const authHeader = request.headers.get("authorization");
    if (authHeader && /^Bearer\s+/i.test(authHeader)) {
        const value = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (value) return value;
    }
    return null;
}

// Set to "true" ONLY when a reverse proxy sits in front and overwrites
// X-Forwarded-For. When false (default), client-supplied XFF is ignored so
// identity/IP cannot be spoofed.
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

function clientIp(request: NextRequest): string | null {
    if (TRUST_PROXY) {
        const fwd = request.headers.get("x-forwarded-for");
        if (fwd) {
            const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
            // Rightmost entry is the one appended by our trusted proxy.
            if (parts.length > 0) return parts[parts.length - 1];
        }
    }
    return request.headers.get("x-real-ip");
}

let lastSeenWrite = 0;

async function authenticateApiKey(rawKey: string, pathname: string, method: string): Promise<AuthResult> {
    const legacy = isLegacyKeyFormat(rawKey);

    if (!legacy && !isValidKeyFormat(rawKey)) {
        return { ok: false, status: 401, code: "invalid_api_key", message: "Invalid API key" };
    }

    // Legacy `wag_...` keys are looked up by hash (the plaintext is never stored by Woohub;
    // scripts/migrate-tenancy.js copies User.apiKey into ApiKey.hash once).
    let record = legacy
        ? await prisma.apiKey.findUnique({
              where: { hash: hashApiKey(rawKey) },
              include: { tenant: { include: { reseller: true } } },
          })
        : null;

    if (!record) {
        const publicId = legacy ? null : extractPublicId(rawKey);
        if (!publicId) {
            return { ok: false, status: 401, code: "invalid_api_key", message: "Invalid API key" };
        }
        record = await prisma.apiKey.findUnique({
            where: { publicId },
            include: { tenant: { include: { reseller: true } } },
        });
        if (!record || !verifyKeyHash(rawKey, record.hash)) {
            return { ok: false, status: 401, code: "invalid_api_key", message: "Invalid API key" };
        }
    }
    if (record.revokedAt) {
        return { ok: false, status: 401, code: "revoked_api_key", message: "API key has been revoked" };
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
        return { ok: false, status: 401, code: "expired_api_key", message: "API key has expired" };
    }
    if (record.tenant.status !== "ACTIVE") {
        return { ok: false, status: 403, code: "tenant_disabled", message: "Company is not active" };
    }
    if (record.tenant.reseller && record.tenant.reseller.status !== "ACTIVE") {
        return { ok: false, status: 403, code: "tenant_disabled", message: "Reseller account is suspended" };
    }

    const scopes = parseScopes(record.scopes);

    const required = requiredScopeFor(pathname, method);
    if (required === null) {
        return {
            ok: false,
            status: 403,
            code: "insufficient_scope",
            message: "API keys cannot access administrative endpoints",
        };
    }
    if (!scopes.has(required)) {
        return {
            ok: false,
            status: 403,
            code: "insufficient_scope",
            message: `Missing scope: ${required}`,
        };
    }

    const now = Date.now();
    if (now - lastSeenWrite > 5000) {
        lastSeenWrite = now;
        prisma.apiKey
            .update({ where: { id: record.id }, data: { lastUsedAt: new Date(now) } })
            .catch(() => undefined);
    }

    // Instance binding: a key bound to one instance may only address that instance.
    if (record.instanceId && requiresInstanceAddress(pathname) && !pathname.includes(record.instanceId)) {
        return {
            ok: false,
            status: 403,
            code: "insufficient_scope",
            message: "This API key is bound to a different instance",
        };
    }

    // Represent the key by its creator (or the tenant owner) so legacy ownership checks work.
    let ownerUserId = record.createdById;
    if (!ownerUserId) {
        const owner = await prisma.tenantMember.findFirst({
            where: { tenantId: record.tenantId, role: "OWNER" },
            select: { userId: true },
        });
        ownerUserId = owner?.userId ?? null;
    }

    return {
        ok: true,
        context: {
            authMethod: "apiKey",
            requestId: nodeCrypto.randomUUID(),
            userId: ownerUserId,
            email: null,
            name: record.name,
            platformRole: "STAFF",
            isSuperAdmin: false,
            isMegaAdmin: false,
            resellerId: record.tenant.resellerId,
            tenantId: record.tenantId,
            tenantRole: "STAFF",
            permissions: new Set<Permission>([...scopes] as Permission[]),
            apiKey: {
                id: record.id,
                publicId: record.publicId,
                scopes,
                instanceId: record.instanceId,
            },
            ip: null,
        },
    };
}

/** Paths that address a specific instance ([sessionId] segment in the legacy API). */
function requiresInstanceAddress(pathname: string): boolean {
    const prefixes = [
        "/api/messages/",
        "/api/chat/",
        "/api/contacts/",
        "/api/groups/",
        "/api/labels/",
        "/api/scheduler/",
        "/api/webhooks/",
        "/api/sessions/",
        "/api/autoreplies/",
        "/api/profile/",
        "/api/broadcast/",
        "/api/v1/instances/",
    ];
    return prefixes.some((p) => pathname.startsWith(p));
}

/**
 * Creates (idempotently) the initial company for a user that has none.
 * Used by registration, by first login of a legacy user, and by scripts/migrate-tenancy.js.
 */
export async function ensureTenantForUser(user: { id: string; email: string; name?: string | null; role: string }): Promise<{
    tenantId: string;
    tenantRole: TenantRole;
}> {
    const existing = await prisma.tenantMember.findFirst({ where: { userId: user.id } });
    if (existing) return { tenantId: existing.tenantId, tenantRole: existing.role };

    const base = (user.email || user.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    const suffix = user.id.slice(-6);
    const slug = `${base || "empresa"}-${suffix}`;

    const tenant = await prisma.tenant.upsert({
        where: { slug },
        update: {},
        create: { slug, name: user.name || base || "Empresa" },
    });

    const role: TenantRole = fallbackTenantRole(user.role);
    await prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {},
        create: { tenantId: tenant.id, userId: user.id, role },
    });

    logger.info("Access", `Tenant ${tenant.slug} provisioned for ${user.email}`);
    return { tenantId: tenant.id, tenantRole: role };
}

async function authenticateSession(pathname: string, method: string): Promise<AuthResult> {
    const session = await auth();
    const userId = session?.user?.id;
    const userEmail = session?.user?.email;
    if (!userId && !userEmail) {
        return { ok: false, status: 401, code: "missing_credentials", message: "Authentication required" };
    }

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                ...(userId ? [{ id: userId }] : []),
                ...(userEmail ? [{ email: userEmail }] : []),
            ],
        },
        select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
        return { ok: false, status: 401, code: "missing_credentials", message: "Authentication required" };
    }

    const isMegaAdmin = user.role === "MEGA_ADMIN";
    const isSuperAdmin = (user.role === "SUPER_ADMIN" || user.role === "SUPERADMIN") && !isMegaAdmin;

    let tenantId: string | null = null;
    let tenantRole: TenantRole | null = null;
    let resellerId: string | null = null;

    if (isSuperAdmin) {
        const reseller = await prisma.reseller.findFirst({ where: { ownerId: user.id } });
        if (reseller) {
            resellerId = reseller.id;
        }
    }

    const membership = await prisma.tenantMember.findFirst({
        where: { userId: user.id },
        include: { tenant: true },
    });
    if (membership) {
        tenantId = membership.tenantId;
        tenantRole = membership.role;
        if (!resellerId && membership.tenant?.resellerId) {
            resellerId = membership.tenant.resellerId;
        }
    } else if (!isSuperAdmin && !isMegaAdmin) {
        // Lazily provision the initial company (migration safety net).
        const provisioned = await ensureTenantForUser(user);
        tenantId = provisioned.tenantId;
        tenantRole = provisioned.tenantRole;
    }

    const permissions = new Set<Permission>();
    if (tenantRole) {
        for (const p of permissionsForRole(tenantRole)) permissions.add(p);
    }
    if (isMegaAdmin) {
        for (const p of PERMISSIONS) permissions.add(p);
    } else if (isSuperAdmin) {
        for (const p of SUPER_ADMIN_PERMISSIONS) permissions.add(p);
    }

    void pathname;
    void method;

    return {
        ok: true,
        context: {
            authMethod: "session",
            requestId: nodeCrypto.randomUUID(),
            userId: user.id,
            email: user.email,
            name: user.name,
            platformRole: user.role,
            isSuperAdmin,
            isMegaAdmin,
            resellerId,
            tenantId,
            tenantRole,
            permissions,
            apiKey: null,
            ip: null,
        },
    };
}

/**
 * Session-only authentication (no request object available).
 * Used by server actions and by handlers declared without the NextRequest parameter.
 */
export async function authenticateSessionContext(): Promise<AuthResult> {
    return authenticateSession("/", "GET");
}

/**
 * Full authentication + authorization decision for an HTTP request.
 * Never throws for expected failures; returns a typed result.
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const rawKey = extractApiKey(request);

    let result: AuthResult;
    if (rawKey) {
        result = await authenticateApiKey(rawKey, pathname, method);
    } else {
        result = await authenticateSession(pathname, method);
    }

    if (result.ok) {
        result.context.ip = clientIp(request);
    }
    return result;
}

export function hasPermission(context: AccessContext | null | undefined, permission: Permission): boolean {
    if (!context) return false;
    if (context.isMegaAdmin) return true;
    return context.permissions.has(permission);
}

export function isPlatformAdmin(context: AccessContext | null | undefined): boolean {
    return !!context && context.isMegaAdmin;
}

export function isMegaAdmin(context: AccessContext | null | undefined): boolean {
    return !!context && context.isMegaAdmin;
}

export function isSuperAdmin(context: AccessContext | null | undefined): boolean {
    return !!context && context.isSuperAdmin && !context.isMegaAdmin;
}

export function isReseller(context: AccessContext | null | undefined): boolean {
    return !!context && context.isSuperAdmin && !context.isMegaAdmin;
}

export function isTenantAdmin(context: AccessContext | null | undefined): boolean {
    if (!context) return false;
    if (context.isMegaAdmin) return true;
    return context.tenantRole === "ADMIN" || context.tenantRole === "OWNER";
}

export function isOperationalUser(context: AccessContext | null | undefined): boolean {
    if (!context) return false;
    return context.tenantRole === "USER";
}

export { API_KEY_SCOPES };
