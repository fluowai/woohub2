import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createCheckout, PaymentServiceError } from "@/lib/payments";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
    planId: z.string().min(1),
});

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !user.tenantId) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = checkoutSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const result = await createCheckout({ tenantId: user.tenantId, planId: parsed.data.planId });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "user",
            actorType: "USER",
            action: "checkout.create",
            resource: "payment",
            metadata: { gateway: result.gateway, externalId: result.externalId, planId: parsed.data.planId },
        });

        return NextResponse.json({ status: true, message: "Checkout created", data: result });
    } catch (error) {
        if (error instanceof PaymentServiceError) {
            if (error.code === "gateway_not_configured") {
                logger.warn("Payments", "Checkout solicitado sem gateway configurado");
                return NextResponse.json(
                    { status: false, message: error.message, error: error.code },
                    { status: 503 }
                );
            }
            return NextResponse.json({ status: false, message: error.message, error: error.code }, { status: 400 });
        }
        logger.error("Payments", "Checkout falhou:", error);
        return NextResponse.json({ status: false, message: "Failed to create checkout", error: "Failed to create checkout" }, { status: 500 });
    }
}
