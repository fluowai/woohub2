import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseScopes, isValidApiKeyScope, permissionsForRole, PERMISSIONS, API_KEY_SCOPES, TenantRole } from "@/lib/permissions";

describe("permissions", () => {
    it("returns OWNER permissions", () => {
        const perms = permissionsForRole("OWNER");
        expect(perms).toContain("members:write");
        expect(perms).toContain("billing:write");
        expect(perms).toContain("plan:manage");
    });

    it("returns ADMIN permissions", () => {
        const perms = permissionsForRole("ADMIN");
        expect(perms).not.toContain("platform:admin");
        expect(perms).toContain("members:write");
        expect(perms).not.toContain("billing:write");
    });

    it("returns STAFF permissions", () => {
        const perms = permissionsForRole("STAFF");
        expect(perms).not.toContain("members:write");
        expect(perms).not.toContain("billing:read");
    });

    it("returns BILLING permissions", () => {
        const perms = permissionsForRole("BILLING");
        expect(perms).toContain("billing:read");
        expect(perms).toContain("instances:read");
    });

    it("parseScopes splits by space or comma", () => {
        const scopes = parseScopes("instances:read messages:send,contacts:read");
        expect(scopes.has("instances:read")).toBe(true);
        expect(scopes.has("messages:send")).toBe(true);
        expect(scopes.has("contacts:read")).toBe(true);
        expect(scopes.has("webhooks:write")).toBe(false);
    });

    it("isValidApiKeyScope rejects non-scope strings", () => {
        expect(isValidApiKeyScope("instances:read")).toBe(true);
        expect(isValidApiKeyScope("platform:admin")).toBe(false);
        expect(isValidApiKeyScope("random")).toBe(false);
    });

    it("PERMISSIONS and API_KEY_SCOPES are well-formed", () => {
        expect(PERMISSIONS.length).toBeGreaterThan(0);
        for (const s of API_KEY_SCOPES) {
            expect(isValidApiKeyScope(s)).toBe(true);
        }
    });
});
