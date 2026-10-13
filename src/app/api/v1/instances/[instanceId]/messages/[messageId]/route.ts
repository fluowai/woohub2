import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, v1ErrorResponse, v1Ok, notFound } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";
import { mapMessage } from "@/lib/v1/message";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/instances/{id}/messages/{messageId}
 *
 * Consulta pontual de uma mensagem da instância, usada para acompanhar o
 * estado: `PENDING` (aceita) → `SENT` (enviada) → `DELIVERED` (entregue) →
 * `READ` (lida) ou `FAILED` (falhou). A aceitação nunca é apresentada como
 * entrega.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string; messageId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId, messageId } = await params;
        const ref = await requireInstance(user, instanceId);

        const message = await prisma.message.findFirst({
            where: { id: messageId, sessionId: ref.id },
        });
        if (!message) throw notFound("Mensagem não encontrada nesta instância");

        return v1Ok(mapMessage(message));
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}
