import type { NextRequest } from "next/server";
import { z } from "zod";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { waManager } from "@/modules/whatsapp/manager";
import { prisma } from "@/lib/prisma";
import { assertSendQuota } from "@/lib/quota";
import { enqueueSendJob } from "@/lib/queue";
import { HttpError, badRequest, requireUser, v1Accepted, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance, toJid } from "@/lib/v1/instance";
import { idempotencyKey, requestFingerprint, withIdempotency } from "@/lib/v1/idempotency";
import { mapMessage } from "@/lib/v1/message";

export const dynamic = "force-dynamic";

const sendSchema = z
    .object({
        to: z.string().trim().min(1),
        text: z.string().min(1).optional(),
        media_url: z.string().url().optional(),
        media_type: z.enum(["image", "video", "audio", "document"]).optional(),
        caption: z.string().optional(),
        mentions: z.array(z.string()).optional(),
        quoted_message_id: z.string().optional(),
    })
    .refine((body) => !!body.text !== !!body.media_url, {
        message: "Informe exatamente um dos campos: text ou media_url",
    });

/**
 * GET  → histórico de mensagens de um chat (cursor por `before`).
 * POST → envio síncrono (texto) ou enfileirado (mídia por URL, com SSRF na entrega).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const { searchParams } = new URL(request.url);
        const jid = searchParams.get("jid");
        if (!jid) throw badRequest("Informe o parâmetro obrigatório: jid");

        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
        const before = searchParams.get("before") || undefined;
        if (before && Number.isNaN(Date.parse(before))) {
            throw badRequest("Parâmetro before deve ser uma data ISO válida");
        }

        const result = await ChatService.getMessages(ref.id, jid, limit, before);
        return v1Ok(result.messages.map(mapMessage), { has_more: result.hasMore, limit });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const rawBody = await request.text();
        let body: unknown = null;
        try {
            body = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            throw badRequest("JSON inválido no corpo da requisição");
        }
        const parsed = sendSchema.safeParse(body);
        if (!parsed.success) throw badRequest("Corpo inválido", parsed.error.flatten());

        const execute = async () => {
            const jid = toJid(parsed.data.to);
            const live = waManager.getInstance(ref.sessionId);
            if (!live?.socket) {
                throw new HttpError(409, "instance_not_connected", "Instância não está conectada");
            }

            if (parsed.data.text) {
                try {
                    const result = await ChatService.sendTextMessage(
                        ref.sessionId,
                        jid,
                        { text: parsed.data.text },
                        parsed.data.mentions,
                        parsed.data.quoted_message_id
                    );
                    const keyId = (result as { key?: { id?: string } } | null)?.key?.id ?? null;
                    const local = keyId
                        ? await prisma.message.findFirst({
                              where: { sessionId: ref.id, keyId },
                              select: { id: true, status: true },
                          })
                        : null;
                    // Aceitação/envio pelo canal não é entrega: o estado final
                    // (DELIVERED/READ) só vem do polling em GET .../messages/{id}.
                    return v1Ok({
                        status: local?.status ?? "SENT",
                        message_id: local?.id ?? null,
                        key_id: keyId,
                        to: jid,
                    });
                } catch (error) {
                    if (error instanceof HttpError) throw error;
                    const message = error instanceof Error ? error.message : String(error);
                    throw new HttpError(422, "send_failed", `Falha no envio: ${message}`);
                }
            }

            // Mídia por URL: cota checada agora e de novo na entrega; o download é feito
            // pelo worker com as regras SSRF (o payload nunca carrega bytes).
            await assertSendQuota(user.tenantId);
            const jobId = await enqueueSendJob({
                tenantId: user.tenantId ?? "",
                sessionPk: ref.id,
                instanceId: ref.sessionId,
                payload: {
                    jid,
                    mediaUrl: parsed.data.media_url,
                    mediaType: parsed.data.media_type || "image",
                    caption: parsed.data.caption || "",
                },
                priority: 100,
            });

            return v1Accepted({ status: "accepted", queued: true, job_id: jobId, to: jid });
        };

        const key = idempotencyKey(request);
        if (key && user.tenantId) {
            return await withIdempotency({
                tenantId: user.tenantId,
                endpoint: "POST /api/v1/instances/{instanceId}/messages",
                key,
                fingerprint: requestFingerprint(["POST", ref.id, rawBody]),
                execute,
            });
        }
        return await execute();
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
