import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getQuotaSnapshot } from "@/lib/quota";

export const dynamic = "force-dynamic";

/**
 * Usage/quota of the caller's company: plan, limits and counters for the current period.
 *
 * "requests" only counts the public API (/api/v1); dashboard traffic is not billed.
 * A company without an active subscription is reported as pilot mode (no limits).
 */
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId) {
        return NextResponse.json({ status: false, message: "No company associated with this user", error: "No company" }, { status: 400 });
    }

    try {
        const snapshot = await getQuotaSnapshot(user.tenantId);
        return NextResponse.json({ status: true, message: "Usage fetched", data: snapshot });
    } catch (error) {
        console.error("Usage error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch usage", error: "Failed to fetch usage" }, { status: 500 });
    }
}
