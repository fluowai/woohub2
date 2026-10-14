import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { requeueDeadJobs } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const requeueSchema = z.object({
    status: z.enum(["DEAD", "FAILED"]).default("DEAD"),
    ids: z.array(z.string().min(1)).max(500).optional(),
    limit: z.number().int().min(1).max(500).default(100),
});

/**
 * Reprocess DLQ / failed jobs (admin only, audited).
 * POST /api/jobs/requeue  { status?: "DEAD"|"FAILED", ids?: string[], limit?: number }
 */
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = requeueSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid payload", error: parsed.error.flatten() }, { status: 400 });
        }

        const requeued = await requeueDeadJobs(parsed.data);

        await audit({
            actorUserId: user.id || null,
            actorLabel: user.email || "admin",
            action: "jobs.requeue",
            resource: "message_job",
            metadata: {
                status: parsed.data.status,
                ids: parsed.data.ids?.length ?? null,
                limit: parsed.data.limit,
                requeued,
            },
        });

        return NextResponse.json({
            status: true,
            message: `${requeued} job(s) requeued`,
            data: { requeued },
        });
    } catch (error) {
        console.error("Requeue jobs error:", error);
        return NextResponse.json({ status: false, message: "Failed to requeue jobs", error: "Failed to requeue jobs" }, { status: 500 });
    }
}
