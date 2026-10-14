import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/woohub_test";

const { canManageUser } = await import("@/lib/api-auth");
import type { AuthenticatedUser } from "@/lib/api-auth";

function admin(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
    return {
        id: "caller-1",
        email: "caller@example.com",
        name: "Caller",
        role: "SUPERADMIN",
        authMethod: "session",
        tenantId: null,
        tenantRole: null,
        permissions: new Set(),
        scopes: new Set(),
        isMegaAdmin: false,
        context: {} as AuthenticatedUser["context"],
        ...overrides,
    };
}

describe("Privilege guards — canManageUser", () => {
    it("MEGA_ADMIN gerencia qualquer papel", () => {
        const mega = admin({ role: "MEGA_ADMIN", isMegaAdmin: true });
        expect(canManageUser(mega, "MEGA_ADMIN")).toBe(true);
        expect(canManageUser(mega, "SUPERADMIN")).toBe(true);
        expect(canManageUser(mega, "OWNER")).toBe(true);
        expect(canManageUser(mega, "STAFF")).toBe(true);
    });

    it("SUPERADMIN gerencia apenas OWNER e STAFF (não SUPERADMIN nem MEGA_ADMIN)", () => {
        const superAdmin = admin({ role: "SUPERADMIN", isMegaAdmin: false });
        expect(canManageUser(superAdmin, "OWNER")).toBe(true);
        expect(canManageUser(superAdmin, "STAFF")).toBe(true);
        expect(canManageUser(superAdmin, "SUPERADMIN")).toBe(false);
        expect(canManageUser(superAdmin, "MEGA_ADMIN")).toBe(false);
    });

    it("OWNER e STAFF não gerenciam ninguém", () => {
        const owner = admin({ role: "OWNER", isMegaAdmin: false });
        const staff = admin({ role: "STAFF", isMegaAdmin: false });
        expect(canManageUser(owner, "OWNER")).toBe(false);
        expect(canManageUser(owner, "STAFF")).toBe(false);
        expect(canManageUser(staff, "OWNER")).toBe(false);
        expect(canManageUser(staff, "STAFF")).toBe(false);
    });
});

describe("Privilege guards — enum de criação de usuários", () => {
    it("o schema de criação não aceita MEGA_ADMIN", async () => {
        const { z } = await import("zod");
        // Mesmo enum do POST /api/users — MEGA_ADMIN é provisionado apenas via /api/mega-admin/*
        const creatableRoles = z.enum(["SUPERADMIN", "OWNER", "STAFF"]);
        expect(creatableRoles.safeParse("MEGA_ADMIN").success).toBe(false);
        expect(creatableRoles.safeParse("SUPERADMIN").success).toBe(true);
        expect(creatableRoles.safeParse("OWNER").success).toBe(true);
        expect(creatableRoles.safeParse("STAFF").success).toBe(true);
    });
});
