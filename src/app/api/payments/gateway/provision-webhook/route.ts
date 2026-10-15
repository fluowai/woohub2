import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { GATEWAY_WEBHOOK_AAD, loadGatewaySettings, resolveGateway } from "@/lib/payments";
import { encryptSecret } from "@/lib/security/crypto";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Provisiona o webhook na AsgardPay (PUT /webhook) com a URL desta instancia
 * e armazena o `webhook_secret` retornado (aparece so na primeira configuracao
 * ou apos rotate_secret) em envelope AES-256-GCM.
 */

const ADMIN_ROLES = ["MEGA_ADMIN", "SUPER_ADMIN", "SUPERADMIN"];

export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        if ((await resolveGateway()) !== "asgardpay") {
            return NextResponse.json(
                { status: false, message: "Provisionamento de webhook suportado apenas para AsgardPay", error: "not_asgardpay" },
                { status: 400 }
            );
        }

        const cfg = await loadGatewaySettings();
        const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");
        if (!baseUrl.startsWith("https://")) {
            return NextResponse.json(
                { status: false, message: "BASE_URL deve ser HTTPS para cadastrar o webhook na AsgardPay", error: "https_required" },
                { status: 400 }
            );
        }

        const webhookUrl = `${baseUrl}/api/payments/webhook/asgardpay`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        let status = 0;
        let body: Record<string, unknown> | null = null;
        try {
            const res = await fetch(`${cfg.baseUrl}/webhook`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-Public-Key": cfg.publicKey,
                    "X-Secret-Key": cfg.secretKey,
                },
                body: JSON.stringify({ webhook_url: webhookUrl, webhook_enabled: true }),
                signal: controller.signal,
                cache: "no-store",
            });
            status = res.status;
            body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        } finally {
            clearTimeout(timer);
        }

        if (status === 401 || status === 403) {
            return NextResponse.json(
                { status: false, message: "Credenciais AsgardPay recusadas", error: "invalid_credentials" },
                { status: 401 }
            );
        }
        if (status < 200 || status >= 300) {
            logger.error("Payments", "Falha ao provisionar webhook AsgardPay:", status, body);
            return NextResponse.json(
                { status: false, message: `AsgardPay respondeu ${status}`, error: "gateway_error" },
                { status: 502 }
            );
        }

        // `webhook_secret` so e devolvido na primeira configuracao (ou apos rotate).
        const returnedSecret = body && typeof body.webhook_secret === "string" ? body.webhook_secret : "";
        if (returnedSecret) {
            await prisma.systemConfig.upsert({
                where: { id: "default" },
                update: { paymentWebhookSecret: encryptSecret(returnedSecret, GATEWAY_WEBHOOK_AAD) },
                create: { id: "default", paymentWebhookSecret: encryptSecret(returnedSecret, GATEWAY_WEBHOOK_AAD) },
            });
        }

        await audit({
            tenantId: null,
            actorUserId: user.id || null,
            actorLabel: user.email || "user",
            actorType: "USER",
            action: "gateway.webhook_provisioned",
            resource: "payment",
            metadata: { provider: "asgardpay", webhookUrl, secretReceived: Boolean(returnedSecret) },
        });

        return NextResponse.json({
            status: true,
            message: returnedSecret
                ? "Webhook provisionado e segredo armazenado"
                : "Webhook já configurado (segredo não foi reemitido)",
            data: { webhookUrl, secretStored: Boolean(returnedSecret), hasSecret: Boolean(returnedSecret || cfg.webhookSecret) },
        });
    } catch (error) {
        logger.error("Payments", "Provisionamento de webhook falhou:", error);
        return NextResponse.json({ status: false, message: "Webhook provisioning failed", error: "Failed" }, { status: 500 });
    }
}
