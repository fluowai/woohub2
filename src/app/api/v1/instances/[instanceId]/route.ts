import type { NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { prisma } from "@/lib/prisma";
import { isSessionOwner } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { forbidden, requireUser, v1ErrorResponse, v1NoContent, v1Ok } from "@/lib/v1/http";
import { mapInstance, requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

/** Detalhe da instância (status ao vivo + contagens). */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const session = await prisma.session.findUnique({
            where: { id: ref.id },
            include: {
                _count: { select: { contacts: true, messages: true, groups: true, webhooks: true, scheduledMessages: true } },
            },
        });
        if (!session) return v1Ok(mapInstance(ref));

        const live = waManager.getInstance(session.sessionId);
        const connected = live?.status === "CONNECTED";
        const uptimeSeconds =
            connected && live?.startTime ? Math.floor((Date.now() - live.startTime.getTime()) / 1000) : 0;

        return v1Ok({
            ...mapInstance(session),
            status: live?.status || session.status,
            connected,
            uptime_seconds: uptimeSeconds,
            phone: connected && live?.socket?.user?.id ? String(live.socket.user.id).split(":")[0].split("@")[0] : null,
            qr_available: !!session.qr,
            counts: {
                contacts: session._count.contacts,
                messages: session._count.messages,
                groups: session._count.groups,
                webhooks: session._count.webhooks,
                scheduled_messages: session._count.scheduledMessages,
            },
        });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}

/** Remove a instância (somente o dono). Ação irreversível. */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const owner = await isSessionOwner(user.id, user.role, instanceId);
        if (!owner) throw forbidden("Apenas o dono da instância pode removê-la");

        await waManager.deleteSession(ref.sessionId);

        await audit({
            action: "instance.delete",
            resource: "session",
            resourceId: ref.id,
            metadata: { name: ref.name, session_id: ref.sessionId },
        });

        return v1NoContent();
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
