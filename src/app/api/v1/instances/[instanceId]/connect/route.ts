import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";
import { HttpError, requireUser, v1Accepted, v1ErrorResponse } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/instances/{id}/connect
 *
 * Aceita a ordem de conexão (202) — o motor conecta em background e o estado
 * real é consultado em GET /api/v1/instances/{id} ou pelo QR Code.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        try {
            await waManager.startSession(ref.sessionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpError(409, "instance_connect_failed", `Falha ao iniciar a conexão: ${message}`);
        }

        const after = await prisma.session.findUnique({ where: { id: ref.id }, select: { status: true } });
        return v1Accepted({
            action: "connect",
            session_id: ref.sessionId,
            status: after?.status ?? "CONNECTING",
        });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
