import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { safeFetch, SsrfError } from "@/lib/security/ssrf";
import { audit } from "@/lib/audit";
import { invalidateQuotaCache } from "@/lib/quota";
import { assertPlanForMode, CommercialRuleError } from "@/lib/commercial";

const onboardingSchema = z.object({
    customerType: z.enum(["DIRECT", "RESELLER"]),
    planCode: z.string().trim().min(1).max(64),
    domain: z.string().trim().max(253).optional().or(z.literal("")),
    supabaseUrl: z.string().url().optional().or(z.literal("")),
    minioUrl: z.string().url().optional().or(z.literal("")),
});

async function checkEndpoint(rawUrl: string | undefined, label: string) {
    if (!rawUrl) return { label, configured: false, reachable: false, status: null, message: "Não configurado" };
    try {
        const result = await safeFetch(rawUrl, { method: "GET", timeoutMs: 8_000, maxBytes: 16_384 });
        return {
            label,
            configured: true,
            reachable: result.status >= 200 && result.status < 300,
            status: result.status,
            message: result.status >= 200 && result.status < 300 ? "Conexão validada" : `O endpoint respondeu HTTP ${result.status}`,
        };
    } catch (error) {
        const message = error instanceof SsrfError ? error.message : "Não foi possível conectar ao endpoint";
        return { label, configured: true, reachable: false, status: null, message };
    }
}

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user?.tenantId) return NextResponse.json({ status: false, message: "Não autenticado" }, { status: 401 });
    const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, name: true, features: true, resellerId: true, subscriptions: { include: { plan: true }, take: 1 } },
    });
    return NextResponse.json({ status: true, data: tenant });
}

export async function POST(request: NextRequest) {
    try {
    const user = await getAuthenticatedUser(request);
    if (!user?.tenantId || !user.id) return NextResponse.json({ status: false, message: "Não autenticado" }, { status: 401 });

    const parsed = onboardingSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ status: false, message: "Revise os dados do onboarding", errors: parsed.error.flatten() }, { status: 400 });

    const { customerType, planCode, domain, supabaseUrl, minioUrl } = parsed.data;
    const [supabase, minio] = await Promise.all([
        checkEndpoint(supabaseUrl, "Supabase"),
        checkEndpoint(minioUrl, "MinIO"),
    ]);
    const connectionErrors = [supabase, minio].filter((item) => item.configured && !item.reachable);
    if (connectionErrors.length) {
        return NextResponse.json({ status: false, code: "INTEGRATION_UNREACHABLE", message: "Não foi possível validar todas as conexões", data: { checks: [supabase, minio] } }, { status: 422 });
    }

    const mode = customerType === "RESELLER" ? "WHITE_LABEL" : "DIRECT";
    const plan = await prisma.plan.findFirst({ where: { code: planCode, status: "ACTIVE", resellerId: null, commercialMode: mode } });
    if (!plan) return NextResponse.json({ status: false, message: "Plano não encontrado ou indisponível" }, { status: 404 });
    assertPlanForMode({ plan, mode, resellerId: null });

    const existing = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { features: true, resellerId: true } });
    const previous = (existing?.features && typeof existing.features === "object" && !Array.isArray(existing.features)) ? existing.features as Record<string, unknown> : {};
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
        let resellerId = existing?.resellerId ?? null;
        if (customerType === "RESELLER" && !resellerId) {
            const reseller = await tx.reseller.create({
                data: { name: `${user.email} — Revenda Woohub`, slug: `revenda-${user.id.slice(-10).toLowerCase()}`, ownerId: user.id, maxInstances: Math.max(10, plan.maxInstances), maxTenants: Math.max(5, plan.maxUsers), features: plan.features ?? {} },
            });
            resellerId = reseller.id;
        }
        const features = {
            ...previous,
            onboarding: { completed: true, completedAt: now.toISOString(), customerType, planCode, domain: domain || null, connections: { supabase: supabaseUrl || null, minio: minioUrl || null, validatedAt: now.toISOString() } },
        };
        const tenant = await tx.tenant.update({ where: { id: user.tenantId! }, data: { resellerId, commercialMode: mode, maxInstances: plan.maxInstances, features } });
        const subscription = await tx.subscription.upsert({
            where: { tenantId: tenant.id },
            update: { planId: plan.id, commercialMode: mode, contractedMaxInstances: plan.maxInstances, contractedMaxUsers: plan.maxUsers, contractedMaxInstallations: plan.maxInstallations, termsVersion: plan.updatedAt.toISOString(), status: "TRIALING", currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: periodEnd, canceledAt: null, suspendedAt: null },
            create: { tenantId: tenant.id, planId: plan.id, commercialMode: mode, contractedMaxInstances: plan.maxInstances, contractedMaxUsers: plan.maxUsers, contractedMaxInstallations: plan.maxInstallations, termsVersion: plan.updatedAt.toISOString(), status: "TRIALING", currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: periodEnd },
        });
        return { tenant, subscription, resellerId };
    });

    invalidateQuotaCache(user.tenantId);
    await audit({ tenantId: user.tenantId, actorUserId: user.id, actorLabel: user.email || "usuário", action: "onboarding.completed", resource: "tenant", resourceId: user.tenantId, metadata: { customerType, planCode, supabaseValidated: supabase.reachable, minioValidated: minio.reachable } });
    return NextResponse.json({ status: true, message: "Onboarding concluído", data: { plan: plan.code, customerType, resellerId: result.resellerId, checks: [supabase, minio], stack: { ready: true, domain: domain || null, nextStep: "Gere a stack no painel e use as conexões validadas." } } }, { status: 201 });
    } catch (error) {
        if (error instanceof CommercialRuleError) return NextResponse.json({ status: false, code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
