import { canAccessSession, type AuthenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeJid } from "@/lib/jid-utils";
import { HttpError, forbidden, notFound } from "./http";

/**
 * Shared resolution helpers for the v1 public API.
 *
 * Instance references accept either the internal id (CUID) or the WhatsApp Engine session id,
 * so clients can use whichever identifier they stored.
 */

export interface V1Instance {
    id: string;
    sessionId: string;
    name: string;
    status: string;
    userId: string;
    tenantId: string | null;
}

export async function requireInstance(user: AuthenticatedUser, instanceRef: string): Promise<V1Instance> {
    const session = await prisma.session.findFirst({
        where: { OR: [{ id: instanceRef }, { sessionId: instanceRef }] },
        select: { id: true, sessionId: true, name: true, status: true, userId: true, tenantId: true },
    });
    if (!session) throw notFound("Instância não encontrada");

    const allowed = await canAccessSession(user.id, user.role, instanceRef);
    if (!allowed) throw forbidden("Sem acesso a esta instância");

    return session;
}

/**
 * Normalizes a destination into a WhatsApp JID:
 *   "5511999999999" -> "5511999999999@s.whatsapp.net"
 *   "5511999999999@s.whatsapp.net" / group jids pass through.
 */
export function toJid(to: string): string {
    const value = String(to ?? "").trim();
    if (value.includes("@")) return normalizeJid(value);

    const digits = value.replace(/\D/g, "");
    if (digits.length < 8) {
        throw new HttpError(400, "invalid_recipient", "Destino inválido: informe um número com DDI ou um JID completo");
    }
    return `${digits}@s.whatsapp.net`;
}

/** Public representation of an instance (never exposes tenant/user internals). */
export function mapInstance(session: {
    id: string;
    sessionId: string;
    name: string;
    status: string;
    createdAt?: Date;
    _count?: { contacts?: number; messages?: number; groups?: number };
}) {
    return {
        id: session.id,
        session_id: session.sessionId,
        name: session.name,
        status: session.status,
        connected: session.status === "CONNECTED",
        ...(session.createdAt ? { created_at: session.createdAt.toISOString() } : {}),
        ...(session._count
            ? {
                  counts: {
                      contacts: session._count.contacts ?? 0,
                      messages: session._count.messages ?? 0,
                      groups: session._count.groups ?? 0,
                  },
              }
            : {}),
    };
}
