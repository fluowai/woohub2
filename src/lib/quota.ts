import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { CommercialRuleError } from "./commercial";

/**
 * Plan quotas (per company).
 *
 * Rules (explicit, no hidden behaviour):
 *   - Company WITHOUT an active subscription  -> "pilot": no limits (documented as pilot mode).
 *   - Company WITH TRIALING/ACTIVE subscription (or inside grace/period) -> plan limits apply.
 *   - Company in SUSPENDED/EXPIRED/ended CANCELED -> creations and sends are refused (403).
 *
 * Counting:
 *   - "messages_sent" is incremented once, at the moment the engine accepts the send.
 *   - "requests" (public /api/v1 only) is counted in memory and flushed to the DB every
 *     minute, so a crash loses at most one minute of usage — always in the customer's favour.
 *   - "instances"/"users" are gauges read live from the database (no drift).
 */

export interface QuotaLimits {
    maxInstances: number;
    maxUsers: number;
    requestLimit: number;
    sendLimit: number;
    storageLimitMb: number;
    retentionDays: number;
}

export type QuotaMode = "pilot" | "active" | "suspended";

export interface QuotaSnapshot {
    tenantId: string;
    mode: QuotaMode;
    planCode: string | null;
    planName: string | null;
    subscriptionStatus: string | null;
    periodKey: string | null;
    limits: QuotaLimits | null;
    /** instancesUsed = medidor ao vivo (sessoes do tenant); os demais sao contadores do periodo. */
    usage: { requests: number; messagesSent: number; instancesUsed: number };
}

export class QuotaError extends Error {
    readonly status: 402 | 403;
    readonly code: string;

    constructor(message: string, code = "quota_exceeded", status: 402 | 403 = 403) {
        super(message);
        this.name = "QuotaError";
        this.code = code;
        this.status = status;
    }
}

export function isQuotaError(error: unknown): error is QuotaError {
    return error instanceof QuotaError;
}

/** Shared error response so every route answers the same way. */
export function quotaErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof CommercialRuleError) {
        return NextResponse.json({ status: false, code: error.code, message: error.message, error: error.message }, { status: error.status });
    }
    if (!isQuotaError(error)) return null;
    return NextResponse.json(
        { status: false, code: error.code, message: error.message, error: error.message },
        { status: error.status }
    );
}

function limitsFromPlan(plan: {
    maxInstances: number;
    maxUsers: number;
    requestLimit: number;
    sendLimit: number;
    storageLimitMb: number;
    retentionDays: number;
}): QuotaLimits {
    return {
        maxInstances: Math.max(0, plan.maxInstances),
        maxUsers: Math.max(0, plan.maxUsers),
        requestLimit: Math.max(0, plan.requestLimit),
        sendLimit: Math.max(0, plan.sendLimit),
        storageLimitMb: Math.max(0, plan.storageLimitMb),
        retentionDays: Math.max(0, plan.retentionDays),
    };
}

/** Usage period key: the day the current billing period started (stable for the whole period). */
export function periodKeyFor(periodStart: Date): string {
    return periodStart.toISOString().slice(0, 10);
}

interface SubscriptionState {
    mode: QuotaMode;
    limits: QuotaLimits | null;
    periodKey: string | null;
    planCode: string | null;
    planName: string | null;
    status: string | null;
}

async function loadSubscriptionState(tenantId: string): Promise<SubscriptionState> {
    const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
    });

    if (!subscription) {
        return { mode: "pilot", limits: null, periodKey: null, planCode: null, planName: null, status: null };
    }

    const now = Date.now();
    const periodEnd = subscription.currentPeriodEnd?.getTime() ?? 0;
    let active = subscription.status === "TRIALING" || subscription.status === "ACTIVE";

    if (subscription.status === "PAST_DUE") {
        active = !subscription.graceEndsAt || subscription.graceEndsAt.getTime() > now;
    }
    if (subscription.status === "CANCELED" && subscription.cancelAtPeriodEnd) {
        active = periodEnd > now;
    }

    if (!active) {
        return {
            mode: "suspended",
            limits: null,
            periodKey: periodKeyFor(subscription.currentPeriodStart),
            planCode: subscription.plan.code,
            planName: subscription.plan.name,
            status: subscription.status,
        };
    }

    return {
        mode: "active",
        limits: limitsFromPlan(subscription.plan),
        periodKey: periodKeyFor(subscription.currentPeriodStart),
        planCode: subscription.plan.code,
        planName: subscription.plan.name,
        status: subscription.status,
    };
}

// ---------------------------------------------------------------------------------------
// Subscription state cache (limits change rarely; 30s TTL keeps the hot path free of SQL).
// ---------------------------------------------------------------------------------------

const stateCache = new Map<string, { state: SubscriptionState; expiresAt: number }>();
const STATE_TTL_MS = 30_000;

export function invalidateQuotaCache(tenantId?: string): void {
    if (tenantId) stateCache.delete(tenantId);
    else stateCache.clear();
}

async function getCachedState(tenantId: string): Promise<SubscriptionState> {
    const hit = stateCache.get(tenantId);
    if (hit && hit.expiresAt > Date.now()) return hit.state;

    const state = await loadSubscriptionState(tenantId);
    stateCache.set(tenantId, { state, expiresAt: Date.now() + STATE_TTL_MS });

    if (state.periodKey) {
        const counter = await prisma.usageCounter.findUnique({
            where: { tenantId_periodKey_metric: { tenantId, periodKey: state.periodKey, metric: "requests" } },
            select: { value: true },
        });
        requestSynced.set(tenantId, counter?.value ?? 0);
    }
    return state;
}

// ---------------------------------------------------------------------------------------
// In-memory request counters for the public API (flushed by startUsageFlusher).
// ---------------------------------------------------------------------------------------

const requestMemory = new Map<string, number>(); // not yet flushed to the DB
const requestSynced = new Map<string, number>(); // last value known to be in the DB

/** Counts one public-API request against the company (in memory; flushed periodically). */
export function trackRequest(tenantId: string | null): void {
    if (!tenantId) return;
    requestMemory.set(tenantId, (requestMemory.get(tenantId) ?? 0) + 1);
}

function usedRequests(tenantId: string): number {
    return (requestSynced.get(tenantId) ?? 0) + (requestMemory.get(tenantId) ?? 0);
}

/**
 * Checks the public-API request quota. No SQL on the hot path once the state cache
 * is warm (30s), so /api/v1 stays cheap.
 */
export async function checkRequestQuotaForTenant(tenantId: string | null): Promise<void> {
    if (!tenantId) return; // no company -> pilot mode
    const state = await getCachedState(tenantId);
    if (state.mode === "suspended") {
        throw new QuotaError("Company subscription is not active", "subscription_inactive");
    }
    if (!state.limits) return; // pilot
    if (usedRequests(tenantId) >= state.limits.requestLimit) {
        throw new QuotaError("Request quota exceeded for the current period", "quota_exceeded", 402);
    }
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

export async function getQuotaSnapshot(tenantId: string | null): Promise<QuotaSnapshot> {
    if (!tenantId) {
        return {
            tenantId: "",
            mode: "pilot",
            planCode: null,
            planName: null,
            subscriptionStatus: null,
            periodKey: null,
            limits: null,
            usage: { requests: 0, messagesSent: 0, instancesUsed: 0 },
        };
    }

    const state = await getCachedState(tenantId);
    const instancesUsed = await prisma.session.count({ where: { tenantId } });

    if (!state.limits || !state.periodKey) {
        return {
            tenantId,
            mode: state.mode,
            planCode: state.planCode,
            planName: state.planName,
            subscriptionStatus: state.status,
            periodKey: state.periodKey,
            limits: state.limits,
            usage: { requests: usedRequests(tenantId), messagesSent: 0, instancesUsed },
        };
    }

    const counters = await prisma.usageCounter.findMany({
        where: { tenantId, periodKey: state.periodKey, metric: { in: ["requests", "messages_sent"] } },
        select: { metric: true, value: true },
    });

    const dbRequests = counters.find((c) => c.metric === "requests")?.value ?? 0;
    const messagesSent = counters.find((c) => c.metric === "messages_sent")?.value ?? 0;

    return {
        tenantId,
        mode: state.mode,
        planCode: state.planCode,
        planName: state.planName,
        subscriptionStatus: state.status,
        periodKey: state.periodKey,
        limits: state.limits,
        usage: { requests: dbRequests + (requestMemory.get(tenantId) ?? 0), messagesSent, instancesUsed },
    };
}

async function incrementCounter(tenantId: string, periodKey: string, metric: string, by = 1): Promise<void> {
    try {
        await prisma.usageCounter.upsert({
            where: { tenantId_periodKey_metric: { tenantId, periodKey, metric } },
            update: { value: { increment: by } },
            create: { tenantId, periodKey, metric, value: by },
        });
    } catch (error) {
        // Concurrent create race (P2002): retry once as an increment.
        try {
            await prisma.usageCounter.update({
                where: { tenantId_periodKey_metric: { tenantId, periodKey, metric } },
                data: { value: { increment: by } },
            });
        } catch {
            logger.error("Quota", `Failed to record usage for ${tenantId}/${metric}:`, error);
        }
    }
}


/** Instance creation quota (gauge). Throws QuotaError 403 when the plan limit is reached. */
export async function assertInstanceQuota(tenantId: string | null): Promise<void> {
    if (!tenantId) return; // no company -> pilot mode
    const state = await getCachedState(tenantId);
    if (state.mode === "suspended") {
        throw new QuotaError("Company subscription is not active", "subscription_inactive");
    }
    if (!state.limits) return;

    const instances = await prisma.session.count({ where: { tenantId } });
    if (instances >= state.limits.maxInstances) {
        throw new QuotaError(
            `Instance limit reached (${state.limits.maxInstances}) for the current plan`,
            "quota_exceeded"
        );
    }
}

/** Company member quota (gauge). */
export async function assertMemberQuota(tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    const state = await getCachedState(tenantId);
    if (state.mode === "suspended") {
        throw new QuotaError("Company subscription is not active", "subscription_inactive");
    }
    if (!state.limits) return;

    const members = await prisma.tenantMember.count({ where: { tenantId } });
    if (members >= state.limits.maxUsers) {
        throw new QuotaError(`Member limit reached (${state.limits.maxUsers}) for the current plan`, "quota_exceeded");
    }
}

/**
 * Send quota. Checks the plan limit and consumes one unit at acceptance.
 * Called by the socket wrapper, so every send path (API, bot, scheduler, autoreply)
 * is counted exactly once.
 */
export async function assertSendQuota(tenantId: string | null): Promise<void> {
    if (!tenantId) return; // no company -> pilot mode

    const state = await getCachedState(tenantId);
    if (state.mode === "suspended") {
        throw new QuotaError("Company subscription is not active", "subscription_inactive");
    }
    if (!state.limits || !state.periodKey) return;

    const counter = await prisma.usageCounter.findUnique({
        where: {
            tenantId_periodKey_metric: { tenantId, periodKey: state.periodKey, metric: "messages_sent" },
        },
        select: { value: true },
    });
    const sent = counter?.value ?? 0;

    if (sent >= state.limits.sendLimit) {
        throw new QuotaError(
            `Message quota reached (${state.limits.sendLimit}) for the current period`,
            "quota_exceeded",
            402
        );
    }

    await incrementCounter(tenantId, state.periodKey, "messages_sent", 1);
}

// ---------------------------------------------------------------------------------------
// Usage flusher (public API request counters)
// ---------------------------------------------------------------------------------------

export async function flushUsage(): Promise<void> {
    if (requestMemory.size === 0) return;

    const pending = [...requestMemory.entries()];
    requestMemory.clear();

    for (const [tenantId, count] of pending) {
        const state = stateCache.get(tenantId)?.state;
        if (!state?.periodKey) {
            // No billing period -> nothing to bill against; keep the count in memory only.
            requestSynced.set(tenantId, (requestSynced.get(tenantId) ?? 0) + count);
            continue;
        }
        await incrementCounter(tenantId, state.periodKey, "requests", count);
        requestSynced.set(tenantId, (requestSynced.get(tenantId) ?? 0) + count);
    }
}

/** Starts the periodic usage flusher. Returns a stop function (used on shutdown). */
export function startUsageFlusher(intervalMs = 60_000): () => void {
    const timer = setInterval(() => {
        flushUsage().catch((error) => logger.error("Quota", "Usage flush failed:", error));
    }, intervalMs);
    timer.unref?.();

    const stop = () => {
        clearInterval(timer);
        flushUsage().catch((error) => logger.error("Quota", "Final usage flush failed:", error));
    };
    return stop;
}

