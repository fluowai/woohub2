import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
    GATEWAY_SECRET_AAD,
    GATEWAY_WEBHOOK_AAD,
    loadGatewaySettings,
    resolveGateway,
} from "@/lib/payments";
import { encryptSecret } from "@/lib/security/crypto";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Configuracao do gateway de pagamento pelo painel.
 *
 * GET  — estado efetivo (nunca expoe segredos; so mascaras)
 * PUT  — grava escolha + credenciais (segredos em envelope AES-256-GCM)
 */

const ADMIN_ROLES = ["MEGA_ADMIN", "SUPER_ADMIN", "SUPERADMIN"];

const putSchema = z.object({
    gateway: z.enum(["manual", "mercadopago", "asgardpay"]).optional(),
    // undefined = manter atual; string vazia = limpar; conteudo = gravar
    publicKey: z.string().max(500).optional(),
    secretKey: z.string().max(500).optional(),
    webhookSecret: z.string().max(500).optional(),
    baseUrl: z.string().max(300).optional(),
    sandbox: z.boolean().optional(),
});

function mask(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.length <= 10) return "••••";
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const settings = await loadGatewaySettings();
        const effective = await resolveGateway();

        return NextResponse.json({
            status: true,
            message: "Gateway settings fetched",
            data: {
                gateway: settings.provider || "manual",
                effectiveGateway: effective,
                publicKeyMasked: mask(settings.publicKey),
                hasSecretKey: Boolean(settings.secretKey),
                webhookSecretMasked: mask(settings.webhookSecret),
                baseUrl: settings.baseUrl,
                sandbox: settings.sandbox,
                source: settings.fromSettings ? "settings" : "env",
                webhookUrl: `${(process.env.BASE_URL || "").replace(/\/$/, "")}/api/payments/webhook/asgardpay`,
            },
        });
    } catch (error) {
        logger.error("Payments", "Falha ao ler configuracao do gateway:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch gateway settings", error: "Failed" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const parsed = putSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }
        const data = parsed.data;

        const update: Record<string, unknown> = {};
        if (data.gateway !== undefined) update.paymentGateway = data.gateway;
        if (data.publicKey !== undefined) update.paymentGatewayPublicKey = data.publicKey.trim() || null;
        if (data.baseUrl !== undefined) update.paymentGatewayBaseUrl = data.baseUrl.trim() || null;
        if (data.sandbox !== undefined) update.paymentGatewaySandbox = data.sandbox;
        // Segredos: vazio/ausente = manter o que ja existe (nao ha "limpar" por acidente).
        if (data.secretKey && data.secretKey.trim()) {
            update.paymentGatewaySecretKey = encryptSecret(data.secretKey.trim(), GATEWAY_SECRET_AAD);
        }
        if (data.webhookSecret && data.webhookSecret.trim()) {
            update.paymentWebhookSecret = encryptSecret(data.webhookSecret.trim(), GATEWAY_WEBHOOK_AAD);
        }

        if (Object.keys(update).length > 0) {
            await prisma.systemConfig.upsert({
                where: { id: "default" },
                update,
                create: { id: "default", ...update } as never,
            });
        }

        await audit({
            tenantId: null,
            actorUserId: user.id || null,
            actorLabel: user.email || "user",
            actorType: "USER",
            action: "gateway.update",
            resource: "payment",
            metadata: {
                gateway: data.gateway ?? "(mantido)",
                fields: Object.keys(update).filter((k) => k !== "paymentGatewaySecretKey" && k !== "paymentWebhookSecret"),
                secretUpdated: Boolean(data.secretKey?.trim()),
                webhookSecretUpdated: Boolean(data.webhookSecret?.trim()),
            },
        });

        const settings = await loadGatewaySettings();
        return NextResponse.json({
            status: true,
            message: "Gateway settings saved",
            data: {
                gateway: settings.provider || "manual",
                publicKeyMasked: mask(settings.publicKey),
                hasSecretKey: Boolean(settings.secretKey),
                webhookSecretMasked: mask(settings.webhookSecret),
                baseUrl: settings.baseUrl,
                sandbox: settings.sandbox,
                source: settings.fromSettings ? "settings" : "env",
            },
        });
    } catch (error) {
        logger.error("Payments", "Falha ao salvar configuracao do gateway:", error);
        return NextResponse.json({ status: false, message: "Failed to save gateway settings", error: "Failed" }, { status: 500 });
    }
}
