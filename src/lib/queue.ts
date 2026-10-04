import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { safeFetch } from "./security/ssrf";
import { emitToInstance } from "./realtime";
import { isQuotaError } from "./quota";
import { ensureTenantForUser } from "./access";
import { executeWebhookJob, type WebhookJobPayload } from "./webhook";
import { waManager } from "@/modules/whatsapp/manager";

/**
 * Durable outbound queue (MessageJob).
 *
 * Single-replica MVP: the queue lives in the database, one worker process claims jobs
 * with an optimistic lock (`status: PENDING -> RUNNING` + lockedBy/lockedAt).
 * Retries use exponential backoff; quota/subscription denials are permanent (no retry).
 *
 * correlationId conventions:
 *   scheduled:<scheduledMessageId>  -> the worker updates the ScheduledMessage row
 *   broadcast:<broadcastLogId>      -> the worker updates BroadcastRecipient/Log and emits progress
 *   (none)                          -> fire and forget
 */

export interface SendPayload {
    jid: string;
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    caption?: string;
}

export interface EnqueueSendOptions {
    tenantId: string;
    sessionPk: string; // Session.id (CUID)
    instanceId: string; // Baileys sessionId
    payload: SendPayload | WebhookJobPayload;
    /** Job kind: send_message (default) or webhook. */
    type?: string;
    maxAttempts?: number;
    priority?: number;
    availableAt?: Date;
    correlationId?: string;
}

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const NOT_AVAILABLE_BACKOFF_MS = 30_000;

function backoffMs(attempts: number): number {
    return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/** Webhook deliveries use the historical [1s, 5s, 25s] ladder, then a minute. */
function webhookBackoffMs(attempts: number): number {
    const ladder = [1_000, 5_000, 25_000];
    return ladder[Math.min(attempts - 1, ladder.length - 1)] ?? 60_000;
}

/**
 * `MessageJob.tenantId` is a required FK, but a legacy session may still have no company.
 * Resolve it from the session, and provision the owner's company on demand so the row can
 * always be created (same safety net used at login time).
 */
async function resolveJobTenant(tenantId: string | null | undefined, sessionPk: string): Promise<string> {
    if (tenantId) return tenantId;

    const session = await prisma.session.findUnique({
        where: { id: sessionPk },
        select: { id: true, userId: true, tenantId: true },
    });
    if (!session) throw new Error(`Cannot enqueue job: session ${sessionPk} not found`);

    const owner = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, role: true },
    });
    if (!owner) throw new Error(`Cannot enqueue job: owner of session ${sessionPk} not found`);

    const { tenantId: resolved } = await ensureTenantForUser(owner);
    await prisma.session.update({ where: { id: session.id }, data: { tenantId: resolved } });
    return resolved;
}

export async function enqueueSendJob(options: EnqueueSendOptions): Promise<string> {
    const job = await prisma.messageJob.create({
        data: {
            tenantId: await resolveJobTenant(options.tenantId, options.sessionPk),
            sessionPk: options.sessionPk,
            instanceId: options.instanceId,
            type: options.type ?? "send_message",
            payload: options.payload as unknown as Prisma.InputJsonValue,
            maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            priority: options.priority ?? 100,
            availableAt: options.availableAt ?? new Date(),
            correlationId: options.correlationId ?? null,
        },
    });
    return job.id;
}

/** True when a job for this correlation is still queued or running (prevents double enqueue). */
export async function hasActiveJob(correlationId: string): Promise<boolean> {
    const job = await prisma.messageJob.findFirst({
        where: { correlationId, status: { in: ["PENDING", "RUNNING"] } },
        select: { id: true },
    });
    return !!job;
}

/** Recovers jobs stuck in RUNNING (e.g. the process died mid-flight). */
async function requeueStuckJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    const result = await prisma.messageJob.updateMany({
        where: { status: "RUNNING", lockedAt: { lt: staleBefore } },
        data: { status: "PENDING", lockedAt: null, lockedBy: null, lastError: "Worker lock expired" },
    });
    if (result.count > 0) {
        logger.warn("Queue", `Requeued ${result.count} stale job(s)`);
    }
}

async function buildContent(payload: SendPayload): Promise<Record<string, unknown>> {
    if (payload.mediaUrl) {
        const res = await safeFetch(payload.mediaUrl, { method: "GET", timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
        if (!res.ok) throw new Error(`Failed to fetch media from URL: ${res.status}`);
        const buffer = res.buffer;
        const type = payload.mediaType || "image";
        const caption = payload.caption ?? "";
        if (type === "video") return { video: buffer, caption };
        if (type === "audio") return { audio: buffer, caption };
        if (type === "document") {
            return {
                document: buffer,
                caption,
                fileName: payload.mediaUrl.split("/").pop() || "file",
                mimetype: "application/octet-stream",
            };
        }
        return { image: buffer, caption };
    }
    return { text: payload.text ?? "" };
}

function messageKey(result: unknown): string | null {
    const key = (result as { key?: { id?: string } } | null)?.key;
    return key?.id ?? null;
}

// ---------------------------------------------------------------------------------------
// Correlation side effects
// ---------------------------------------------------------------------------------------

async function onScheduledSuccess(job: { correlationId: string | null }): Promise<void> {
    if (!job.correlationId?.startsWith("scheduled:")) return;
    const id = job.correlationId.slice("scheduled:".length);

    const msg = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!msg) return;

    // Recurring: the scheduler already advanced sendAt; just keep the series PENDING.
    if (msg.cronExpression) {
        if (msg.status !== "PENDING") {
            await prisma.scheduledMessage.update({ where: { id }, data: { status: "PENDING" } });
        }
        return;
    }
    await prisma.scheduledMessage.update({ where: { id }, data: { status: "SENT" } });
}

async function onScheduledFailure(job: { correlationId: string | null; final: boolean; error: string }): Promise<void> {
    if (!job.correlationId?.startsWith("scheduled:")) return;
    if (!job.final) return; // will be retried by the worker
    const id = job.correlationId.slice("scheduled:".length);

    const msg = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!msg) return;

    // Recurring: sendAt was already advanced, the series fires again on its own.
    if (msg.cronExpression) return;

    await prisma.scheduledMessage.update({ where: { id }, data: { status: "FAILED" } });
}

async function onBroadcastSettled(
    job: { correlationId: string | null; instanceId: string; payload: SendPayload },
    outcome: "sent" | "failed",
    error?: string
): Promise<void> {
    if (!job.correlationId?.startsWith("broadcast:")) return;
    const logId = job.correlationId.slice("broadcast:".length);

    await prisma.broadcastRecipient.updateMany({
        where: { broadcastLogId: logId, jid: job.payload.jid, status: "pending" },
        data: outcome === "sent" ? { status: "sent", sentAt: new Date() } : { status: "failed", error: error || "Unknown error" },
    });

    const log = await prisma.broadcastLog.findUnique({ where: { id: logId }, include: { recipients: true } });
    if (!log) return;

    const sent = log.recipients.filter((r) => r.status === "sent").length;
    const failed = log.recipients.filter((r) => r.status === "failed").length;
    const done = sent + failed >= log.total;
    const status = done ? "completed" : "running";

    await prisma.broadcastLog.update({
        where: { id: logId },
        data: { sent, failed, status, ...(done ? { completedAt: new Date() } : {}) },
    });

    const io = (global as any).io;
    if (io) {
        emitToInstance(io, job.instanceId, "broadcast.progress", {
            broadcastId: logId,
            status,
            total: log.total,
            sent,
            failed,
            current: job.payload.jid,
            progress: Math.round(((sent + failed) / log.total) * 100),
            ...(done ? { completedAt: new Date().toISOString() } : {}),
        });
    }
}

// ---------------------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------------------

async function runJob(job: {
    id: string;
    type: string;
    instanceId: string;
    payload: SendPayload;
    attempts: number;
    maxAttempts: number;
    correlationId: string | null;
}): Promise<void> {
    const isWebhook = job.type === "webhook";
    try {
        let resultKey: string | null = null;

        if (isWebhook) {
            await executeWebhookJob(job.payload as unknown as WebhookJobPayload, job.attempts);
        } else {
            const instance = waManager.getInstance(job.instanceId);
            if (!instance?.socket) {
                throw Object.assign(new Error("Instance is not connected"), { retryable: true, notAvailable: true });
            }

            const content = await buildContent(job.payload);
            const result = await instance.socket.sendMessage(job.payload.jid, content as any);
            resultKey = messageKey(result);
        }

        await prisma.messageJob.update({
            where: { id: job.id },
            data: { status: "SUCCEEDED", resultKey, lockedAt: null, lockedBy: null, lastError: null },
        });

        if (!isWebhook) {
            await onScheduledSuccess(job);
            await onBroadcastSettled(job, "sent");
        }
    } catch (error) {
        const quotaDenied = isQuotaError(error);
        const notAvailable = (error as { notAvailable?: boolean }).notAvailable === true;
        const message = error instanceof Error ? error.message : String(error);
        const final = quotaDenied || job.attempts >= job.maxAttempts;

        if (quotaDenied) {
            await prisma.messageJob.update({
                where: { id: job.id },
                data: { status: "FAILED", lockedAt: null, lockedBy: null, lastError: message },
            });
        } else if (final) {
            await prisma.messageJob.update({
                where: { id: job.id },
                data: { status: "DEAD", lockedAt: null, lockedBy: null, lastError: message },
            });
        } else {
            const delay = notAvailable
                ? NOT_AVAILABLE_BACKOFF_MS
                : isWebhook
                  ? webhookBackoffMs(job.attempts)
                  : backoffMs(job.attempts);
            await prisma.messageJob.update({
                where: { id: job.id },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lockedBy: null,
                    availableAt: new Date(Date.now() + delay),
                    lastError: message,
                },
            });
        }

        logger.warn(
            "Queue",
            `Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}${final ? ", final" : ""}): ${message}`
        );

        if (final && !isWebhook) {
            await onScheduledFailure({ correlationId: job.correlationId, final: true, error: message });
            await onBroadcastSettled(job, "failed", message);
        }
    }
}

async function processOnce(): Promise<number> {
    const now = new Date();
    const candidates = await prisma.messageJob.findMany({
        where: { status: "PENDING", availableAt: { lte: now } },
        orderBy: [{ priority: "asc" }, { availableAt: "asc" }, { createdAt: "asc" }],
        take: 10,
    });

    if (candidates.length === 0) return 0;

    for (const candidate of candidates) {
        const claimed = await prisma.messageJob.updateMany({
            where: { id: candidate.id, status: "PENDING" },
            data: {
                status: "RUNNING",
                lockedAt: new Date(),
                lockedBy: WORKER_ID,
                attempts: { increment: 1 },
            },
        });
        if (claimed.count === 0) continue; // another worker took it

        await runJob({
            id: candidate.id,
            type: candidate.type,
            instanceId: candidate.instanceId,
            payload: candidate.payload as unknown as SendPayload,
            attempts: candidate.attempts + 1,
            maxAttempts: candidate.maxAttempts,
            correlationId: candidate.correlationId,
        });
    }
    return candidates.length;
}

/** Starts the queue worker. Returns a stop function (wired to SIGINT/SIGTERM). */
export function startJobWorker(intervalMs = 1_000): () => void {
    let busy = false;
    let stopped = false;
    let ticks = 0;

    const tick = async () => {
        if (busy || stopped) return;
        busy = true;
        try {
            // Once a minute: recover jobs whose worker died mid-flight.
            if (ticks++ % 60 === 0) await requeueStuckJobs();
            await processOnce();
        } catch (error) {
            logger.error("Queue", "Worker tick failed:", error);
        } finally {
            busy = false;
        }
    };

    const timer = setInterval(() => {
        void tick();
    }, intervalMs);
    timer.unref?.();

    void tick();

    return () => {
        stopped = true;
        clearInterval(timer);
    };
}
