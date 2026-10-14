import { prisma } from "./prisma";
import { logger } from "./logger";
import { audit } from "./audit";
import { sendAlert } from "./alerts";

/**
 * Automated retention purge (docs/RETENTION.md §2).
 *
 * Runs daily (wired in src/server/index.ts). Scope:
 *   - MessageJob terminal (SUCCEEDED/FAILED/CANCELED/DEAD) older than JOB_RETENTION_DAYS
 *   - Message older than MESSAGE_RETENTION_DAYS (global cap; Plan.retentionDays is
 *     the contractual value shown to the client — this is the hard safety cap)
 *
 * Disabled by default for Message (MESSAGE_RETENTION_DAYS=0) so a deployment
 * without explicit consent never deletes customer history. Jobs purge is on by
 * default (30 days) because terminal jobs are operational history only.
 *
 * Deletion runs in batches to avoid long locks. Every purge is audited.
 */

const BATCH_SIZE = 5_000;

function envDays(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface RetentionConfig {
    jobDays: number;
    messageDays: number;
}

export function retentionConfig(): RetentionConfig {
    return {
        jobDays: envDays("JOB_RETENTION_DAYS", 30),
        messageDays: envDays("MESSAGE_RETENTION_DAYS", 0),
    };
}

function cutoffDaysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Deletes terminal MessageJob rows older than `days`. Returns rows deleted. */
export async function purgeOldJobs(days: number, batchSize = BATCH_SIZE): Promise<number> {
    if (days <= 0) return 0;
    const before = cutoffDaysAgo(days);
    let total = 0;

    for (;;) {
        const batch = await prisma.messageJob.findMany({
            where: {
                status: { in: ["SUCCEEDED", "FAILED", "CANCELED", "DEAD"] },
                createdAt: { lt: before },
            },
            select: { id: true },
            take: batchSize,
        });
        if (batch.length === 0) break;

        const result = await prisma.messageJob.deleteMany({
            where: { id: { in: batch.map((j) => j.id) } },
        });
        total += result.count;
        if (batch.length < batchSize) break;
    }

    return total;
}

/** Deletes Message rows older than `days`. 0 disables. Returns rows deleted. */
export async function purgeOldMessages(days: number, batchSize = BATCH_SIZE): Promise<number> {
    if (days <= 0) return 0;
    const before = cutoffDaysAgo(days);
    let total = 0;

    for (;;) {
        const batch = await prisma.message.findMany({
            where: { createdAt: { lt: before } },
            select: { id: true },
            take: batchSize,
        });
        if (batch.length === 0) break;

        const result = await prisma.message.deleteMany({
            where: { id: { in: batch.map((m) => m.id) } },
        });
        total += result.count;
        if (batch.length < batchSize) break;
    }

    return total;
}

/** Runs one retention pass. Returns a summary (also audited when anything deleted). */
export async function runRetentionPurge(): Promise<{ jobs: number; messages: number }> {
    const config = retentionConfig();
    const summary = { jobs: 0, messages: 0 };

    try {
        summary.jobs = await purgeOldJobs(config.jobDays);
        summary.messages = await purgeOldMessages(config.messageDays);

        if (summary.jobs > 0 || summary.messages > 0) {
            logger.info(
                "Retention",
                `Purged ${summary.jobs} job(s) (>${config.jobDays}d) and ${summary.messages} message(s) (>${config.messageDays}d)`
            );
            await audit({
                actorLabel: "system:retention",
                actorType: "SYSTEM",
                action: "retention.purge",
                resource: "retention",
                metadata: {
                    jobsDeleted: summary.jobs,
                    messagesDeleted: summary.messages,
                    jobRetentionDays: config.jobDays,
                    messageRetentionDays: config.messageDays,
                },
            });
        }
    } catch (error) {
        logger.error("Retention", "Purge failed:", error);
        sendAlert({
            event: "retention.purge_failed",
            severity: "warning",
            message: "Retention purge failed — check logs",
            details: { error: error instanceof Error ? error.message : String(error) },
        });
    }

    return summary;
}

/**
 * Starts the daily retention timer. First run after 5 minutes (let the app
 * finish booting), then every 24h. Returns a stop function.
 */
export function startRetentionScheduler(): () => void {
    let stopped = false;

    const run = () => {
        if (stopped) return;
        void runRetentionPurge();
    };

    const initial = setTimeout(run, 5 * 60_000);
    initial.unref?.();
    const daily = setInterval(run, 24 * 60 * 60 * 1000);
    daily.unref?.();

    logger.info("Retention", "Daily retention scheduler started (first run in 5 minutes)");

    return () => {
        stopped = true;
        clearTimeout(initial);
        clearInterval(daily);
    };
}
