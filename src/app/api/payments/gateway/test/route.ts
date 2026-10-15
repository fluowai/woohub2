import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { loadGatewaySettings } from "@/lib/payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Testa as credenciais do gateway contra a API real (somente leitura).
 *
 * AsgardPay: GET /balance (escopo payments:read).
 * MercadoPago: GET /v1/payment_methods (token de acesso).
 *
 * Aceita chaves opcionais no body para validar ANTES de salvar.
 */

const ADMIN_ROLES = ["MEGA_ADMIN", "SUPER_ADMIN", "SUPERADMIN"];

const testSchema = z.object({
    gateway: z.enum(["manual", "mercadopago", "asgardpay"]).optional(),
    publicKey: z.string().max(500).optional(),
    secretKey: z.string().max(500).optional(),
    baseUrl: z.string().max(300).optional(),
});

interface TestResult {
    ok: boolean;
    provider: string;
    message: string;
    detail?: unknown;
}

async function testAsgardpay(publicKey: string, secretKey: string, baseUrl: string): Promise<TestResult> {
    if (!baseUrl) return { ok: false, provider: "asgardpay", message: "URL base da API ausente" };
    if (!publicKey || !secretKey) return { ok: false, provider: "asgardpay", message: "Public/Secret key ausente" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/balance`, {
            headers: { Accept: "application/json", "X-Public-Key": publicKey, "X-Secret-Key": secretKey },
            signal: controller.signal,
            cache: "no-store",
        });
        const body = await res.json().catch(() => null);
        if (res.status === 401 || res.status === 403) {
            return { ok: false, provider: "asgardpay", message: "Credenciais recusadas (401/403) — confira as chaves" };
        }
        if (!res.ok) {
            return { ok: false, provider: "asgardpay", message: `API respondeu ${res.status}` };
        }
        const available = body && typeof body === "object" ? (body as { available_balance?: number }).available_balance : undefined;
        return {
            ok: true,
            provider: "asgardpay",
            message: "Conexão OK — credenciais válidas",
            detail: available !== undefined ? { available_balance: available } : undefined,
        };
    } catch (error) {
        logger.warn("Payments", "Teste AsgardPay falhou:", error);
        return { ok: false, provider: "asgardpay", message: "Falha de rede ao acessar a API" };
    } finally {
        clearTimeout(timer);
    }
}

async function testMercadopago(secretKey: string): Promise<TestResult> {
    if (!secretKey) return { ok: false, provider: "mercadopago", message: "Access token ausente" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch("https://api.mercadopago.com/v1/payment_methods", {
            headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) {
            return { ok: false, provider: "mercadopago", message: "Token recusado (401/403) — confira o access token" };
        }
        if (!res.ok) return { ok: false, provider: "mercadopago", message: `API respondeu ${res.status}` };
        const methods = (await res.json().catch(() => [])) as unknown[];
        return { ok: true, provider: "mercadopago", message: "Conexão OK — credenciais válidas", detail: { payment_methods: methods.length } };
    } catch (error) {
        logger.warn("Payments", "Teste MercadoPago falhou:", error);
        return { ok: false, provider: "mercadopago", message: "Falha de rede ao acessar a API" };
    } finally {
        clearTimeout(timer);
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const parsed = testSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const saved = await loadGatewaySettings();
        const provider = parsed.data.gateway ?? saved.provider ?? "manual";
        const publicKey = parsed.data.publicKey?.trim() || saved.publicKey;
        const secretKey = parsed.data.secretKey?.trim() || saved.secretKey;
        const baseUrl = parsed.data.baseUrl?.trim() || saved.baseUrl;

        let result: TestResult;
        if (provider === "asgardpay") {
            result = await testAsgardpay(publicKey, secretKey, baseUrl);
        } else if (provider === "mercadopago") {
            result = await testMercadopago(secretKey);
        } else {
            result = { ok: false, provider: "manual", message: "Nenhum gateway selecionado" };
        }

        return NextResponse.json({ status: result.ok, message: result.message, data: result });
    } catch (error) {
        logger.error("Payments", "Teste de gateway falhou:", error);
        return NextResponse.json({ status: false, message: "Gateway test failed", error: "Failed" }, { status: 500 });
    }
}
