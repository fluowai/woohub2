import { prisma } from "../prisma";
import { logger } from "../logger";

export interface ResellerQuotaSummary {
    resellerId: string;
    resellerName: string;
    status: string;
    contractedInstances: number;
    allocatedInstances: number;
    availableInstances: number;
    connectedInstances: number;
    totalTenants: number;
    maxTenants: number;
    availableTenants: number;
    features: Record<string, boolean>;
}

/**
 * Returns complete quota metrics for a reseller operation.
 */
export async function getResellerQuotaSummary(resellerId: string): Promise<ResellerQuotaSummary> {
    const reseller = await prisma.reseller.findUnique({
        where: { id: resellerId },
        include: {
            tenants: {
                select: {
                    id: true,
                    maxInstances: true,
                    status: true,
                },
            },
        },
    });

    if (!reseller) {
        throw new Error("Revendedor não encontrado");
    }

    const contractedInstances = reseller.maxInstances || 0;
    const allocatedInstances = reseller.tenants.reduce((sum, t) => sum + (t.maxInstances || 0), 0);
    const availableInstances = Math.max(0, contractedInstances - allocatedInstances);

    // Count connected instances across all tenants of this reseller
    const tenantIds = reseller.tenants.map((t) => t.id);
    const connectedInstances = tenantIds.length > 0
        ? await prisma.session.count({
              where: {
                  tenantId: { in: tenantIds },
                  status: "CONNECTED",
              },
          })
        : 0;

    const totalTenants = reseller.tenants.length;
    const maxTenants = reseller.maxTenants || 50;
    const availableTenants = Math.max(0, maxTenants - totalTenants);

    return {
        resellerId: reseller.id,
        resellerName: reseller.name,
        status: reseller.status,
        contractedInstances,
        allocatedInstances,
        availableInstances,
        connectedInstances,
        totalTenants,
        maxTenants,
        availableTenants,
        features: (reseller.features as Record<string, boolean>) || {},
    };
}

/**
 * Concurrency-safe allocation of instance quota to a client company.
 * Uses an atomic transaction to ensure total allocations never exceed reseller capacity.
 */
export async function allocateInstancesToTenant({
    resellerId,
    tenantId,
    count,
}: {
    resellerId: string;
    tenantId: string;
    count: number;
}): Promise<{ allocated: number; available: number }> {
    if (count < 1) {
        throw new Error("Quantidade de instâncias deve ser de pelo menos 1");
    }

    return await prisma.$transaction(async (tx) => {
        const reseller = await tx.reseller.findUnique({
            where: { id: resellerId },
            select: { id: true, maxInstances: true, status: true },
        });

        if (!reseller) {
            throw new Error("Revendedor não encontrado");
        }

        if (reseller.status !== "ACTIVE") {
            throw new Error("Operação de revenda suspensa. Não é possível alocar instâncias.");
        }

        // Calculate sum of instances allocated to other tenants of this reseller
        const otherTenants = await tx.tenant.aggregate({
            where: {
                resellerId,
                id: { not: tenantId },
            },
            _sum: {
                maxInstances: true,
            },
        });

        const currentOtherAllocated = otherTenants._sum.maxInstances || 0;
        const newTotal = currentOtherAllocated + count;

        if (newTotal > reseller.maxInstances) {
            const available = Math.max(0, reseller.maxInstances - currentOtherAllocated);
            throw new Error(
                `Limite de cotas excedido. Capacidade contratada: ${reseller.maxInstances}, disponível para alocação: ${available}, solicitado: ${count}`
            );
        }

        // Update the tenant's maxInstances limit
        await tx.tenant.update({
            where: { id: tenantId },
            data: { maxInstances: count },
        });

        // Record or update InstanceAllocation
        await tx.instanceAllocation.upsert({
            where: {
                resellerId_tenantId: {
                    resellerId,
                    tenantId,
                },
            },
            update: {
                allocated: count,
            },
            create: {
                resellerId,
                tenantId,
                allocated: count,
            },
        });

        const availableLeft = reseller.maxInstances - newTotal;
        logger.info("Quotas", `Allocated ${count} instances to tenant ${tenantId} under reseller ${resellerId}`);

        return { allocated: count, available: availableLeft };
    });
}

/**
 * Checks if a tenant is authorized to provision a new WhatsApp session/instance.
 */
export async function canTenantProvisionInstance(
    tenantOrId: string | { id: string; status: string; maxInstances: number; reseller?: { id: string; status: string } | null; sessions?: any[] }
): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    maxAllowed: number;
}> {
    let tenant: any;
    let currentCount = 0;

    if (typeof tenantOrId === "string") {
        tenant = await prisma.tenant.findUnique({
            where: { id: tenantOrId },
            include: { reseller: true },
        });
        if (tenant) {
            currentCount = await prisma.session.count({
                where: { tenantId: tenantOrId },
            });
        }
    } else {
        tenant = tenantOrId;
        currentCount = Array.isArray(tenantOrId.sessions) ? tenantOrId.sessions.length : 0;
    }

    if (!tenant) {
        return { allowed: false, reason: "Empresa não encontrada", currentCount: 0, maxAllowed: 0 };
    }

    if (tenant.status !== "ACTIVE") {
        return { allowed: false, reason: "Empresa suspensa ou desativada", currentCount: 0, maxAllowed: tenant.maxInstances };
    }

    // Check reseller status if client belongs to a reseller
    if (tenant.reseller && tenant.reseller.status !== "ACTIVE") {
        return {
            allowed: false,
            reason: "A conta do revendedor está suspensa. Operações de provisionamento bloqueadas.",
            currentCount: 0,
            maxAllowed: tenant.maxInstances,
        };
    }

    const maxAllowed = tenant.maxInstances || 1;

    if (currentCount >= maxAllowed) {
        return {
            allowed: false,
            reason: `Limite de instâncias atingido (${currentCount}/${maxAllowed}). Faça upgrade para provisionar mais conexões.`,
            currentCount,
            maxAllowed,
        };
    }

    return { allowed: true, currentCount, maxAllowed };
}

/**
 * Validates that a resale plan does not grant features forbidden or not contracted by the reseller.
 */
export function validateResalePlanFeatures(
    resellerFeatures: Record<string, boolean> | null | undefined,
    requestedPlanFeatures: Record<string, boolean> | null | undefined
): { valid: boolean; forbiddenFeatures: string[] } {
    if (!requestedPlanFeatures) return { valid: true, forbiddenFeatures: [] };
    const allowed = resellerFeatures || {};

    const forbidden: string[] = [];
    for (const [feat, enabled] of Object.entries(requestedPlanFeatures)) {
        if (enabled && !allowed[feat]) {
            forbidden.push(feat);
        }
    }

    return {
        valid: forbidden.length === 0,
        forbiddenFeatures: forbidden,
    };
}
