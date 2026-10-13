import { NextResponse, NextRequest } from "next/server";
import { emitToInstance } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { enqueueSendJob } from "@/lib/queue";
import { z } from "zod";

const MAX_BROADCAST_RECIPIENTS = Math.max(
    1,
    parseInt(process.env.MAX_BROADCAST_RECIPIENTS || "5000", 10)
);

const broadcastBodySchema = z.object({
    recipients: z.array(z.string().min(1)).min(1).max(MAX_BROADCAST_RECIPIENTS),
    message: z.string().min(1).max(65536),
    // Delay between recipients (ms): at least 500ms so a broadcast can never
    // degenerate into an unthrottled blast.
    delay: z.number().int().min(500).max(60000).optional()
});

/**
 * Broadcast = one durable queue job per recipient.
 *
 * Progress, retries and completion are handled by the queue worker
 * (`src/lib/queue.ts`), so a restart mid-broadcast resumes where it stopped
 * instead of losing the pending recipients.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        if (user.tenantRole === "USER") {
            return NextResponse.json({ status: false, message: "Usuários operacionais não têm permissão para criar disparos em massa." }, { status: 403 });
        }

        const { sessionId } = await params;
        const body = await request.json();

        const parseResult = broadcastBodySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
        }

        const { recipients, message, delay } = parseResult.data;

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        const session = await prisma.session.findFirst({
            where: { OR: [{ id: sessionId }, { sessionId }] },
            select: { id: true, sessionId: true, tenantId: true },
        });
        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        const stepDelay = delay ?? 2000;
        const startAt = Date.now();

        // --- Save BroadcastLog & recipients to DB ---
        const log = await prisma.broadcastLog.create({
            data: {
                sessionId: session.sessionId,
                message,
                total: recipients.length,
                delay: stepDelay,
                status: "running",
                recipients: {
                    create: recipients.map(jid => ({
                        jid,
                        status: "pending"
                    }))
                }
            },
            include: { recipients: true }
        });

        for (let i = 0; i < recipients.length; i++) {
            const jitter = Math.floor(Math.random() * (stepDelay * 0.5));
            await enqueueSendJob({
                tenantId: session.tenantId ?? "",
                sessionPk: session.id,
                instanceId: session.sessionId,
                payload: { jid: recipients[i], text: message },
                correlationId: `broadcast:${log.id}`,
                availableAt: new Date(startAt + i * stepDelay + jitter),
                maxAttempts: 10,
                priority: 200,
            });
        }

        const io = (global as any).io;
        if (io) {
            emitToInstance(io, session.sessionId, "broadcast.progress", {
                broadcastId: log.id,
                status: "running",
                total: recipients.length,
                sent: 0,
                failed: 0,
                current: null,
                progress: 0,
                startedAt: log.startedAt.toISOString()
            });
        }

        return NextResponse.json({
            status: true,
            message: "Broadcast started",
            data: { broadcastId: log.id, total: recipients.length }
        });

    } catch (e) {
        console.error("Broadcast error", e);
        return NextResponse.json({ status: false, message: "Failed to start broadcast", error: "Failed to start broadcast" }, { status: 500 });
    }
}
