import type { NextRequest } from "next/server";
import { z } from "zod";
import { waManager } from "@/modules/whatsapp/manager";
import { prisma } from "@/lib/prisma";
import { HttpError, badRequest, requireUser, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("start") }),
    z.object({ action: z.literal("stop") }),
    z.object({ action: z.literal("restart") }),
    z.object({ action: z.literal("logout") }),
    z.object({
        action: z.literal("pair"),
        phone_number: z.string().trim().regex(/^\d{8,15}$/, "Informe o número com DDI, só dígitos (ex.: 5511999999999)"),
    }),
]);

/** Controla o ciclo de vida da instância: start, stop, restart, logout, pair. */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const parsed = actionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw badRequest("Ação inválida", parsed.error.flatten());

        const { action } = parsed.data;

        try {
            switch (action) {
                case "start":
                    await waManager.startSession(ref.sessionId);
                    break;
                case "stop":
                    await waManager.stopSession(ref.sessionId);
                    break;
                case "restart":
                    await waManager.restartSession(ref.sessionId);
                    break;
                case "logout": {
                    const live = waManager.getInstance(ref.sessionId);
                    if (live?.socket) {
                        await live.socket.logout();
                    } else {
                        await prisma.session.update({
                            where: { id: ref.id },
                            data: { status: "LOGGED_OUT", qr: null },
                        });
                    }
                    break;
                }
                case "pair": {
                    const pairingCode = await waManager.requestPairingCode(ref.sessionId, parsed.data.phone_number);
                    return v1Ok({ action, pairing_code: pairingCode });
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpError(409, "instance_action_failed", `Falha ao executar "${action}": ${message}`);
        }

        return v1Ok({ action, session_id: ref.sessionId });
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}
