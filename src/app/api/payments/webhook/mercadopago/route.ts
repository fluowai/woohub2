import { NextRequest, NextResponse } from "next/server";
import {
    buildExternalEventId,
    confirmMercadoPagoPayment,
    configuredGateway,
    PaymentServiceError,
    processPaymentEvent,
    verifyMercadoPagoSignature,
} from "@/lib/payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * MercadoPago webhook.
 *
 * This route is public at the proxy layer because the gateway cannot present
 * credentials — authenticity comes from the `x-signature` HMAC header, and the
 * payment status is re-confirmed server-to-server before any subscription change.
 * Nothing here is driven by the browser.
 */

function readPayload(payload: Record<string, unknown>): {
    type: string;
    action: string | null;
    bodyDataId: string | null;
    statusHint: string | null;
} {
    const data = (payload.data ?? {}) as { id?: unknown; status?: unknown };
    const type = typeof payload.type === "string" && payload.type ? payload.type : "payment";
    const action = typeof payload.action === "string" && payload.action ? payload.action : null;
    const bodyDataId = data.id !== undefined && data.id !== null ? String(data.id) : null;
    const statusHint = data.status !== undefined && data.status !== null ? String(data.status) : null;
    return { type, action, bodyDataId, statusHint };
}

export async function POST(request: NextRequest) {
    try {
        if (!configuredGateway()) {
            return NextResponse.json(
                { received: false, code: "gateway_not_configured", message: "Gateway de pagamento não configurado" },
                { status: 503 }
            );
        }

        const contentType = request.headers.get("content-type") || "";
        let payload: Record<string, unknown> = {};
        let formStatus: string | null = null;

        if (contentType.includes("application/json")) {
            payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        } else {
            const form = await request.formData();
            const entry: Record<string, unknown> = {};
            form.forEach((value, key) => {
                entry[key] = typeof value === "string" ? value : String(value);
            });
            payload = entry;
            formStatus = typeof payload.status === "string" ? (payload.status as string) : null;
        }

        const parsed = readPayload(payload);
        const queryDataId = request.nextUrl.searchParams.get("data.id") || request.nextUrl.searchParams.get("data[id]");

        const signature = verifyMercadoPagoSignature({
            secret: process.env.PAYMENT_WEBHOOK_SECRET,
            signature: request.headers.get("x-signature"),
            requestId: request.headers.get("x-request-id"),
            queryDataId,
            bodyDataId: parsed.bodyDataId,
        });

        if (!signature.ok) {
            if (signature.reason === "webhook_secret_missing") {
                logger.error("Payments", "PAYMENT_WEBHOOK_SECRET não configurado — webhook recusado");
                return NextResponse.json(
                    { received: false, code: "webhook_not_configured", message: "Segredo do webhook não configurado" },
                    { status: 503 }
                );
            }
            logger.warn("Payments", `Webhook MercadoPago recusado: ${signature.reason}`);
            return NextResponse.json(
                { received: false, code: "invalid_signature", message: "Assinatura inválida" },
                { status: 401 }
            );
        }

        const paymentId = queryDataId || parsed.bodyDataId;
        const action = parsed.action;
        const statusHint = parsed.statusHint || formStatus;
        const requestId = request.headers.get("x-request-id");

        let confirmed: Awaited<ReturnType<typeof confirmMercadoPagoPayment>> = null;
        if (paymentId && parsed.type === "payment") {
            try {
                confirmed = await confirmMercadoPagoPayment(paymentId);
            } catch (error) {
                if (error instanceof PaymentServiceError) {
                    return NextResponse.json(
                        { received: false, code: error.code, message: error.message },
                        { status: 503 }
                    );
                }
                // Transport/confirmation failure: answer 500 so the gateway retries.
                logger.error("Payments", "Falha ao confirmar pagamento no gateway:", error);
                return NextResponse.json(
                    { received: false, code: "confirmation_failed", message: "Confirmation failed" },
                    { status: 500 }
                );
            }
        }

        const externalEventId = buildExternalEventId({
            gateway: "mercadopago",
            type: parsed.type,
            paymentId,
            action,
            requestId,
            payloadFingerprint: JSON.stringify(payload),
        });

        const outcome = await processPaymentEvent({
            gateway: "mercadopago",
            type: parsed.type,
            action,
            paymentId,
            confirmed,
            statusHint,
            externalEventId,
            requestId,
            payload,
        });

        return NextResponse.json({ received: true, outcome: outcome.result }, { status: 200 });
    } catch (error) {
        logger.error("Payments", "Webhook MercadoPago falhou:", error);
        return NextResponse.json(
            { received: false, code: "webhook_error", message: "Webhook processing failed" },
            { status: 500 }
        );
    }
}
