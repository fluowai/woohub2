import { prisma } from "./prisma";
import type { CommercialMode, Prisma } from "@prisma/client";

export class CommercialRuleError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
    this.name = "CommercialRuleError";
  }
}

export function modeForPlan(mode: CommercialMode, resellerId: string | null): CommercialMode {
  if (resellerId && mode === "DIRECT") return "RESELLER";
  return mode;
}

export function assertPlanForMode(input: {
  plan: { commercialMode: CommercialMode; resellerId: string | null; status: string };
  mode: CommercialMode;
  resellerId: string | null;
}): void {
  if (input.plan.status !== "ACTIVE") {
    throw new CommercialRuleError("plan_unavailable", "Este plano não aceita novas contratações.");
  }
  if (input.plan.commercialMode !== input.mode) {
    throw new CommercialRuleError("plan_mode_mismatch", "O plano não é compatível com a modalidade comercial.");
  }
  if (input.plan.resellerId !== null && input.plan.resellerId !== input.resellerId) {
    throw new CommercialRuleError("plan_reseller_mismatch", "O plano pertence a outra revenda.");
  }
  if (input.mode !== "RESELLER" && input.plan.resellerId !== null) {
    throw new CommercialRuleError("plan_reseller_mismatch", "Este plano é exclusivo de uma revenda.");
  }
}

export async function assertSubscriptionForCapacity(tenantId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  const subscription = await db.subscription.findUnique({
    where: { tenantId },
    select: { status: true, currentPeriodEnd: true, graceEndsAt: true },
  });
  if (!subscription) {
    throw new CommercialRuleError("subscription_required", "A empresa precisa de uma assinatura ou concessão administrativa ativa.", 403);
  }
  const now = Date.now();
  const allowed = subscription.status === "TRIALING" || subscription.status === "ACTIVE" ||
    (subscription.status === "PAST_DUE" && Boolean(subscription.graceEndsAt && subscription.graceEndsAt.getTime() > now)) ||
    (subscription.status === "CANCELED" && subscription.currentPeriodEnd.getTime() > now);
  if (!allowed) throw new CommercialRuleError("subscription_inactive", "A assinatura não está ativa para novas instâncias.", 403);
}

/** Serializes capacity checks per tenant/reseller/installation in PostgreSQL. */
export async function createSessionWithCapacity<T>(input: {
  tenantId: string;
  resellerId?: string | null;
  installationId?: string | null;
  create: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const keys = [input.resellerId && `reseller:${input.resellerId}`, input.installationId && `installation:${input.installationId}`, `tenant:${input.tenantId}`].filter(Boolean) as string[];
    for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    await assertSubscriptionForCapacity(input.tenantId, tx);
    const count = await tx.session.count({ where: { tenantId: input.tenantId } });
    const subscription = await tx.subscription.findUnique({ where: { tenantId: input.tenantId }, include: { plan: true } });
    const max = subscription?.contractedMaxInstances ?? subscription?.plan.maxInstances ?? 0;
    if (max <= 0 || count >= max) throw new CommercialRuleError("quota_exceeded", `O limite de ${max} instância(s) foi atingido.`);
    return input.create(tx);
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
