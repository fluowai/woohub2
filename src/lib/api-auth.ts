import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { AccessContext, authenticateRequest, authenticateSessionContext, currentContext, ensureTenantForUser } from "./access";
import { Permission, TenantRole } from "./permissions";
import { generateApiKey as generateSecureKey, redactApiKey } from "./security/api-keys";
import { audit } from "./audit";

/**
 * Authorization helpers.
 *
 * All checks are tenant-aware: a user can only ever see resources of the company they
 * belong to (SUPERADMIN is global and every global access is audited). Numeric role
 * hierarchies are no longer used to decide operations — explicit permissions are.
 *
 * Tenant/role resolution is always derived from the database for the given user id, so the
 * helpers stay correct even when called outside the request context that authenticated them.
 * API-key instance binding is enforced at authentication time (see requiredScopeFor /
 * instance binding checks in src/lib/access.ts).
 */

export interface AuthenticatedUser {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
    authMethod: "session" | "apiKey";
    tenantId: string | null;
    tenantRole: TenantRole | null;
    permissions: Set<Permission>;
    scopes: Set<string>;
    context: AccessContext;
}

function toUser(context: AccessContext): AuthenticatedUser {
    return {
        id: context.userId ?? "",
        email: context.email,
        name: context.name,
        role: context.isSuperAdmin ? "SUPERADMIN" : context.platformRole,
        authMethod: context.authMethod,
        tenantId: context.tenantId,
        tenantRole: context.tenantRole,
        permissions: context.permissions,
        scopes: context.apiKey ? new Set(context.apiKey.scopes) : new Set([...context.permissions]),
        context,
    };
}

/**
 * Get authenticated user from either session or API key.
 * Returns null when the credential is missing, invalid, revoked, expired or lacks the
 * scope required for this endpoint.
 */
export async function getAuthenticatedUser(request?: NextRequest): Promise<AuthenticatedUser | null> {
    if (request) {
        const result = await authenticateRequest(request);
        if (!result.ok) return null;
        return toUser(result.context);
    }

    const existing = currentContext();
    if (existing) return toUser(existing);

    const sessionResult = await authenticateSessionContext();
    return sessionResult.ok ? toUser(sessionResult.context) : null;
}

/**
 * Parses the request and returns a typed success/failure so routes can answer with the
 * correct status code (401/403) instead of a generic 500.
 */
export async function authorizeRequest(request: NextRequest): Promise<
    | { ok: true; user: AuthenticatedUser }
    | { ok: false; status: number; body: Record<string, unknown> }
> {
    const result = await authenticateRequest(request);
    if (!result.ok) {
        return {
            ok: false,
            status: result.status,
            body: { status: false, code: result.code, message: result.message, error: result.message },
        };
    }
    return { ok: true, user: toUser(result.context) };
}

/**
 * Check if user has required role (explicit comparison, no numeric hierarchy).
 */
export function hasRole(userRole: string, requiredRole: TenantRole | "SUPERADMIN"): boolean {
    if (requiredRole === "SUPERADMIN") return userRole === "SUPERADMIN";
    return userRole === requiredRole;
}

/** Platform administration check. Prefer can(user, 'platform:admin'). */
export function isAdmin(userRole: string): boolean {
    return userRole === "SUPERADMIN";
}

export function can(user: AuthenticatedUser | null, permission: Permission): boolean {
    if (!user) return false;
    if (user.permissions.has(permission)) return true;
    return user.context.isSuperAdmin && permission !== "platform:admin";
}

interface SessionWhere {
    id: string;
    userId: string;
    tenantId: string | null;
    sessionId: string;
}

async function findSessionForAuth(sessionId: string): Promise<SessionWhere | null> {
    return prisma.session.findFirst({
        where: { OR: [{ id: sessionId }, { sessionId }] },
        select: { id: true, userId: true, tenantId: true, sessionId: true },
    });
}

async function membershipOf(userId: string): Promise<{ tenantId: string; role: TenantRole } | null> {
    const membership = await prisma.tenantMember.findFirst({ where: { userId } });
    if (membership) return { tenantId: membership.tenantId, role: membership.role };
    const provisioned = await ensureTenantForUser({ id: userId, email: "", role: "OWNER" }).catch(() => null);
    return provisioned ? { tenantId: provisioned.tenantId, role: provisioned.tenantRole } : null;
}

/**
 * Check if user can access a session (instance).
 * - SUPERADMIN can access everything (each global access is audited).
 * - Otherwise the instance must belong to the caller's tenant, and the caller must be
 *   the owner, hold shared access inside the tenant, or (STAFF) be explicitly assigned.
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    const context = currentContext() ?? null;

    if (userRole === "SUPERADMIN") {
        await audit({
            actorLabel: context?.email || userId,
            actorType: context?.authMethod === "apiKey" ? "API_KEY" : "USER",
            action: "superadmin.access",
            resource: "session",
            resourceId: sessionId,
            metadata: { reason: "platform_admin" },
        });
        return true;
    }

    const session = await findSessionForAuth(sessionId);
    if (!session) return false;

    const membership = await membershipOf(userId);
    if (!membership) return false;

    // Tenant isolation: legacy rows without tenantId stay visible to their owner only.
    if (session.tenantId && session.tenantId !== membership.tenantId) return false;

    if (session.userId === userId) return true;
    if (!session.tenantId) return false;

    const shared = await prisma.sessionAccess.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId } },
    });
    if (shared) return true;

    // STAFF without explicit assignment cannot reach the instance.
    return membership.role !== "STAFF";
}

/**
 * Check if user is the actual owner of a session (not just shared access).
 * Used for protecting management endpoints (e.g. granting/revoking access).
 */
export async function isSessionOwner(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (userRole === "SUPERADMIN") return true;

    const session = await findSessionForAuth(sessionId);
    if (!session) return false;

    if (session.userId === userId) {
        const membership = await membershipOf(userId);
        if (membership && session.tenantId && session.tenantId !== membership.tenantId) return false;
        return true;
    }

    const membership = await membershipOf(userId);
    if (!membership || !session.tenantId || session.tenantId !== membership.tenantId) return false;
    return membership.role !== "STAFF";
}

const SESSION_INCLUDE = {
    user: { select: { name: true, email: true } },
    botConfig: true,
    webhooks: true,
    _count: {
        select: {
            contacts: true,
            messages: true,
            groups: true,
            autoReplies: true,
            scheduledMessages: true,
        },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/**
 * Get sessions that user can access, always scoped to their tenant.
 * - SUPERADMIN sees everything.
 * - STAFF sees owned + explicitly assigned instances only.
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (userRole === "SUPERADMIN") {
        return prisma.session.findMany({
            orderBy: { createdAt: "desc" },
            include: SESSION_INCLUDE,
        });
    }

    const membership = await membershipOf(userId);
    if (!membership) return [];

    const tenantScope = { OR: [{ tenantId: membership.tenantId }, { tenantId: null, userId }] };

    if (membership.role === "STAFF") {
        const sharedAccess = await prisma.sessionAccess.findMany({
            where: { userId },
            select: { sessionId: true },
        });
        return prisma.session.findMany({
            where: {
                AND: [
                    tenantScope,
                    { OR: [{ userId }, { id: { in: sharedAccess.map((a) => a.sessionId) } }] },
                ],
            },
            orderBy: { createdAt: "desc" },
            include: SESSION_INCLUDE,
        });
    }

    const [owned, sharedAccess] = await Promise.all([
        prisma.session.findMany({
            where: { AND: [tenantScope, { userId }] },
            orderBy: { createdAt: "desc" },
            include: SESSION_INCLUDE,
        }),
        prisma.sessionAccess.findMany({
            where: { userId },
            select: { sessionId: true },
        }),
    ]);

    if (sharedAccess.length === 0) return owned;

    const ownedIds = new Set(owned.map((s) => s.id));
    const missingIds = sharedAccess.map((a) => a.sessionId).filter((id) => !ownedIds.has(id));
    if (missingIds.length === 0) return owned;

    const sharedSessions = await prisma.session.findMany({
        where: { AND: [tenantScope, { id: { in: missingIds } }] },
        orderBy: { createdAt: "desc" },
        include: SESSION_INCLUDE,
    });

    return [...owned, ...sharedSessions];
}

/**
 * Generate a new API key (cryptographically secure).
 * @deprecated Prefer creating a record through /api/api-keys so only the hash is stored.
 */
export function generateApiKey(): string {
    return generateSecureKey().key;
}

export { redactApiKey, logger };
