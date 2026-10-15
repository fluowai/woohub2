import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, v1ErrorResponse, v1NoContent, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";
import { assertHttpUrl, mapWebhook, requireWebhook, updateWebhookSchema } from "@/lib/v1/webhook";
import { encryptWebhookSecret } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ webhookId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { webhookId } = await params;
        const webhook = await requireWebhook(user, webhookId);
        return v1Ok(mapWebhook(webhook));
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}

/** Atualiza nome, URL, eventos, segredo, estado ou instância vinculada. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ webhookId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { webhookId } = await params;
        const webhook = await requireWebhook(user, webhookId);

        const parsed = updateWebhookSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw badRequest("Corpo inválido", parsed.error.flatten());

        const body = parsed.data;
        if (body.url) assertHttpUrl(body.url);

        let sessionPk: string | null | undefined;
        if (body.instance_id !== undefined) {
            if (body.instance_id === null) {
                sessionPk = null;
            } else {
                const instance = await requireInstance(user, body.instance_id);
                sessionPk = instance.id;
            }
        }

        const encryptedSecret = body.secret !== undefined ? encryptWebhookSecret(webhook.id, body.secret) : undefined;

        const updated = await prisma.webhook.update({
            where: { id: webhook.id },
            data: {
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.url !== undefined ? { url: body.url } : {}),
                ...(body.events !== undefined ? { events: body.events } : {}),
                ...(body.secret !== undefined ? { secret: encryptedSecret } : {}),
                ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
                ...(sessionPk !== undefined ? { sessionId: sessionPk } : {}),
            },
        });

        return v1Ok(mapWebhook(updated));
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ webhookId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { webhookId } = await params;
        const webhook = await requireWebhook(user, webhookId);

        await prisma.webhook.delete({ where: { id: webhook.id } });
        return v1NoContent();
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}
