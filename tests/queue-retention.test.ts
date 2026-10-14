import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/woohub_test";

const { __testing, requeueDeadJobs } = await import("@/lib/queue");
const { retentionConfig } = await import("@/lib/retention");
const { alertsEnabled } = await import("@/lib/alerts");

describe("Queue — backoff", () => {
    const { backoffMs, webhookBackoffMs, NOT_AVAILABLE_BACKOFF_MS } = __testing;

    it("backoff exponencial cresce e satura em 5min", () => {
        expect(backoffMs(1)).toBe(5_000);
        expect(backoffMs(2)).toBe(10_000);
        expect(backoffMs(3)).toBe(20_000);
        expect(backoffMs(10)).toBe(5 * 60_000); // capped
    });

    it("backoff de webhook segue escada 1s/5s/25s e satura em 25s", () => {
        expect(webhookBackoffMs(1)).toBe(1_000);
        expect(webhookBackoffMs(2)).toBe(5_000);
        expect(webhookBackoffMs(3)).toBe(25_000);
        expect(webhookBackoffMs(4)).toBe(25_000);
        expect(webhookBackoffMs(99)).toBe(25_000);
    });

    it("instância indisponível usa backoff fixo de 30s", () => {
        expect(NOT_AVAILABLE_BACKOFF_MS).toBe(30_000);
    });
});

describe("Retention — configuração", () => {
    it("JOB_RETENTION_DAYS padrão é 30 e MESSAGE_RETENTION_DAYS padrão é 0 (off)", () => {
        const prevJob = process.env.JOB_RETENTION_DAYS;
        const prevMsg = process.env.MESSAGE_RETENTION_DAYS;
        delete process.env.JOB_RETENTION_DAYS;
        delete process.env.MESSAGE_RETENTION_DAYS;

        const config = retentionConfig();
        expect(config.jobDays).toBe(30);
        expect(config.messageDays).toBe(0);

        if (prevJob !== undefined) process.env.JOB_RETENTION_DAYS = prevJob;
        if (prevMsg !== undefined) process.env.MESSAGE_RETENTION_DAYS = prevMsg;
    });

    it("valores inválidos caem no fallback", () => {
        const prev = process.env.JOB_RETENTION_DAYS;
        process.env.JOB_RETENTION_DAYS = "not-a-number";
        expect(retentionConfig().jobDays).toBe(30);
        if (prev !== undefined) process.env.JOB_RETENTION_DAYS = prev;
        else delete process.env.JOB_RETENTION_DAYS;
    });

    it("valores explícitos são respeitados", () => {
        const prevJob = process.env.JOB_RETENTION_DAYS;
        const prevMsg = process.env.MESSAGE_RETENTION_DAYS;
        process.env.JOB_RETENTION_DAYS = "14";
        process.env.MESSAGE_RETENTION_DAYS = "90";

        const config = retentionConfig();
        expect(config.jobDays).toBe(14);
        expect(config.messageDays).toBe(90);

        if (prevJob !== undefined) process.env.JOB_RETENTION_DAYS = prevJob;
        else delete process.env.JOB_RETENTION_DAYS;
        if (prevMsg !== undefined) process.env.MESSAGE_RETENTION_DAYS = prevMsg;
        else delete process.env.MESSAGE_RETENTION_DAYS;
    });
});

describe("Alerts", () => {
    it("desabilitado por padrão (sem ALERT_WEBHOOK_URL)", () => {
        const prev = process.env.ALERT_WEBHOOK_URL;
        delete process.env.ALERT_WEBHOOK_URL;
        expect(alertsEnabled()).toBe(false);
        if (prev !== undefined) process.env.ALERT_WEBHOOK_URL = prev;
    });

    it("habilitado quando ALERT_WEBHOOK_URL está definido", () => {
        const prev = process.env.ALERT_WEBHOOK_URL;
        process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
        expect(alertsEnabled()).toBe(true);
        if (prev !== undefined) process.env.ALERT_WEBHOOK_URL = prev;
        else delete process.env.ALERT_WEBHOOK_URL;
    });
});

describe("Queue — requeueDeadJobs (validação de input)", () => {
    it("exportado e é função", () => {
        expect(typeof requeueDeadJobs).toBe("function");
    });
});
