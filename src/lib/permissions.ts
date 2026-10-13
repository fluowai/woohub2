/**
 * Explicit permission model for Woohub.
 *
 * Permissions are independent strings; there is no numeric hierarchy deciding every operation.
 * Tenant roles (TenantMember.role) map to permission sets below, and API keys carry a subset
 * of scopes that can never include platform-level permissions.
 */

export const PERMISSIONS = [
    "instances:read",
    "instances:write",
    "messages:read",
    "messages:send",
    "contacts:read",
    "contacts:write",
    "groups:read",
    "groups:write",
    "webhooks:read",
    "webhooks:write",
    "apikeys:read",
    "apikeys:write",
    "members:read",
    "members:write",
    "billing:read",
    "billing:write",
    "logs:read",
    "audit:read",
    "plan:manage",
    "platform:admin",
    "resellers:manage",
    "domains:manage",
    "features:manage",
    "system:monitor",
    "reseller:manage",
    "reseller:clients:read",
    "reseller:clients:write",
    "reseller:plans:manage",
    "reseller:branding:manage",
    "reseller:domains:manage",
    "reseller:quotas:read",
    "reseller:audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Scopes a customer API key may ever hold (never platform:admin or billing:write). */
export const API_KEY_SCOPES = [
    "instances:read",
    "instances:write",
    "messages:read",
    "messages:send",
    "contacts:read",
    "webhooks:read",
    "webhooks:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type TenantRole = "OWNER" | "ADMIN" | "STAFF" | "BILLING" | "USER";

const TENANT_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
    OWNER: [
        "instances:read",
        "instances:write",
        "messages:read",
        "messages:send",
        "contacts:read",
        "contacts:write",
        "groups:read",
        "groups:write",
        "webhooks:read",
        "webhooks:write",
        "apikeys:read",
        "apikeys:write",
        "members:read",
        "members:write",
        "billing:read",
        "billing:write",
        "logs:read",
        "audit:read",
        "plan:manage",
    ],
    ADMIN: [
        "instances:read",
        "instances:write",
        "messages:read",
        "messages:send",
        "contacts:read",
        "contacts:write",
        "groups:read",
        "groups:write",
        "webhooks:read",
        "webhooks:write",
        "apikeys:read",
        "apikeys:write",
        "members:read",
        "members:write",
        "billing:read",
        "logs:read",
        "audit:read",
    ],
    STAFF: [
        "instances:read",
        "messages:read",
        "messages:send",
        "contacts:read",
        "groups:read",
        "webhooks:read",
        "logs:read",
    ],
    BILLING: ["billing:read", "billing:write", "members:read", "audit:read", "instances:read"],
    USER: [
        "instances:read",
        "messages:read",
        "messages:send",
        "contacts:read",
        "groups:read",
        "logs:read",
    ],
};

export const SUPER_ADMIN_PERMISSIONS: readonly Permission[] = [
    "reseller:clients:read",
    "reseller:clients:write",
    "reseller:plans:manage",
    "reseller:branding:manage",
    "reseller:domains:manage",
    "reseller:quotas:read",
    "reseller:audit:read",
    "instances:read",
    "billing:read",
    "billing:write",
    "audit:read",
];

export function permissionsForRole(role: TenantRole): readonly Permission[] {
    return TENANT_PERMISSIONS[role] ?? [];
}

export function isValidApiKeyScope(scope: string): scope is ApiKeyScope {
    return (API_KEY_SCOPES as readonly string[]).includes(scope);
}

export function parseScopes(raw: string | null | undefined): Set<ApiKeyScope> {
    const scopes = new Set<ApiKeyScope>();
    for (const part of (raw || "").split(/[\s,]+/)) {
        if (isValidApiKeyScope(part)) scopes.add(part);
    }
    return scopes;
}

/**
 * Maps a legacy `Role` (platform-level column kept for compatibility) to an effective
 * tenant role for users that have not been assigned an explicit TenantMember role.
 * Used only as a fallback during migration; explicit membership always wins.
 */
export function fallbackTenantRole(platformRole: string): TenantRole {
    if (platformRole === "MEGA_ADMIN") return "OWNER";
    if (platformRole === "SUPERADMIN") return "OWNER";
    if (platformRole === "STAFF") return "STAFF";
    return "OWNER";
}
