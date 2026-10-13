import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";
import { HttpError, requireUser, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/instances/{id}/disconnect
 *
 * Para a conexão sem apagar as credenciais (a instância pode reconectar depois).
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
            await waManager.stopSession(ref.sessionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpError(409, "instance_disconnect_failed", `Falha ao parar a conexão: ${message}`);
        }

        const after = await prisma.session.findUnique({ where: { id: ref.id }, select: { status: true } });
        return v1Ok({
            action: "disconnect",
            session_id: ref.sessionId,
            status: after?.status ?? "STOPPED",
        });
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}
