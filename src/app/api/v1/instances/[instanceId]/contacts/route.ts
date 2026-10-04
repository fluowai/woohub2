import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

/** Contatos da instância com paginação e busca por nome/número. */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
        const search = searchParams.get("search") || "";

        const where: Record<string, unknown> = { sessionId: ref.id };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { notify: { contains: search } },
                { verifiedName: { contains: search } },
                { jid: { contains: search } },
            ];
        }

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { name: "asc" },
            }),
            prisma.contact.count({ where }),
        ]);

        return v1Ok(
            contacts.map((c) => ({
                id: c.id,
                jid: c.jid,
                name: c.name,
                verified_name: c.verifiedName,
                notify: c.notify,
                profile_pic: c.profilePic,
                created_at: c.createdAt.toISOString(),
            })),
            { total, page, limit, total_pages: Math.ceil(total / limit) }
        );
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
