import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/woohub_test";

const { classifyPaymentStatus, buildExternalEventId, verifyMercadoPagoSignature, configuredGateway, verifyAsgardpaySignature, extractReference } =
    await import("@/lib/payments");

/**
 * Reproduz a montagem do manifest conforme o validador oficial do SDK
 * MercadoPago: `id:<id>;request-id:<rid>;ts:<ts>;` (id em minúsculas e
 * timestamp em MILISSEGUNDOS, como o SDK calcula a tolerância).
 */
function sign(secret: string, dataId: string, tsMs: number, requestId?: string): string {
    const parts = [`id:${dataId.toLowerCase()}`];
    if (requestId) parts.push(`request-id:${requestId}`);
    parts.push(`ts:${tsMs}`);
    const manifest = `${parts.join(";")};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    return `ts=${tsMs},v1=${v1}`;
}

describe("classifyPaymentStatus", () => {
    it("mapeia os estados principais", () => {
        expect(classifyPaymentStatus("approved", null)).toBe("approved");
        expect(classifyPaymentStatus(null, "approved")).toBe("approved");
        expect(classifyPaymentStatus("refunded", null)).toBe("refunded");
        expect(classifyPaymentStatus("refound", null)).toBe("refunded");
        expect(classifyPaymentStatus("charged_back", null)).toBe("charged_back");
        expect(classifyPaymentStatus("rejected", null)).toBe("rejected");
        expect(classifyPaymentStatus("cancelled", null)).toBe("cancelled");
        expect(classifyPaymentStatus("pending", null)).toBe("pending");
    });

    it("normaliza prefixos payment. / payment: e variações de pendência", () => {
        expect(classifyPaymentStatus("payment.approved", null)).toBe("approved");
        expect(classifyPaymentStatus("payment:refunded", null)).toBe("refunded");
        expect(classifyPaymentStatus(null, "in_process")).toBe("pending");
        expect(classifyPaymentStatus(null, "in_mediation")).toBe("pending");
        expect(classifyPaymentStatus(null, "authorized")).toBe("pending");
        expect(classifyPaymentStatus(null, "canceled")).toBe("cancelled");
    });

    it("prefere action sobre status e devolve 'other' quando nada casa", () => {
        expect(classifyPaymentStatus("approved", "rejected")).toBe("approved");
        expect(classifyPaymentStatus(null, null)).toBe("other");
        expect(classifyPaymentStatus("", "")).toBe("other");
        expect(classifyPaymentStatus(null, "something_else")).toBe("other");
    });
});

describe("buildExternalEventId", () => {
    it("é estável para a mesma entrega (dedup)", () => {
        const params = {
            gateway: "mercadopago",
            type: "payment",
            paymentId: "12345",
            action: "payment.approved",
        };
        expect(buildExternalEventId(params)).toBe(buildExternalEventId({ ...params }));
        expect(buildExternalEventId(params)).toBe("mercadopago:payment:12345:payment.approved");
    });

    it("separa eventos distintos do mesmo pagamento", () => {
        const base = { gateway: "mercadopago", type: "payment", paymentId: "12345" };
        expect(buildExternalEventId({ ...base, action: "payment.approved" })).not.toBe(
            buildExternalEventId({ ...base, action: "payment.refunded" })
        );
    });

    it("usa requestId quando não há id de pagamento", () => {
        expect(
            buildExternalEventId({ gateway: "mercadopago", type: "payment", requestId: "rid-9" })
        ).toBe("mercadopago:payment:rid:rid-9");
    });

    it("cai para fingerprint determinístico do payload", () => {
        const a = buildExternalEventId({ gateway: "mercadopago", type: "payment", payloadFingerprint: '{"x":1}' });
        const b = buildExternalEventId({ gateway: "mercadopago", type: "payment", payloadFingerprint: '{"x":1}' });
        const c = buildExternalEventId({ gateway: "mercadopago", type: "payment", payloadFingerprint: '{"x":2}' });
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a.startsWith("mercadopago:payment:fp:")).toBe(true);
    });

    it("nunca excede 191 caracteres (limite da coluna)", () => {
        const id = buildExternalEventId({
            gateway: "mercadopago",
            type: "payment",
            paymentId: "x".repeat(300),
            action: "payment.approved",
        });
        expect(id.length).toBeLessThanOrEqual(191);
    });
});

describe("verifyMercadoPagoSignature", () => {
    const secret = "test_secret_123";
    const dataId = "ABC12345";
    const requestId = "req-1";
    const now = 1_760_000_000_000;

    it("aceita assinatura válida dentro da tolerância", () => {
        const ts = now;
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, dataId, ts, requestId),
            requestId,
            queryDataId: dataId,
            now,
        });
        expect(result.ok).toBe(true);
    });

    it("aceita id vindo do body quando não há query id", () => {
        const ts = now;
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, dataId, ts, requestId),
            requestId,
            bodyDataId: dataId,
            now,
        });
        expect(result.ok).toBe(true);
    });

    it("recusa secret errado", () => {
        const ts = now;
        const result = verifyMercadoPagoSignature({
            secret: "wrong_secret",
            signature: sign(secret, dataId, ts, requestId),
            requestId,
            queryDataId: dataId,
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("SignatureMismatch");
    });

    it("recusa sem secret configurado", () => {
        expect(
            verifyMercadoPagoSignature({ secret: "", signature: "ts=1,v1=aa", queryDataId: dataId }).reason
        ).toBe("webhook_secret_missing");
        expect(
            verifyMercadoPagoSignature({ secret: undefined, signature: "ts=1,v1=aa", queryDataId: dataId }).reason
        ).toBe("webhook_secret_missing");
    });

    it("recusa sem id do evento", () => {
        expect(
            verifyMercadoPagoSignature({ secret, signature: "ts=1,v1=aa", queryDataId: null, bodyDataId: "" }).reason
        ).toBe("missing_event_id");
    });

    it("recusa header ausente", () => {
        const result = verifyMercadoPagoSignature({
            secret,
            signature: null,
            queryDataId: dataId,
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("MissingSignatureHeader");
    });

    it("recusa timestamp fora da tolerância (replay)", () => {
        const staleTs = now - 3600 * 1000; // 1h atrás, tolerância 10min
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, dataId, staleTs, requestId),
            requestId,
            queryDataId: dataId,
            now,
            maxSkewMs: 10 * 60 * 1000,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("TimestampOutOfTolerance");
    });

    it("aceita ts em SEGUNDOS (formato usado pelo MercadoPago nos webhooks)", () => {
        const tsSeconds = Math.floor(now / 1000);
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, dataId, tsSeconds, requestId),
            requestId,
            queryDataId: dataId,
            now,
            maxSkewMs: 10 * 60 * 1000,
        });
        expect(result.ok).toBe(true);
    });

    it("aplica a tolerância também quando ts vem em segundos", () => {
        const staleTsSeconds = Math.floor(now / 1000) - 3600;
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, dataId, staleTsSeconds, requestId),
            requestId,
            queryDataId: dataId,
            now,
            maxSkewMs: 10 * 60 * 1000,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("TimestampOutOfTolerance");
    });

    it("recusa payload forjado com id diferente", () => {
        const ts = now;
        const result = verifyMercadoPagoSignature({
            secret,
            signature: sign(secret, "OTHER_ID", ts, requestId),
            requestId,
            queryDataId: dataId,
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("SignatureMismatch");
    });
});

describe("configuredGateway", () => {
    const prev = {
        gateway: process.env.PAYMENT_GATEWAY,
        secret: process.env.PAYMENT_GATEWAY_SECRET_KEY,
        asgardSecret: process.env.ASGARDPAY_SECRET_KEY,
    };

    const restore = () => {
        if (prev.gateway === undefined) delete process.env.PAYMENT_GATEWAY;
        else process.env.PAYMENT_GATEWAY = prev.gateway;
        if (prev.secret === undefined) delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        else process.env.PAYMENT_GATEWAY_SECRET_KEY = prev.secret;
        if (prev.asgardSecret === undefined) delete process.env.ASGARDPAY_SECRET_KEY;
        else process.env.ASGARDPAY_SECRET_KEY = prev.asgardSecret;
    };

    it("retorna null quando nada está configurado (sem checkout falso)", () => {
        delete process.env.PAYMENT_GATEWAY;
        delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        delete process.env.ASGARDPAY_SECRET_KEY;
        try {
            expect(configuredGateway()).toBeNull();
        } finally {
            restore();
        }
    });

    it("exige secret para mercadopago", () => {
        process.env.PAYMENT_GATEWAY = "mercadopago";
        delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        try {
            expect(configuredGateway()).toBeNull();
            process.env.PAYMENT_GATEWAY_SECRET_KEY = "tok_123";
            expect(configuredGateway()).toBe("mercadopago");
        } finally {
            restore();
        }
    });

    it("'manual' e gateway desconhecido não ativam checkout", () => {
        process.env.PAYMENT_GATEWAY_SECRET_KEY = "tok_123";
        try {
            process.env.PAYMENT_GATEWAY = "manual";
            expect(configuredGateway()).toBeNull();
            process.env.PAYMENT_GATEWAY = "stripe";
            expect(configuredGateway()).toBeNull();
            process.env.PAYMENT_GATEWAY = "desconhecido";
            expect(configuredGateway()).toBeNull();
        } finally {
            restore();
        }
    });
});

describe("classifyPaymentStatus (AsgardPay)", () => {
    it("mapeia status e eventos AsgardPay", () => {
        expect(classifyPaymentStatus(null, "completed")).toBe("approved");
        expect(classifyPaymentStatus("order.completed", null)).toBe("approved");
        expect(classifyPaymentStatus(null, "expired")).toBe("cancelled");
        expect(classifyPaymentStatus("order.expired", null)).toBe("cancelled");
        expect(classifyPaymentStatus("order.refunded", null)).toBe("refunded");
        expect(classifyPaymentStatus("order.cancelled", null)).toBe("cancelled");
        expect(classifyPaymentStatus(null, "processing")).toBe("pending");
        expect(classifyPaymentStatus(null, "pending")).toBe("pending");
        expect(classifyPaymentStatus("pix.generated", null)).toBe("other");
        expect(classifyPaymentStatus("order.disputed", null)).toBe("other");
    });
});

describe("verifyAsgardpaySignature", () => {
    const secret = "whsec_abc123";
    const body = JSON.stringify({ event: "order.completed", order_id: 456, event_id: "evt_1" });
    const now = 1_760_000_000_000;

    const signAsgard = (s: string, raw: string): string => createHmac("sha256", s).update(raw, "utf8").digest("hex");

    it("aceita HMAC-SHA256 v�lido do corpo bruto", () => {
        const result = verifyAsgardpaySignature({
            secret,
            signature: signAsgard(secret, body),
            rawBody: body,
            timestamp: String(now),
            now,
        });
        expect(result.ok).toBe(true);
    });

    it("aceita assinatura em mai�sculas (case-insensitive)", () => {
        const result = verifyAsgardpaySignature({
            secret,
            signature: signAsgard(secret, body).toUpperCase(),
            rawBody: body,
            timestamp: String(now),
            now,
        });
        expect(result.ok).toBe(true);
    });

    it("aceita sem header de timestamp (toler�ncia opcional)", () => {
        expect(verifyAsgardpaySignature({ secret, signature: signAsgard(secret, body), rawBody: body, now }).ok).toBe(true);
    });

    it("recusa corpo adulterado", () => {
        const tampered = body.replace("456", "999");
        const result = verifyAsgardpaySignature({
            secret,
            signature: signAsgard(secret, body),
            rawBody: tampered,
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("invalid_signature");
    });

    it("recusa secret errado", () => {
        const result = verifyAsgardpaySignature({
            secret: "wrong_secret",
            signature: signAsgard(secret, body),
            rawBody: body,
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("invalid_signature");
    });

    it("recusa sem secret configurado", () => {
        expect(
            verifyAsgardpaySignature({ secret: "", signature: "aa", rawBody: body, now }).reason
        ).toBe("webhook_secret_missing");
        expect(
            verifyAsgardpaySignature({ secret: undefined, signature: "aa", rawBody: body, now }).reason
        ).toBe("webhook_secret_missing");
    });

    it("recusa header ausente", () => {
        expect(
            verifyAsgardpaySignature({ secret, signature: null, rawBody: body, now }).reason
        ).toBe("missing_signature");
    });

    it("recusa timestamp fora da toler�ncia (replay)", () => {
        const stale = now - 3600 * 1000;
        const result = verifyAsgardpaySignature({
            secret,
            signature: signAsgard(secret, body),
            rawBody: body,
            timestamp: String(stale),
            now,
            maxSkewMs: 10 * 60 * 1000,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("TimestampOutOfTolerance");
    });

    it("aceita timestamp em segundos (unix) e em milissegundos", () => {
        const seconds = Math.floor(now / 1000);
        expect(
            verifyAsgardpaySignature({ secret, signature: signAsgard(secret, body), rawBody: body, timestamp: String(seconds), now }).ok
        ).toBe(true);
        expect(
            verifyAsgardpaySignature({ secret, signature: signAsgard(secret, body), rawBody: body, timestamp: String(now), now }).ok
        ).toBe(true);
    });

    it("recusa timestamp n�o num�rico", () => {
        const result = verifyAsgardpaySignature({
            secret,
            signature: signAsgard(secret, body),
            rawBody: body,
            timestamp: "yesterday",
            now,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("MalformedTimestampHeader");
    });
});

describe("configuredGateway (AsgardPay)", () => {
    const prev = {
        gateway: process.env.PAYMENT_GATEWAY,
        mpSecret: process.env.PAYMENT_GATEWAY_SECRET_KEY,
        asgardSecret: process.env.ASGARDPAY_SECRET_KEY,
    };

    const restore = () => {
        if (prev.gateway === undefined) delete process.env.PAYMENT_GATEWAY;
        else process.env.PAYMENT_GATEWAY = prev.gateway;
        if (prev.mpSecret === undefined) delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        else process.env.PAYMENT_GATEWAY_SECRET_KEY = prev.mpSecret;
        if (prev.asgardSecret === undefined) delete process.env.ASGARDPAY_SECRET_KEY;
        else process.env.ASGARDPAY_SECRET_KEY = prev.asgardSecret;
    };

    it("ativa asgardpay quando ASGARDPAY_SECRET_KEY existe e PAYMENT_GATEWAY n�o for�a outro", () => {
        delete process.env.PAYMENT_GATEWAY;
        delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        process.env.ASGARDPAY_SECRET_KEY = "gsk_test_123";
        try {
            expect(configuredGateway()).toBe("asgardpay");
        } finally {
            restore();
        }
    });

    it("PAYMENT_GATEWAY expl�cito tem preced�ncia sobre ASGARDPAY", () => {
        process.env.PAYMENT_GATEWAY = "mercadopago";
        process.env.PAYMENT_GATEWAY_SECRET_KEY = "tok_123";
        process.env.ASGARDPAY_SECRET_KEY = "gsk_test_123";
        try {
            expect(configuredGateway()).toBe("mercadopago");
        } finally {
            restore();
        }
    });

    it("'manual' desativa mesmo com ASGARDPAY_SECRET_KEY presente", () => {
        process.env.PAYMENT_GATEWAY = "manual";
        process.env.ASGARDPAY_SECRET_KEY = "gsk_test_123";
        try {
            expect(configuredGateway()).toBeNull();
        } finally {
            restore();
        }
    });

    it("sem secret nenhum retorna null", () => {
        delete process.env.PAYMENT_GATEWAY;
        delete process.env.PAYMENT_GATEWAY_SECRET_KEY;
        delete process.env.ASGARDPAY_SECRET_KEY;
        try {
            expect(configuredGateway()).toBeNull();
        } finally {
            restore();
        }
    });
});

describe("extractReference", () => {
    it("l� external_reference direto (MercadoPago)", () => {
        expect(extractReference({ external_reference: "tenant_1:plan_1" })).toBe("tenant_1:plan_1");
        expect(extractReference({ data: { external_reference: "tenant_2:plan_2" } })).toBe("tenant_2:plan_2");
    });

    it("l� metadata.external_id (AsgardPay)", () => {
        expect(extractReference({ metadata: { external_id: "tenant_3:plan_3" } })).toBe("tenant_3:plan_3");
        expect(extractReference({ metadata: { external_id: 42 } })).toBeNull();
    });

    it("retorna null quando ausente ou payload vazio", () => {
        expect(extractReference(undefined)).toBeNull();
        expect(extractReference({})).toBeNull();
        expect(extractReference({ metadata: {} })).toBeNull();
    });
});
