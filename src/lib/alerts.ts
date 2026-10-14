import { logger } from "./logger";

/**
 * Operational alerts (optional).
 *
 * Set ALERT_WEBHOOK_URL to a Slack/Discord/Telegram-compatible webhook (or any
 * endpoint accepting JSON). Alerts fire on: boot, graceful shutdown,
 * uncaughtException and DLQ growth. Never contains customer/tenant data —
 * only process-level facts (app name, version, event, uptime, error message).
 *
 * Delivery is fire-and-forget with a cooldown so a crash-loop cannot spam.
 */

const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

export interface AlertPayload {
    event: string;
    severity: "info" | "warning" | "critical";
    message: string;
    app?: string;
    version?: string;
    uptimeSeconds?: number;
    hostname?: string;
    details?: Record<string, unknown>;
}

function alertUrl(): string | null {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    return url || null;
}

export function sendAlert(payload: AlertPayload): void {
    const url = alertUrl();
    if (!url) return;

    const now = Date.now();
    const last = lastSent.get(payload.event) ?? 0;
    if (now - last < COOLDOWN_MS) return;
    lastSent.set(payload.event, now);

    const body = {
        ...payload,
        app: payload.app || process.env.APP_NAME || "woohub",
        version: payload.version || process.env.npm_package_version || "unknown",
        uptimeSeconds: payload.uptimeSeconds ?? Math.round(process.uptime()),
        hostname: payload.hostname || process.env.HOSTNAME || "unknown",
        timestamp: new Date().toISOString(),
    };

    // Never block or crash the caller on alert delivery failure.
    void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
    }).catch((err) => {
        logger.warn("Alerts", `Failed to deliver alert "${payload.event}":`, err);
    });

    logger.info("Alerts", `Alert sent: [${payload.severity}] ${payload.event} — ${payload.message}`);
}

/** True when alerting is configured (used by health monitors / tests). */
export function alertsEnabled(): boolean {
    return Boolean(alertUrl());
}
