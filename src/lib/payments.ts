import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { decryptSecret, isEncrypted } from "@/lib/security/crypto";

/**
 * Provider-agnostic billing logic.
 *
 * Rules (Woohub spec, section 6):
 *  - the commercial logic never depends on a specific gateway;
 *  - a subscription is NEVER activated because the frontend said so — only after
 *    an authenticated gateway event confirmed server-to-server;
 *  - events are deduplicated by a stable identifier and applied transactionally;
 *  - out-of-order events cannot resurrect a refunded payment;
 *  - when no gateway/credentials are configured the interface reports
 *    `gateway_not_configured` instead of faking a checkout.
 */

export type PaymentProvider = "manual" | "mercadopago" | "stripe" | "asgardpay";

export interface CreateCheckoutInput {
    tenantId: string;
    planId: string;
    returnUrl?: string;
    cancelUrl?: string;
}

export interface CheckoutResult {
    gateway: PaymentProvider;
    externalId: string;
    checkoutUrl: string;
    invoiceId?: string;
    raw: Record<string, unknown>;
}

export class PaymentServiceError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = "PaymentServiceError";
    }
}

const PERIOD_DAYS: Record<string, number> = {
    MONTHLY: 30,
    YEARLY: 365,
    WEEKLY: 7,
    ONE_TIME: 365,
};

function periodDaysFor(period: string | undefined): number {
    return PERIOD_DAYS[(period || "MONTHLY").toUpperCase()] ?? 30;
}

/** Returns the configured gateway, or null when it is not usable yet. */
export function configuredGateway(): PaymentProvider | null {
    const raw = (process.env.PAYMENT_GATEWAY || "").trim().toLowerCase();
    // Sem escolha explicita, um segredo AsgardPay presente ativa o gateway PIX.
    if (!raw) {
        return (process.env.ASGARDPAY_SECRET_KEY || "").trim() ? "asgardpay" : null;
    }
    if (raw === "manual") return null;
    if (raw === "mercadopago") {
        return (process.env.PAYMENT_GATEWAY_SECRET_KEY || "").trim() ? "mercadopago" : null;
    }
    if (raw === "asgardpay") {
        return (process.env.ASGARDPAY_SECRET_KEY || "").trim() ? "asgardpay" : null;
    }
    if (raw === "stripe") return null; // interface delivered, not wired yet
    return null;
}

/* -------------------------------------------------------------------------- */
/* Credenciais: painel (SystemConfig) com fallback para .env                   */
/* -------------------------------------------------------------------------- */

export interface GatewaySettings {
    /** Gateway efetivo (painel quando preenchido, senao PAYMENT_GATEWAY do env). */
    provider: PaymentProvider | null;
    publicKey: string;
    secretKey: string; // texto puro em memoria; gravação usa envelope
    baseUrl: string;
    webhookSecret: string; // texto puro em memoria; gravação usa envelope
    sandbox: boolean;
    /** true quando a escolha veio do painel (SystemConfig), false = .env */
    fromSettings: boolean;
}

const ASGARD_DEFAULT_BASE = "https://app.asgardpay.com.br/api/v1";

function decryptIfEnvelope(value: string | null | undefined, aad: string): string {
    if (!value) return "";
    if (isEncrypted(value)) {
        try {
            return decryptSecret(value, aad);
        } catch (error) {
            logger.error("Payments", "Falha ao decifrar credencial do gateway:", error);
            return "";
        }
    }
    return value; // valor legado gravado antes da criptografia em repouso
}

export const GATEWAY_SECRET_AAD = "payment:systemconfig:secret";
export const GATEWAY_WEBHOOK_AAD = "payment:systemconfig:webhook";

/**
 * Carrega as credenciais efetivas do gateway.
 * Precedencia: painel (SystemConfig) quando preenchido, senao variaveis de ambiente.
 * Nunca lança: credencial ausente vira string vazia (o chamador decide).
 */
export async function loadGatewaySettings(): Promise<GatewaySettings> {
    let row: {
        paymentGateway: string | null;
        paymentGatewayPublicKey: string | null;
        paymentGatewaySecretKey: string | null;
        paymentGatewayBaseUrl: string | null;
        paymentWebhookSecret: string | null;
        paymentGatewaySandbox: boolean | null;
    } | null = null;
    try {
        row = await prisma.systemConfig.findUnique({
            where: { id: "default" },
            select: {
                paymentGateway: true,
                paymentGatewayPublicKey: true,
                paymentGatewaySecretKey: true,
                paymentGatewayBaseUrl: true,
                paymentWebhookSecret: true,
                paymentGatewaySandbox: true,
            },
        });
    } catch (error) {
        logger.warn("Payments", "Sem acesso ao SystemConfig; usando apenas variaveis de ambiente:", error);
    }

    // Precedencia: painel (inclusive "manual" explicito), senao variavel de ambiente.
    // Sem PAYMENT_GATEWAY definido, um ASGARDPAY_SECRET_KEY presente ativa asgardpay.
    const panelGateway = row?.paymentGateway ? (row.paymentGateway.toLowerCase() as PaymentProvider) : null;
    const envRaw = (process.env.PAYMENT_GATEWAY || "").trim().toLowerCase();
    const envGateway: PaymentProvider | null = envRaw
        ? (envRaw as PaymentProvider)
        : (process.env.ASGARDPAY_SECRET_KEY || "").trim()
          ? "asgardpay"
          : null;
    const effective: PaymentProvider | null = panelGateway ?? envGateway;

    const isAsgard = effective === "asgardpay";
    const isMp = effective === "mercadopago";

    const publicKey =
        row?.paymentGatewayPublicKey ||
        (isMp ? process.env.PAYMENT_GATEWAY_PUBLIC_KEY || "" : isAsgard ? process.env.ASGARDPAY_PUBLIC_KEY || "" : "");
    const secretKey =
        decryptIfEnvelope(row?.paymentGatewaySecretKey, GATEWAY_SECRET_AAD) ||
        (isMp ? process.env.PAYMENT_GATEWAY_SECRET_KEY || "" : isAsgard ? process.env.ASGARDPAY_SECRET_KEY || "" : "");
    const baseUrl =
        row?.paymentGatewayBaseUrl ||
        (isAsgard ? (process.env.ASGARDPAY_BASE_URL || "").trim() || ASGARD_DEFAULT_BASE : "");
    const webhookSecret =
        decryptIfEnvelope(row?.paymentWebhookSecret, GATEWAY_WEBHOOK_AAD) ||
        (isAsgard ? (process.env.ASGARDPAY_WEBHOOK_SECRET || "").trim() : "") ||
        (process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
    const sandbox =
        row?.paymentGatewaySandbox ??
        (process.env.PAYMENT_GATEWAY_SANDBOX || "").trim() === "true";

    return {
        provider: effective,
        publicKey: publicKey.trim(),
        secretKey: secretKey.trim(),
        baseUrl: baseUrl.replace(/\/$/, ""),
        webhookSecret: webhookSecret.trim(),
        sandbox,
        fromSettings: Boolean(row?.paymentGateway),
    };
}

/**
 * Gateway efetivamente utilizavel (chave presente), ou null.
 * Assincrono porque o painel pode ter configurado credenciais no banco.
 */
export async function resolveGateway(): Promise<PaymentProvider | null> {
    const cfg = await loadGatewaySettings();
    if (!cfg.provider || cfg.provider === "manual" || cfg.provider === "stripe") return null;
    if (!cfg.secretKey) return null;
    return cfg.provider;
}

function newInvoiceNumber(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `INV-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const gateway = await resolveGateway();
    if (!gateway) {
        throw new PaymentServiceError(
            "gateway_not_configured",
            "Gateway de pagamento não configurado. A ativação de planos é feita por ativação administrativa auditada."
        );
    }

    const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new PaymentServiceError("plan_not_found", "Plano não encontrado");
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new PaymentServiceError("tenant_not_found", "Empresa não encontrada");

    if (gateway === "mercadopago" || gateway === "asgardpay") {
        const result =
            gateway === "mercadopago"
                ? await createMercadoPagoCheckout({ ...input, plan, tenant })
                : await createAsgardpayCheckout({ ...input, plan, tenant });
        await createOpenInvoice({
            tenantId: tenant.id,
            planId: plan.id,
            amountCents: plan.priceCents,
            currency: plan.currency,
            description: plan.name,
            externalId: result.externalId,
        });
        return result;
    }

    throw new PaymentServiceError("not_implemented", "Gateway não suportado nesta versão");
}

async function createOpenInvoice(params: {
    tenantId: string;
    planId: string;
    amountCents: number;
    currency: string;
    description: string;
    externalId?: string;
}): Promise<string | null> {
    try {
        const subscription = await prisma.subscription.findUnique({ where: { tenantId: params.tenantId } });
        const invoice = await prisma.invoice.create({
            data: {
                tenantId: params.tenantId,
                subscriptionId: subscription?.id ?? null,
                number: newInvoiceNumber(),
                amountCents: params.amountCents,
                currency: params.currency,
                status: "OPEN",
                externalId: params.externalId ?? null,
                description: params.description,
            },
        });
        return invoice.id;
    } catch (error) {
        // A missing invoice must never block checkout, but the failure is loud.
        logger.error("Payments", "Failed to create OPEN invoice:", error);
        return null;
    }
}

async function createMercadoPagoCheckout(params: {
    plan: { id: string; name: string; priceCents: number; currency: string; period?: string };
    tenant: { id: string; name: string };
    returnUrl?: string;
    cancelUrl?: string;
}): Promise<CheckoutResult> {
    type MpModule = typeof import("mercadopago");
    let mod: MpModule;
    try {
        mod = await import("mercadopago");
    } catch {
        throw new PaymentServiceError("not_configured", "SDK do gateway não instalado");
    }

    const token = (process.env.PAYMENT_GATEWAY_SECRET_KEY || "").trim();
    if (!token) {
        throw new PaymentServiceError("gateway_not_configured", "Credencial do gateway ausente (PAYMENT_GATEWAY_SECRET_KEY)");
    }

    const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    const client = new mod.MercadoPagoConfig({ accessToken: token });
    const body = {
        items: [
            {
                id: params.plan.id,
                title: `Woohub - ${params.plan.name}`,
                description: params.plan.name,
                quantity: 1,
                currency_id: params.plan.currency || "BRL",
                unit_price: params.plan.priceCents / 100,
            },
        ],
        payer: { name: params.tenant.name },
        external_reference: `${params.tenant.id}:${params.plan.id}`,
        notification_url: `${baseUrl}/api/payments/webhook/mercadopago`,
        backUrls: {
            success: params.returnUrl || `${baseUrl}/dashboard/billing?status=success`,
            failure: params.cancelUrl || `${baseUrl}/dashboard/billing?status=failure`,
            pending: `${baseUrl}/dashboard/billing?status=pending`,
        },
        auto_return: "approved" as const,
    };

    const preference = await new mod.Preference(client).create({ body });
    const response = preference as { id: string; sandbox_init_point?: string; init_point?: string };

    // Sandbox is only ever used outside production.
    const sandbox = process.env.NODE_ENV !== "production" && process.env.PAYMENT_GATEWAY_SANDBOX === "true";
    const checkoutUrl = sandbox
        ? response.sandbox_init_point || response.init_point || ""
        : response.init_point || response.sandbox_init_point || "";

    return {
        gateway: "mercadopago",
        externalId: response.id,
        checkoutUrl,
        raw: { id: response.id, sandbox },
    };
}

/* -------------------------------------------------------------------------- */
/* AsgardPay (PIX)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Chamada autenticada a API AsgardPay (X-Public-Key / X-Secret-Key).
 * `path` e relativo ao BASE_URL configurado (ex.: `/payments/pix`).
 */
async function asgardpayRequest<T>(
    path: string,
    init: { method?: "GET" | "POST" | "PUT"; body?: unknown; timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; body: T | null }> {
    const cfg = await loadGatewaySettings();
    if (!cfg.baseUrl) throw new PaymentServiceError("gateway_not_configured", "ASGARDPAY_BASE_URL ausente");
    if (!cfg.publicKey || !cfg.secretKey) {
        throw new PaymentServiceError("gateway_not_configured", "Credenciais AsgardPay ausentes (public/secret key)");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
    try {
        const res = await fetch(`${cfg.baseUrl}${path}`, {
            method: init.method ?? "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Public-Key": cfg.publicKey,
                "X-Secret-Key": cfg.secretKey,
            },
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
            signal: controller.signal,
            cache: "no-store",
        });
        const text = await res.text();
        let body: T | null = null;
        try {
            body = text ? (JSON.parse(text) as T) : null;
        } catch {
            body = null;
        }
        return { ok: res.ok, status: res.status, body };
    } finally {
        clearTimeout(timer);
    }
}

async function createAsgardpayCheckout(params: {
    plan: { id: string; name: string; priceCents: number; currency: string };
    tenant: { id: string; name: string };
    returnUrl?: string;
    cancelUrl?: string;
}): Promise<CheckoutResult> {
    const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

    // Quem paga: email do dono da empresa (obrigatorio na API AsgardPay).
    const owner = await prisma.tenantMember.findFirst({
        where: { tenantId: params.tenant.id },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "asc" },
    });
    const customerEmail = owner?.user?.email?.trim();
    if (!customerEmail) {
        throw new PaymentServiceError("tenant_without_email", "A empresa não possui um e-mail de contato para a cobrança");
    }

    const amount = params.plan.priceCents / 100;
    if (!(amount >= 0.01)) {
        throw new PaymentServiceError("invalid_amount", "Valor do plano inválido para cobrança PIX");
    }

    const body = {
        customer: {
            email: customerEmail,
            name: owner?.user?.name?.trim() || params.tenant.name,
        },
        amount,
        currency: params.plan.currency || "BRL",
        // A API exige HTTPS: em ambiente local (http://) a URL e omitida.
        ...(baseUrl.startsWith("https://")
            ? { partner_checkout_url: `${baseUrl}/dashboard/billing` }
            : {}),
        metadata: { external_id: `${params.tenant.id}:${params.plan.id}` },
        idempotency_key: `woohub-${params.tenant.id}-${params.plan.id}-${new Date().toISOString().slice(0, 10)}`,
    };

    const res = await asgardpayRequest<{
        order_id?: number | string;
        status?: string;
        qrcode?: string | null;
        copy_paste?: string | null;
        message?: string;
        error?: string;
    }>("/payments/pix", { method: "POST", body });

    if (res.status === 401 || res.status === 403) {
        throw new PaymentServiceError("invalid_credentials", "Credenciais AsgardPay recusadas (verifique as chaves)");
    }
    if (!res.ok || !res.body || res.body.order_id === undefined) {
        logger.error("Payments", "AsgardPay recusou o checkout:", res.status, res.body);
        throw new PaymentServiceError(
            "gateway_error",
            res.body?.message || res.body?.error || `AsgardPay respondeu ${res.status}`
        );
    }

    const orderId = String(res.body.order_id);
    return {
        gateway: "asgardpay",
        externalId: orderId,
        // Nao ha pagina hospedada: o front exibe o QR devolvido em `raw`.
        checkoutUrl: `${baseUrl}/dashboard/billing?order=${encodeURIComponent(orderId)}`,
        raw: {
            order_id: res.body.order_id,
            status: res.body.status || "pending",
            qrcode: res.body.qrcode || null,
            copy_paste: res.body.copy_paste || null,
        },
    };
}

/**
 * Confirmacao server-to-server do pedido (fonte da verdade antes de qualquer
 * efeito). Lanca em falha de transporte (webhook responde 500 e o gateway reenvia).
 */
async function confirmAsgardpayPayment(orderId: string): Promise<ConfirmedPayment | null> {
    const res = await asgardpayRequest<{
        order_id?: number | string;
        status?: string;
        amount?: number;
        metadata?: { external_id?: string } | null;
        updated_at?: string | null;
        paid_at?: string | null;
        email?: string | null;
    }>(`/payments/${encodeURIComponent(orderId)}`);

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
        throw new PaymentServiceError("invalid_credentials", "Credenciais AsgardPay recusadas");
    }
    if (!res.ok || !res.body) {
        throw new Error(`gateway_http_${res.status}`);
    }

    const meta = (res.body.metadata || {}) as { external_id?: string };
    return {
        id: String(res.body.order_id ?? orderId),
        status: (res.body.status || "").toLowerCase(),
        externalReference: typeof meta.external_id === "string" ? meta.external_id : null,
        amountCents: Math.round((res.body.amount ?? 0) * 100),
        currency: "BRL",
        dateApproved: res.body.paid_at || res.body.updated_at || null,
    };
}

/* -------------------------------------------------------------------------- */
/* Webhook signature verification (pure, unit-testable)                       */
/* -------------------------------------------------------------------------- */

export interface SignatureCheck {
    secret: string | null | undefined;
    /** `x-signature` header, format `ts=<unix>,v1=<hex>` */
    signature: string | null | undefined;
    /** `x-request-id` header (included in the signed manifest when present) */
    requestId?: string | null;
    /** `data.id` received as query parameter */
    queryDataId?: string | null;
    /** `data.id` received in the body */
    bodyDataId?: string | null;
    now?: number;
    maxSkewMs?: number;
}

export interface SignatureResult {
    ok: boolean;
    reason?: string;
}

/**
 * Validates the MercadoPago `x-signature` header using the official SDK
 * validator (HMAC-SHA256, constant-time comparison).
 * Returns a machine-readable reason so the caller can answer without leaking details.
 *
 * `data.id` from the query string takes precedence over the body, per gateway docs.
 *
 * Replay window: the SDK is asked only for the cryptographic check; the timestamp
 * drift is enforced here because MercadoPago sends `ts` in SECONDS in its webhook
 * examples while the JS SDK compares it against Date.now() in MILLISECONDS —
 * enabling the SDK tolerance would reject every real notification. Both units are
 * accepted and normalized to ms before comparing with `maxSkewMs`.
 */
export function verifyMercadoPagoSignature(check: SignatureCheck): SignatureResult {
    const secret = (check.secret || "").trim();
    if (!secret) return { ok: false, reason: "webhook_secret_missing" };

    const dataId = (check.queryDataId || "").trim() || (check.bodyDataId || "").trim();
    if (!dataId) return { ok: false, reason: "missing_event_id" };

    try {
        WebhookSignatureValidator.validate({
            xSignature: check.signature ?? null,
            xRequestId: check.requestId ?? null,
            dataId,
            secret,
        });
    } catch (error) {
        if (error instanceof InvalidWebhookSignatureError) {
            return { ok: false, reason: error.reason };
        }
        logger.error("Payments", "Falha inesperada na verificação de assinatura:", error);
        return { ok: false, reason: "signature_check_failed" };
    }

    // Assinatura criptograficamente válida — agora a janela de replay.
    const tsRaw = (check.signature || "").split(",").map((p) => p.trim()).find((p) => p.startsWith("ts="))?.slice(3);
    if (!tsRaw || !/^\d+$/.test(tsRaw)) return { ok: false, reason: "MalformedSignatureHeader" };

    const tsValue = Number(tsRaw);
    const tsMs = tsValue < 1e12 ? tsValue * 1000 : tsValue; // segundos → ms
    const nowMs = check.now ?? Date.now();
    const skewMs = Math.abs(nowMs - tsMs);
    const maxSkew = check.maxSkewMs ?? 10 * 60 * 1000;
    if (skewMs > maxSkew) return { ok: false, reason: "TimestampOutOfTolerance" };

    return { ok: true };
}

export interface AsgardSignatureCheck {
    /** webhook_secret devolvido pelo PUT /webhook (ou PAYMENT_WEBHOOK_SECRET) */
    secret: string | null | undefined;
    /** header `x-webhook-signature`: HMAC-SHA256 hex do body bruto */
    signature: string | null | undefined;
    /** corpo bruto (antes de json.parse) */
    rawBody: string;
    /** header `x-webhook-timestamp` (unix segundos ou ms) */
    timestamp?: string | null;
    now?: number;
    maxSkewMs?: number;
}

/**
 * Validacao da assinatura AsgardPay: HMAC-SHA256(secret, body bruto) em hex,
 * comparacao em tempo constante + janela de replay pelo timestamp.
 * Puro e unit-testavel (sem rede nem banco).
 */
export function verifyAsgardpaySignature(check: AsgardSignatureCheck): SignatureResult {
    const secret = (check.secret || "").trim();
    if (!secret) return { ok: false, reason: "webhook_secret_missing" };

    const received = (check.signature || "").trim().toLowerCase();
    if (!received) return { ok: false, reason: "missing_signature" };

    const expected = createHmac("sha256", secret).update(check.rawBody, "utf8").digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, reason: "invalid_signature" };
    }

    const tsRaw = (check.timestamp || "").trim();
    if (tsRaw) {
        if (!/^\d+$/.test(tsRaw)) return { ok: false, reason: "MalformedTimestampHeader" };
        const tsValue = Number(tsRaw);
        const tsMs = tsValue < 1e12 ? tsValue * 1000 : tsValue;
        const skewMs = Math.abs((check.now ?? Date.now()) - tsMs);
        if (skewMs > (check.maxSkewMs ?? 10 * 60 * 1000)) {
            return { ok: false, reason: "TimestampOutOfTolerance" };
        }
    }

    return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Event processing                                                            */
/* -------------------------------------------------------------------------- */

export type PaymentClassification =
    | "approved"
    | "refunded"
    | "charged_back"
    | "rejected"
    | "cancelled"
    | "pending"
    | "other";

const REFUND_STATES: PaymentClassification[] = ["refunded", "charged_back"];

/** Normalizes gateway status/action into a small state set. Pure and testable. */
export function classifyPaymentStatus(action?: string | null, status?: string | null): PaymentClassification {
    const value = (action || status || "")
        .toLowerCase()
        .replace(/^payment[.:]/, "")
        .replace(/^order[.:]/, "") // eventos AsgardPay: order.completed, order.refunded...
        .trim();
    if (!value) return "other";
    if (value === "approved" || value === "completed") return "approved";
    if (value === "refunded" || value === "refound") return "refunded";
    if (value === "charged_back" || value === "charge_back" || value === "chargedback") return "charged_back";
    if (value === "rejected") return "rejected";
    if (value === "cancelled" || value === "canceled" || value === "expired") return "cancelled";
    if (value === "pending" || value === "in_process" || value === "in_mediation" || value === "authorized" || value === "processing") return "pending";
    return "other";
}

/** Stable dedup key: repeated deliveries of the same notification collide. */
export function buildExternalEventId(params: {
    gateway: string;
    type: string;
    paymentId?: string | null;
    action?: string | null;
    requestId?: string | null;
    payloadFingerprint?: string | null;
}): string {
    const id = (params.paymentId || "").trim();
    if (id) {
        const action = (params.action || params.requestId || "notification").trim().replace(/\s+/g, "_");
        return `${params.gateway}:${params.type}:${id}:${action}`.slice(0, 191);
    }
    if (params.requestId) {
        return `${params.gateway}:${params.type}:rid:${params.requestId}`.slice(0, 191);
    }
    const fp = createHash("sha256").update(params.payloadFingerprint || "").digest("hex").slice(0, 32);
    return `${params.gateway}:${params.type}:fp:${fp}`.slice(0, 191);
}

interface ConfirmedPayment {
    id: string;
    status: string;
    externalReference: string | null;
    amountCents: number;
    currency: string;
    dateApproved: string | null;
}

/**
 * Confirms the payment server-to-server with MercadoPago.
 * Returns null when the gateway does not know the payment (caller decides),
 * throws on transport errors so the webhook answers 500 and is retried.
 */
async function confirmMercadoPagoPayment(paymentId: string): Promise<ConfirmedPayment | null> {
    const token = (await loadGatewaySettings()).secretKey;
    if (!token) throw new PaymentServiceError("gateway_not_configured", "PAYMENT_WEBHOOK_SECRET/PAYMENT_GATEWAY_SECRET_KEY ausente");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
        });
        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(`gateway_http_${res.status}`);
        }
        const body = (await res.json()) as {
            id?: string | number;
            status?: string;
            external_reference?: string | null;
            transaction_amount?: number;
            currency_id?: string;
            date_approved?: string | null;
        };
        return {
            id: String(body.id ?? paymentId),
            status: (body.status || "").toLowerCase(),
            externalReference: body.external_reference || null,
            amountCents: Math.round((body.transaction_amount ?? 0) * 100),
            currency: body.currency_id || "BRL",
            dateApproved: body.date_approved || null,
        };
    } finally {
        clearTimeout(timer);
    }
}

export type PaymentOutcome =
    | { result: "duplicate" }
    | { result: "processed"; effect: "activated" | "refunded" | "voided" | "pending" | "none" }
    | { result: "ignored"; reason: string };

function parseExternalReference(ref: string | null): { tenantId: string; planId: string } | null {
    if (!ref) return null;
    const [tenantId, planId] = ref.split(":");
    if (!tenantId || !planId) return null;
    return { tenantId, planId };
}

/**
 * Applies one authenticated gateway event: dedup + effect + audit, atomically.
 * A failure rolls the whole transaction back so the gateway retry can reprocess.
 */
export async function processPaymentEvent(input: {
    gateway: string;
    type: string;
    action?: string | null;
    paymentId?: string | null;
    /** Authoritative status fetched from the gateway (preferred over the notification hint). */
    confirmed?: ConfirmedPayment | null;
    /** Status hint carried by the notification (used only when confirmation is unavailable). */
    statusHint?: string | null;
    externalEventId: string;
    requestId?: string | null;
    payload?: Record<string, unknown>;
}): Promise<PaymentOutcome> {
    const classification = classifyPaymentStatus(input.action, input.confirmed?.status || input.statusHint);
    const jsonPayload = (input.payload ?? {}) as Prisma.InputJsonValue;
    let auditTenantId: string | null = null;

    const outcome = await prisma.$transaction(async (tx): Promise<PaymentOutcome> => {
        const existing = await tx.paymentEvent.findUnique({ where: { externalEventId: input.externalEventId } });
        if (existing) {
            return { result: "duplicate" };
        }

        const paymentId = input.confirmed?.id || input.paymentId || null;
        const ref = parseExternalReference(input.confirmed?.externalReference ?? extractReference(input.payload));

        if (classification === "approved") {
            // Out-of-order guard: a payment already refunded never reactivates.
            if (paymentId) {
                const prefix = `${input.gateway}:${input.type}:${paymentId}:`;
                const refund = await tx.paymentEvent.findFirst({
                    where: {
                        externalEventId: { startsWith: prefix },
                        status: "PROCESSED",
                        OR: [{ type: "refund" }, { type: "charged_back" }],
                    },
                });
                if (refund) {
                    await tx.paymentEvent.create({
                        data: {
                            gateway: input.gateway,
                            externalEventId: input.externalEventId,
                            type: "approved",
                            payload: jsonPayload,
                            status: "IGNORED",
                            processedAt: new Date(),
                            error: "superseded_by_refund",
                        },
                    });
                    return { result: "ignored", reason: "superseded_by_refund" };
                }
            }

            if (!ref) {
                await tx.paymentEvent.create({
                    data: {
                        gateway: input.gateway,
                        externalEventId: input.externalEventId,
                        type: "approved",
                        payload: jsonPayload,
                        status: "IGNORED",
                        processedAt: new Date(),
                        error: "missing_external_reference",
                    },
                });
                return { result: "ignored", reason: "missing_external_reference" };
            }

            const now = new Date();
            auditTenantId = ref.tenantId;
            const plan = await tx.plan.findUnique({ where: { id: ref.planId } });
            const days = periodDaysFor(plan?.period);
            const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

            const subscription = await tx.subscription.findUnique({ where: { tenantId: ref.tenantId } });
            // Never shorten an already longer period (out-of-order renewal).
            const currentEnd = subscription?.currentPeriodEnd;
            const nextEnd = currentEnd && currentEnd > periodEnd ? currentEnd : periodEnd;
            const nextStart = subscription && currentEnd && currentEnd > periodEnd ? subscription.currentPeriodStart : now;

            const savedSubscription = await tx.subscription.upsert({
                where: { tenantId: ref.tenantId },
                update: {
                    planId: ref.planId,
                    status: "ACTIVE",
                    currentPeriodStart: nextStart,
                    currentPeriodEnd: nextEnd,
                    canceledAt: null,
                    suspendedAt: null,
                    graceEndsAt: null,
                    cancelAtPeriodEnd: false,
                },
                create: {
                    tenantId: ref.tenantId,
                    planId: ref.planId,
                    status: "ACTIVE",
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                },
            });

            const amountCents = input.confirmed?.amountCents ?? plan?.priceCents ?? 0;
            const currency = input.confirmed?.currency ?? plan?.currency ?? "BRL";
            const invoice = await tx.invoice.findFirst({
                where: { tenantId: ref.tenantId, status: { in: ["OPEN", "PENDING"] } },
                orderBy: { createdAt: "desc" },
            });
            let invoiceId: string | null = invoice?.id ?? null;
            if (invoice) {
                await tx.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        status: "PAID",
                        paidAt: input.confirmed?.dateApproved ? new Date(input.confirmed.dateApproved) : now,
                        amountCents: amountCents || invoice.amountCents,
                        subscriptionId: savedSubscription.id,
                        externalId: paymentId || invoice.externalId,
                    },
                });
            } else {
                const created = await tx.invoice.create({
                    data: {
                        tenantId: ref.tenantId,
                        subscriptionId: savedSubscription.id,
                        number: newInvoiceNumber(),
                        amountCents,
                        currency,
                        status: "PAID",
                        paidAt: now,
                        externalId: paymentId,
                        description: plan?.name ?? "Plano Woohub",
                    },
                });
                invoiceId = created.id;
            }

            await tx.paymentEvent.create({
                data: {
                    gateway: input.gateway,
                    externalEventId: input.externalEventId,
                    type: "approved",
                    payload: jsonPayload,
                    status: "PROCESSED",
                    processedAt: now,
                    invoiceId,
                },
            });
            return { result: "processed", effect: "activated" };
        }

        if (REFUND_STATES.includes(classification)) {
            const invoice = paymentId
                ? await tx.invoice.findFirst({ where: { externalId: paymentId } })
                : null;
            const tenantId = invoice?.tenantId || ref?.tenantId || null;
            auditTenantId = tenantId;

            if (invoice) {
                await tx.invoice.update({
                    where: { id: invoice.id },
                    data: { status: "REFUNDED" },
                });
            }
            if (tenantId) {
                const subscription = await tx.subscription.findUnique({ where: { tenantId } });
                if (subscription && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status)) {
                    await tx.subscription.update({
                        where: { tenantId },
                        data: { status: "SUSPENDED", suspendedAt: new Date() },
                    });
                }
            }

            await tx.paymentEvent.create({
                data: {
                    gateway: input.gateway,
                    externalEventId: input.externalEventId,
                    type: classification === "charged_back" ? "charged_back" : "refund",
                    payload: jsonPayload,
                    status: "PROCESSED",
                    processedAt: new Date(),
                    invoiceId: invoice?.id ?? null,
                },
            });
            return { result: "processed", effect: "refunded" };
        }

        if (classification === "rejected" || classification === "cancelled") {
            const invoice = paymentId ? await tx.invoice.findFirst({ where: { externalId: paymentId } }) : null;
            if (invoice && ["OPEN", "PENDING"].includes(invoice.status)) {
                await tx.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
            }
            await tx.paymentEvent.create({
                data: {
                    gateway: input.gateway,
                    externalEventId: input.externalEventId,
                    type: "rejected",
                    payload: jsonPayload,
                    status: "PROCESSED",
                    processedAt: new Date(),
                    invoiceId: invoice?.id ?? null,
                },
            });
            return { result: "processed", effect: "voided" };
        }

        if (classification === "pending") {
            const invoice = paymentId ? await tx.invoice.findFirst({ where: { externalId: paymentId } }) : null;
            if (invoice && invoice.status === "OPEN") {
                await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PENDING" } });
            }
            await tx.paymentEvent.create({
                data: {
                    gateway: input.gateway,
                    externalEventId: input.externalEventId,
                    type: "pending",
                    payload: jsonPayload,
                    status: "PROCESSED",
                    processedAt: new Date(),
                    invoiceId: invoice?.id ?? null,
                },
            });
            return { result: "processed", effect: "pending" };
        }

        await tx.paymentEvent.create({
            data: {
                gateway: input.gateway,
                externalEventId: input.externalEventId,
                type: "other",
                payload: jsonPayload,
                status: "IGNORED",
                processedAt: new Date(),
            },
        });
        return { result: "ignored", reason: "unclassified" };
    });

    if (outcome.result === "processed") {
        await audit({
            tenantId: auditTenantId,
            actorLabel: input.gateway,
            actorType: "SYSTEM",
            action:
                outcome.effect === "activated"
                    ? "payment.approved"
                    : outcome.effect === "refunded"
                      ? "payment.refunded"
                      : outcome.effect === "voided"
                        ? "payment.rejected"
                        : "payment.pending",
            resource: "payment",
            resourceId: input.paymentId ?? null,
            metadata: { gateway: input.gateway, externalEventId: input.externalEventId, effect: outcome.effect },
        });
    }

    return outcome;
}

function extractReference(payload: Record<string, unknown> | undefined): string | null {
    if (!payload) return null;
    const direct = payload.external_reference;
    if (typeof direct === "string" && direct) return direct;
    const data = payload.data as { external_reference?: unknown } | undefined;
    if (data && typeof data.external_reference === "string" && data.external_reference) return data.external_reference;
    // AsgardPay carrega a referencia em metadata.external_id.
    const meta = payload.metadata as { external_id?: unknown } | undefined;
    if (meta && typeof meta.external_id === "string" && meta.external_id) return meta.external_id;
    return null;
}

export { confirmMercadoPagoPayment, confirmAsgardpayPayment, extractReference };
