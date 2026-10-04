import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAccessibleSessions } from "@/lib/api-auth";
import { waManager } from "@/modules/whatsapp/manager";
import { assertInstanceQuota } from "@/lib/quota";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, requireUser, v1Created, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { mapInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

const createSchema = z.object({
    name: z.string().trim().min(1).max(60),
    session_id: z.string().trim().min(3).max(64).optional(),
});

/** Lista as instâncias visíveis para a credencial (escopo da empresa). */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const sessions = await getAccessibleSessions(user.id, user.role);
        return v1Ok(sessions.map(mapInstance), { total: sessions.length });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}

/** Cria uma instância (parada). Use `POST /instances/{id}/actions` para conectar. */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);

        // A chave vinculada a uma instância não pode criar novas instâncias.
        if (user.context.apiKey?.instanceId) {
            throw forbidden("Chave vinculada a uma instância não pode criar outras instâncias");
        }

        const parsed = createSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw badRequest("Informe um nome válido para a instância", parsed.error.flatten());

        await assertInstanceQuota(user.tenantId);

        const session = await waManager.createSession(user.id, parsed.data.name, parsed.data.session_id, user.tenantId ?? undefined);

        await audit({
            action: "instance.create",
            resource: "session",
            resourceId: session.id,
            metadata: { name: session.name, session_id: session.sessionId },
        });

        return v1Created(mapInstance(session));
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
