/**
 * Sliding-window rate limiter (in-process).
 *
 * Scope: single-replica deployments (the supported MVP topology). Multi-replica deployments
 * need a shared store; this is documented as a known limitation rather than silently ignored.
 */

interface Bucket {
    hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    /** Epoch ms when the oldest hit leaves the window. */
    resetAt: number;
    retryAfterSec: number;
}

function sweep(now: number, windowMs: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
        bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
        if (bucket.hits.length === 0) buckets.delete(key);
    }
}

/**
 * Registers one hit against `key`. Returns whether the call is allowed under `limit`/`windowMs`.
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    sweep(now, windowMs);

    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { hits: [] };
        buckets.set(key, bucket);
    }

    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= limit) {
        const oldest = bucket.hits[0];
        const resetAt = oldest + windowMs;
        return {
            allowed: false,
            limit,
            remaining: 0,
            resetAt,
            retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        };
    }

    bucket.hits.push(now);
    const resetAt = bucket.hits[0] + windowMs;
    return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.hits.length),
        resetAt,
        retryAfterSec: 0,
    };
}

/** Test helper: drops all in-memory buckets. */
export function resetRateLimits(): void {
    buckets.clear();
    lastSweep = 0;
}
