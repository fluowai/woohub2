import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, requireUser, v1Created, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";
import { assertHttpUrl, createWebhookSchema, mapWebhook } from "@/lib/v1/webhook";

export const dynamic = "force-dynamic";

/** Lista os webhooks da empresa (mais os legados criados por você). */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const webhooks = await prisma.webhook.findMany({
            where: {
                OR: [
                    ...(user.tenantId ? [{ tenantId: user.tenantId }] : []),
                    { tenantId: null, userId: user.id },
                ],
            },
            orderBy: { createdAt: "desc" },
        });

        return v1Ok(webhooks.map(mapWebhook), { total: webhooks.length });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}

/** Cria um webhook. `instance_id` opcional restringe os eventos àquela instância. */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const parsed = createWebhookSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw badRequest("Corpo inválido", parsed.error.flatten());

        const body = parsed.data;
        assertHttpUrl(body.url);

        // Chave vinculada a uma instância: o webhook nasce ligado a ela (nunca a outra).
        let instanceRef = body.instance_id;
        const bound = user.context.apiKey?.instanceId ?? null;
        if (bound) {
            if (instanceRef && instanceRef !== bound) {
                throw forbidden("Chave vinculada a uma instância diferente da informada");
            }
            instanceRef = bound;
        }

        let sessionPk: string | null = null;
        if (instanceRef) {
            const instance = await requireInstance(user, instanceRef);
            sessionPk = instance.id;
        }

        const webhook = await prisma.webhook.create({
            data: {
                userId: user.id,
                tenantId: user.tenantId,
                sessionId: sessionPk,
                name: body.name,
                url: body.url,
                secret: body.secret ?? null,
                events: body.events,
                isActive: true,
            },
        });

        return v1Created(mapWebhook(webhook));
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
