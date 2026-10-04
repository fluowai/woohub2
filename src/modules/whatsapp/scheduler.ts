import { prisma } from "@/lib/prisma";
import { waManager } from "./manager";
import { logger } from "@/lib/logger";
import { enqueueSendJob, hasActiveJob } from "@/lib/queue";

/**
 * Due scheduled messages -> durable queue (MessageJob).
 *
 * This is the only scheduler in the process (the legacy `src/lib/cron.ts` loop, which
 * duplicated every send, was removed). The scheduler only decides WHEN a message is due;
 * the queue worker performs the send, the retries and the final ScheduledMessage update.
 *
 * Behaviour preserved from upstream:
 *   - a message whose instance is offline stays PENDING and is retried on the next tick
 *   - a recurring message (cronExpression) keeps its series alive
 */

const TICK_MS = 30 * 1000;
const MAX_ATTEMPTS = 10;

async function nextOccurrence(cronExpression: string, from?: Date): Promise<Date | null> {
    try {
        const cronParser = (await import("cron-parser")).default;
        const interval = cronParser.parse(cronExpression, {
            currentDate: from,
            tz: process.env.TZ || "America/Sao_Paulo",
        });
        return interval.next().toDate();
    } catch (error) {
        logger.error("Scheduler", `Invalid cron expression "${cronExpression}":`, error);
        return null;
    }
}

const checkScheduledMessages = async () => {
    try {
        const now = new Date();

        const dueMessages = await prisma.scheduledMessage.findMany({
            where: { status: "PENDING", sendAt: { lte: now } },
            include: { session: true },
        });
        if (dueMessages.length === 0) return;

        for (const msg of dueMessages) {
            const correlationId = `scheduled:${msg.id}`;

            // Already queued or running (recurring messages re-enter the window on purpose).
            if (await hasActiveJob(correlationId)) continue;

            const instance = waManager.getInstance(msg.session.sessionId);
            if (!instance?.socket) {
                logger.warn("Scheduler", `Session ${msg.session.sessionId} not connected, keeping msg ${msg.id} pending`);
                continue;
            }

            // Recurring: advance the series BEFORE enqueueing (single writer, no double skip).
            if (msg.cronExpression) {
                const next = await nextOccurrence(msg.cronExpression, msg.sendAt);
                if (!next) {
                    logger.error("Scheduler", `Msg ${msg.id} has an invalid cron expression, marking FAILED`);
                    await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "FAILED" } });
                    continue;
                }
                await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { sendAt: next } });
            }

            await enqueueSendJob({
                tenantId: msg.session.tenantId ?? "",
                sessionPk: msg.session.id,
                instanceId: msg.session.sessionId,
                payload: {
                    jid: msg.jid,
                    text: msg.content ?? "",
                    mediaUrl: msg.mediaUrl ?? undefined,
                    mediaType: msg.mediaType ?? undefined,
                    caption: msg.content ?? "",
                },
                correlationId,
                maxAttempts: MAX_ATTEMPTS,
            });

            logger.info("Scheduler", `Queued scheduled msg ${msg.id} for ${msg.jid}`);
        }
    } catch (error) {
        logger.error("Scheduler", "Error executing scheduler loop:", error);
    }
};

export function startScheduler() {
    logger.info("Scheduler", "Starting Message Scheduler...");

    // Run immediately on start
    checkScheduledMessages();

    // Then run every 30 seconds
    const timer = setInterval(checkScheduledMessages, TICK_MS);
    timer.unref?.();

    return () => clearInterval(timer);
}
