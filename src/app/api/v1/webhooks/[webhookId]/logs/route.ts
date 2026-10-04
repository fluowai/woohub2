import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireWebhook } from "@/lib/v1/webhook";

export const dynamic = "force-dynamic";

/**
 * Tentativas de entrega (uma linha por tentativa), da mais recente para a mais antiga.
 * `event_id` é estável entre tentativas da mesma entrega — use-o para deduplicar.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ webhookId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { webhookId } = await params;
        const webhook = await requireWebhook(user, webhookId);

        const { searchParams } = new URL(request.url);
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
        const status = searchParams.get("status");

        const logs = await prisma.webhookLog.findMany({
            where: {
                webhookId: webhook.id,
                ...(status ? { status } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return v1Ok(
            logs.map((log) => ({
                id: log.id,
                event: log.event,
                event_id: log.eventId,
                attempt: log.attempt,
                status: log.status,
                next_attempt_at: log.nextAttemptAt?.toISOString() ?? null,
                response_status_code: log.responseStatusCode,
                response_time_ms: log.responseTimeMs,
                error_message: log.errorMessage,
                created_at: log.createdAt.toISOString(),
            })),
            { limit, webhook_id: webhook.id }
        );
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
