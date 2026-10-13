import { prisma } from "./prisma";
import { logger } from "./logger";
import { currentContext, currentContextAsync } from "./access";

/**
 * Append-only audit trail.
 *
 * Used for platform-admin (SUPERADMIN) global access, credential management,
 * subscription/billing changes and configuration access.
 */

export interface AuditEntry {
    tenantId?: string | null;
    resellerId?: string | null;
    actorUserId?: string | null;
    actorLabel?: string;
    actorType?: "USER" | "API_KEY" | "SYSTEM";
    action: string;
    resource?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    requestId?: string | null;
}

export async function audit(entry: AuditEntry): Promise<void> {
    const context = (await currentContextAsync()) ?? currentContext() ?? null;
    try {
        await prisma.auditLog.create({
            data: {
                tenantId: entry.tenantId ?? context?.tenantId ?? null,
                resellerId: entry.resellerId ?? context?.resellerId ?? null,
                actorUserId: entry.actorUserId ?? context?.userId ?? null,
                actorLabel: entry.actorLabel ?? context?.email ?? context?.apiKey?.publicId ?? "system",
                actorType: entry.actorType ?? (context?.authMethod === "apiKey" ? "API_KEY" : "USER"),
                action: entry.action,
                resource: entry.resource ?? null,
                resourceId: entry.resourceId ?? null,
                metadata: (entry.metadata as never) ?? undefined,
                ip: entry.ip ?? context?.ip ?? null,
                requestId: entry.requestId ?? context?.requestId ?? null,
            },
        });
    } catch (error) {
        // Auditing must never break the main operation, but failures are loud.
        logger.error("Audit", `Failed to record audit entry for ${entry.action}:`, error);
    }
}

export const recordAudit = audit;
