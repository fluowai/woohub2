import type { NextRequest } from "next/server";
import { getQuotaSnapshot } from "@/lib/quota";
import { requireUser, v1Ok, v1ErrorResponse } from "@/lib/v1/http";

export const dynamic = "force-dynamic";

/**
 * Uso e limites da empresa autenticada.
 * Modo `pilot` (sem assinatura) devolve `limits: null` — piloto, sem cotas.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const snapshot = await getQuotaSnapshot(user.tenantId);

        return v1Ok({
            mode: snapshot.mode,
            plan: { code: snapshot.planCode, name: snapshot.planName },
            subscription_status: snapshot.subscriptionStatus,
            period_key: snapshot.periodKey,
            limits: snapshot.limits,
            usage: snapshot.usage,
        });
    } catch (error) {
        return v1ErrorResponse(error);
    }
}
