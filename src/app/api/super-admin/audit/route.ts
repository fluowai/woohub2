import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const logs = await prisma.auditLog.findMany({
            where: { resellerId },
            orderBy: { createdAt: "desc" },
            take: 100,
        });

        return NextResponse.json({ status: true, data: logs });
    } catch (error) {
        console.error("Error fetching reseller audit logs:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar logs de auditoria" }, { status: 500 });
    }
}
