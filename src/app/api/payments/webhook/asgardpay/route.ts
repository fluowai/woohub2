import { NextRequest, NextResponse } from "next/server";
import {
    buildExternalEventId,
    confirmAsgardpayPayment,
    loadGatewaySettings,
    PaymentServiceError,
    processPaymentEvent,
    resolveGateway,
    verifyAsgardpaySignature,
} from "@/lib/payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * AsgardPay webhook (PIX).
 *
 * Publico na camada de proxy: o gateway nao apresenta credenciais — a
 * autenticidade vem do header `x-webhook-signature` (HMAC-SHA256 do body bruto
 * com o `webhook_secret` devolvido pelo PUT /webhook) e o status do pagamento
 * e re-confirmado server-to-server antes de qualquer efeito. Dedup por
 * `event_id` via externalEventId.
 */

interface AsgardPayload {
    event?: unknown;
    event_id?: unknown;
    order_id?: unknown;
    amount?: unknown;
    status?: unknown;
    metadata?: { external_id?: unknown } | null;
}

export async function POST(request: NextRequest) {
    try {
        if ((await resolveGateway()) !== "asgardpay") {
            return NextResponse.json(
                { received: false, code: "gateway_not_configured", message: "Gateway AsgardPay não configurado" },
                { status: 503 }
            );
        }

        const rawBody = await request.text();
        const settings = await loadGatewaySettings();

        const signature = verifyAsgardpaySignature({
            secret: settings.webhookSecret,
            signature: request.headers.get("x-webhook-signature"),
            rawBody,
            timestamp: request.headers.get("x-webhook-timestamp"),
        });

        if (!signature.ok) {
            if (signature.reason === "webhook_secret_missing") {
                logger.error("Payments", "webhook_secret AsgardPay ausente — webhook recusado");
                return NextResponse.json(
                    { received: false, code: "webhook_not_configured", message: "Segredo do webhook não configurado" },
                    { status: 503 }
                );
            }
            logger.warn("Payments", `Webhook AsgardPay recusado: ${signature.reason}`);
            return NextResponse.json(
                { received: false, code: "invalid_signature", message: "Assinatura inválida" },
                { status: 401 }
            );
        }

        let payload: AsgardPayload = {};
        try {
            payload = JSON.parse(rawBody) as AsgardPayload;
        } catch {
            return NextResponse.json(
                { received: false, code: "invalid_payload", message: "Payload inválido" },
                { status: 400 }
            );
        }

        const event = typeof payload.event === "string" && payload.event ? payload.event : "";
        const eventId =
            (typeof payload.event_id === "string" && payload.event_id) ||
            request.headers.get("x-webhook-id") ||
            request.headers.get("x-webhook-event-id");
        const orderId = payload.order_id !== undefined && payload.order_id !== null ? String(payload.order_id) : null;
        const statusHint = typeof payload.status === "string" ? payload.status : null;

        if (!event) {
            return NextResponse.json(
                { received: false, code: "missing_event", message: "Campo event ausente" },
                { status: 400 }
            );
        }

        // Eventos de saque nao tem relacao com assinaturas de tenant.
        if (event.startsWith("withdrawal.")) {
            return NextResponse.json({ received: true, outcome: "ignored" }, { status: 200 });
        }

        // Re-confirmacao server-to-server antes de qualquer efeito (fonte da verdade).
        let confirmed: Awaited<ReturnType<typeof confirmAsgardpayPayment>> = null;
        if (orderId) {
            try {
                confirmed = await confirmAsgardpayPayment(orderId);
            } catch (error) {
                if (error instanceof PaymentServiceError) {
                    return NextResponse.json(
                        { received: false, code: error.code, message: error.message },
                        { status: 503 }
                    );
                }
                logger.error("Payments", "Falha ao confirmar pedido na AsgardPay:", error);
                return NextResponse.json(
                    { received: false, code: "confirmation_failed", message: "Confirmation failed" },
                    { status: 500 }
                );
            }
        }

        const externalEventId = buildExternalEventId({
            gateway: "asgardpay",
            type: event,
            paymentId: orderId,
            action: eventId,
        });

        const outcome = await processPaymentEvent({
            gateway: "asgardpay",
            type: event,
            action: null, // classificacao vem do status confirmado (ou hint)
            paymentId: orderId,
            confirmed,
            statusHint,
            externalEventId,
            requestId: eventId,
            payload: payload as Record<string, unknown>,
        });

        return NextResponse.json({ received: true, outcome: outcome.result }, { status: 200 });
    } catch (error) {
        logger.error("Payments", "Webhook AsgardPay falhou:", error);
        return NextResponse.json(
            { received: false, code: "webhook_error", message: "Webhook processing failed" },
            { status: 500 }
        );
    }
}
