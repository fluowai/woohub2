import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Health/readiness da aplicação (público por definição — não expõe dados).
 *
 * 200 → processo vivo E banco acessível (ready para receber tráfego).
 * 503 → banco inacessível (o orquestrador deve parar de rotear tráfego).
 */
export async function GET() {
    const headers = { "Cache-Control": "no-store" };
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json(
            {
                status: "ok",
                database: "up",
                uptime_seconds: Math.round(process.uptime()),
                timestamp: new Date().toISOString(),
            },
            { status: 200, headers }
        );
    } catch {
        return NextResponse.json(
            { status: "degraded", database: "down", timestamp: new Date().toISOString() },
            { status: 503, headers }
        );
    }
}
