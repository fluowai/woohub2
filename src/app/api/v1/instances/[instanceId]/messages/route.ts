import type { NextRequest } from "next/server";
import { z } from "zod";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { waManager } from "@/modules/whatsapp/manager";
import { assertSendQuota } from "@/lib/quota";
import { enqueueSendJob } from "@/lib/queue";
import { HttpError, badRequest, requireUser, v1Accepted, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance, toJid } from "@/lib/v1/instance";

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

function mapMessage(m: {
    id: string;
    keyId: string;
    remoteJid: string;
    senderJid: string | null;
    fromMe: boolean;
    pushName: string | null;
    type: string;
    content: string | null;
    mediaUrl: string | null;
    status: string;
    timestamp: Date;
    quoteId: string | null;
}) {
    return {
        id: m.id,
        key_id: m.keyId,
        jid: m.remoteJid,
        sender: m.senderJid,
        from_me: m.fromMe,
        push_name: m.pushName,
        type: m.type,
        content: m.content,
        media_url: m.mediaUrl,
        status: m.status,
        quote_id: m.quoteId,
        timestamp: m.timestamp.toISOString(),
    };
}

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

        const parsed = sendSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw badRequest("Corpo inválido", parsed.error.flatten());

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
                const key = (result as { key?: { id?: string } } | null)?.key?.id ?? null;
                return v1Ok({ delivered: true, key_id: key, to: jid });
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

        return v1Accepted({ queued: true, job_id: jobId, to: jid });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
