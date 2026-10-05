import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user || !user.tenantId) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const invoices = await prisma.invoice.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { createdAt: "desc" },
            select: { id: true, number: true, amountCents: true, currency: true, status: true, dueAt: true, paidAt: true, externalId: true, description: true, createdAt: true },
        });
        return NextResponse.json({ status: true, message: "Invoices fetched", data: invoices });
    } catch (error) {
        console.error("List invoices error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch invoices", error: "Failed to fetch invoices" }, { status: 500 });
    }
}
