import { describe, it, expect, vi, beforeEach } from "vitest";

// Pre-set environment variables before imports
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/woohub_test";

const {
    PERMISSIONS,
    SUPER_ADMIN_PERMISSIONS,
    permissionsForRole,
} = await import("@/lib/permissions");

const {
    isMegaAdmin,
    isSuperAdmin,
    isReseller,
    isTenantAdmin,
    isOperationalUser,
    requiredScopeFor,
} = await import("@/lib/access");

const {
    normalizeHostname,
    isValidHostname,
    isReservedHostname,
    generateVerificationToken,
} = await import("@/lib/domains");

const {
    canTenantProvisionInstance,
    validateResalePlanFeatures,
} = await import("@/lib/quotas/commercial");

describe("Commercial Hierarchy — Papéis e Permissões", () => {
    it("MEGA_ADMIN possui acesso administrativo global completo", () => {
        const megaContext: any = {
            platformRole: "MEGA_ADMIN",
            isMegaAdmin: true,
            isSuperAdmin: false,
            resellerId: null,
            tenantRole: null,
            permissions: new Set(PERMISSIONS),
        };

        expect(isMegaAdmin(megaContext)).toBe(true);
        expect(isSuperAdmin(megaContext)).toBe(false);
        expect(isReseller(megaContext)).toBe(false);
        expect(isOperationalUser(megaContext)).toBe(false);
        expect(megaContext.permissions.has("reseller:manage")).toBe(true);
        expect(megaContext.permissions.has("domains:manage")).toBe(true);
    });

    it("SUPER_ADMIN possui permissões de revenda mas não administra a plataforma global", () => {
        const superAdminContext: any = {
            platformRole: "SUPER_ADMIN",
            isMegaAdmin: false,
            isSuperAdmin: true,
            resellerId: "reseller-123",
            tenantRole: null,
            permissions: new Set(SUPER_ADMIN_PERMISSIONS),
        };

        expect(isMegaAdmin(superAdminContext)).toBe(false);
        expect(isSuperAdmin(superAdminContext)).toBe(true);
        expect(isReseller(superAdminContext)).toBe(true);
        expect(isOperationalUser(superAdminContext)).toBe(false);

        // Permissões permitidas para revendedor
        expect(superAdminContext.permissions.has("reseller:clients:read")).toBe(true);
        expect(superAdminContext.permissions.has("reseller:clients:write")).toBe(true);
        expect(superAdminContext.permissions.has("reseller:branding:manage")).toBe(true);
        expect(superAdminContext.permissions.has("reseller:domains:manage")).toBe(true);

        // Proibições estritas para revendedor
        expect(superAdminContext.permissions.has("reseller:manage")).toBe(false);
        expect(superAdminContext.permissions.has("platform:admin")).toBe(false);
        expect(superAdminContext.permissions.has("domains:manage")).toBe(false);
    });

    it("ADMIN cliente possui permissões administrativas na própria empresa", () => {
        const perms = permissionsForRole("ADMIN");
        expect(perms).toContain("instances:write");
        expect(perms).toContain("members:write");
        expect(perms).toContain("messages:send");
        expect(perms).not.toContain("reseller:manage");
        expect(perms).not.toContain("reseller:clients:write");
    });

    it("USER operacional pode apenas atender e enviar mensagens autorizadas; proibido criar recursos", () => {
        const userPerms = permissionsForRole("USER");
        const userContext: any = {
            platformRole: "USER",
            isMegaAdmin: false,
            isSuperAdmin: false,
            resellerId: null,
            tenantRole: "USER",
            permissions: new Set(userPerms),
        };

        expect(isOperationalUser(userContext)).toBe(true);
        expect(isTenantAdmin(userContext)).toBe(false);
        expect(isReseller(userContext)).toBe(false);

        // Autorizado para operação
        expect(userPerms).toContain("messages:send");
        expect(userPerms).toContain("messages:read");
        expect(userPerms).toContain("contacts:read");

        // Proibido estritamente criar instâncias, chaves, planos, domínios, webhooks, membros
        expect(userPerms).not.toContain("instances:write");
        expect(userPerms).not.toContain("webhooks:write");
        expect(userPerms).not.toContain("members:write");
        expect(userPerms).not.toContain("billing:write");
        expect(userPerms).not.toContain("reseller:manage");
        expect(userPerms).not.toContain("reseller:clients:write");
    });
});

describe("Controle de Domínios e Validação", () => {
    it("normaliza hostnames e remove portas, esquemas e barras", () => {
        expect(normalizeHostname("https://Api.Agencia-Alfa.com.br:8080/caminho")).toBe("api.agencia-alfa.com.br");
        expect(normalizeHostname("   sub.meu-dominio.com.br   ")).toBe("sub.meu-dominio.com.br");
    });

    it("rejeita hostnames inválidos segundo RFC 1123", () => {
        expect(isValidHostname("api.agencia.com.br")).toBe(true);
        expect(isValidHostname("woohub.app")).toBe(true);
        expect(isValidHostname("-invalido.com")).toBe(false);
        expect(isValidHostname("invalido-.com")).toBe(false);
        expect(isValidHostname("inv@lido.com")).toBe(false);
        expect(isValidHostname("")).toBe(false);
    });

    it("bloqueia hosts reservados para proteger a infraestrutura", () => {
        expect(isReservedHostname("localhost")).toBe(true);
        expect(isReservedHostname("127.0.0.1")).toBe(true);
        expect(isReservedHostname("0.0.0.0")).toBe(true);
        expect(isReservedHostname("admin.local")).toBe(false); // not explicitly in reserved list
        expect(isReservedHostname("admin.woohub.local")).toBe(true);
        expect(isReservedHostname("app.agencia-alfa.com.br")).toBe(false);
    });

    it("gera token de desafio DNS TXT criptográfico e consistente", () => {
        const token1 = generateVerificationToken();
        const token2 = generateVerificationToken();
        expect(token1).toMatch(/^whb_chk_[a-f0-9]{32}$/);
        expect(token2).toMatch(/^whb_chk_[a-f0-9]{32}$/);
        expect(token1).not.toBe(token2);
    });
});

describe("Cotas e Revenda — Regras de Isolamento", () => {
    it("bloqueia criação de instâncias caso o revendedor esteja SUSPENSO", async () => {
        const suspendedTenantMock: any = {
            id: "t-1",
            status: "ACTIVE",
            maxInstances: 5,
            reseller: {
                id: "r-1",
                status: "SUSPENDED",
            },
            sessions: [],
        };

        const result = await canTenantProvisionInstance(suspendedTenantMock);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("A conta do revendedor está suspensa");
    });

    it("bloqueia criação de instâncias caso o limite de instâncias do plano do cliente seja atingido", async () => {
        const fullTenantMock: any = {
            id: "t-1",
            status: "ACTIVE",
            maxInstances: 2,
            reseller: {
                id: "r-1",
                status: "ACTIVE",
            },
            sessions: [{ id: "s-1" }, { id: "s-2" }],
        };

        const result = await canTenantProvisionInstance(fullTenantMock);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Limite de instâncias atingido (2/2)");
    });

    it("permite provisionamento se tenant e revendedor estão ativos com saldo livre", async () => {
        const validTenantMock: any = {
            id: "t-1",
            status: "ACTIVE",
            maxInstances: 5,
            reseller: {
                id: "r-1",
                status: "ACTIVE",
            },
            sessions: [{ id: "s-1" }, { id: "s-2" }],
        };

        const result = await canTenantProvisionInstance(validTenantMock);
        expect(result.allowed).toBe(true);
    });

    it("valida que planos de revenda não podem oferecer recursos bloqueados pelo Mega Admin", () => {
        const resellerFeatures = {
            chat: true,
            broadcast: false, // Bloqueado pelo Mega Admin
            bot: true,
        };

        const invalidPlanFeatures = {
            chat: true,
            broadcast: true, // Tentando revender recurso não contratado
        };

        const validation = validateResalePlanFeatures(resellerFeatures, invalidPlanFeatures);
        expect(validation.valid).toBe(false);
        expect(validation.forbiddenFeatures).toContain("broadcast");
    });
});

describe("Segurança de Rotas Administrativas", () => {
    it("rotas de Mega Admin e Super Admin nunca aceitam chaves de API", () => {
        expect(requiredScopeFor("/api/mega-admin/resellers", "GET")).toBeNull();
        expect(requiredScopeFor("/api/mega-admin/direct-clients", "POST")).toBeNull();
        expect(requiredScopeFor("/api/super-admin/clients", "GET")).toBeNull();
        expect(requiredScopeFor("/api/super-admin/branding", "PUT")).toBeNull();
    });
});
