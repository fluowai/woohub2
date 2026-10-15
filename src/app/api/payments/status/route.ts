import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { confirmAsgardpayPayment, confirmMercadoPagoPayment, loadGatewaySettings } from "@/lib/payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Status de um pedido de checkout para o front (polling de UX apenas —
 * a confirmacao definitiva do pagamento e sempre o webhook + reconciliacao).
 * So retorna pedido da propria empresa (externalReference = tenantId:planId).
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !user.tenantId) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const orderId = request.nextUrl.searchParams.get("orderId") || "";
        if (!orderId || orderId.length > 64 || !/^[\w:-]+$/.test(orderId)) {
            return NextResponse.json({ status: false, message: "orderId inválido", error: "invalid_order" }, { status: 400 });
        }

        const settings = await loadGatewaySettings();
        const gateway = settings.provider;
        if (gateway !== "asgardpay" && gateway !== "mercadopago") {
            return NextResponse.json({ status: false, message: "Gateway não configurado", error: "gateway_not_configured" }, { status: 503 });
        }

        const confirmed =
            gateway === "asgardpay" ? await confirmAsgardpayPayment(orderId) : await confirmMercadoPagoPayment(orderId);

        if (!confirmed) {
            return NextResponse.json({ status: false, message: "Pedido não encontrado", error: "not_found" }, { status: 404 });
        }

        // Isolamento por tenant: so o dono do pedido enxerga ele.
        if (!confirmed.externalReference || !confirmed.externalReference.startsWith(`${user.tenantId}:`)) {
            return NextResponse.json({ status: false, message: "Pedido não encontrado", error: "not_found" }, { status: 404 });
        }

        const paid = confirmed.status === "completed" || confirmed.status === "approved";
        return NextResponse.json({
            status: true,
            message: "ok",
            data: {
                orderId: confirmed.id,
                gateway,
                paid,
                gatewayStatus: confirmed.status,
                amountCents: confirmed.amountCents,
                planId: confirmed.externalReference.split(":")[1] || null,
            },
        });
    } catch (error) {
        logger.error("Payments", "Consulta de status falhou:", error);
        return NextResponse.json({ status: false, message: "Status check failed", error: "Failed" }, { status: 500 });
    }
}
