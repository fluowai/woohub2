import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { AuthenticatedUser } from "@/lib/api-auth";
import { badRequest, forbidden, notFound } from "./http";

/** Single source of webhook events (re-exported from the delivery layer). */
export { WEBHOOK_EVENT_TYPES } from "@/lib/webhook";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook";

const eventList = z
    .array(z.string().min(1))
    .min(1)
    .refine(
        (events) => events.every((e) => e === "*" || (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)),
        { message: `Eventos válidos: ${WEBHOOK_EVENT_TYPES.join(", ")} ou "*"` }
    );

export const createWebhookSchema = z.object({
    name: z.string().trim().min(1).max(80),
    url: z.string().url(),
    events: eventList,
    secret: z.string().min(8).max(128).optional(),
    instance_id: z.string().trim().min(3).max(64).optional(),
});

export const updateWebhookSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    url: z.string().url().optional(),
    events: eventList.optional(),
    secret: z.string().min(8).max(128).nullable().optional(),
    is_active: z.boolean().optional(),
    instance_id: z.string().trim().min(3).max(64).nullable().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

/** Webhook delivery only makes sense over http/https (SSRF rules apply at send time). */
export function assertHttpUrl(url: string) {
    const protocol = new URL(url).protocol;
    if (protocol !== "http:" && protocol !== "https:") {
        throw badRequest("Somente URLs http/https são aceitas em webhooks");
    }
}

export type WebhookRecord = Awaited<ReturnType<typeof findWebhook>>;

async function findWebhook(webhookId: string) {
    return prisma.webhook.findUnique({ where: { id: webhookId } });
}

/**
 * Loads a webhook and enforces tenant isolation:
 *   - webhook bound to a company  -> only that company (SUPERADMIN is global, audited)
 *   - legacy webhook without company -> only its creator
 */
export async function requireWebhook(user: AuthenticatedUser, webhookId: string) {
    const webhook = await findWebhook(webhookId);
    if (!webhook) throw notFound("Webhook não encontrado");

    const mine = webhook.tenantId ? webhook.tenantId === user.tenantId : webhook.userId === user.id;
    if (mine) return webhook;

    if (user.context.isSuperAdmin) {
        await audit({
            action: "superadmin.access",
            resource: "webhook",
            resourceId: webhook.id,
            metadata: { reason: "platform_admin" },
        });
        return webhook;
    }

    throw forbidden("Sem acesso a este webhook");
}

/** Public representation — the HMAC secret is never returned, only its presence. */
export function mapWebhook(webhook: {
    id: string;
    name: string;
    url: string;
    events: unknown;
    isActive: boolean;
    sessionId: string | null;
    secret: string | null;
    createdAt: Date;
    updatedAt: Date;
}) {
    return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        is_active: webhook.isActive,
        instance_id: webhook.sessionId,
        secret_configured: !!webhook.secret,
        created_at: webhook.createdAt.toISOString(),
        updated_at: webhook.updatedAt.toISOString(),
    };
}
