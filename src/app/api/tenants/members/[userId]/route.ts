import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, can } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE: remove a member from the caller's company
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }
    if (!user.tenantId || !can(user, "members:write")) {
        return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
    }

    try {
        const { userId } = await params;

        const member = await prisma.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: user.tenantId, userId } },
        });
        if (!member) {
            return NextResponse.json({ status: false, message: "Member not found", error: "Member not found" }, { status: 404 });
        }

        if (member.role === "OWNER") {
            const owners = await prisma.tenantMember.count({
                where: { tenantId: user.tenantId, role: "OWNER" },
            });
            if (owners <= 1) {
                return NextResponse.json(
                    { status: false, message: "Cannot remove the last owner of the company", error: "Last owner" },
                    { status: 409 }
                );
            }
        }

        await prisma.tenantMember.delete({ where: { id: member.id } });

        await audit({
            tenantId: user.tenantId,
            actorUserId: user.id || null,
            actorLabel: user.email || "member",
            action: "member.remove",
            resource: "tenant_member",
            resourceId: member.id,
            metadata: { userId, role: member.role },
        });

        return NextResponse.json({ status: true, message: "Member removed", data: { id: member.id } });
    } catch (error) {
        console.error("Remove member error:", error);
        return NextResponse.json({ status: false, message: "Failed to remove member", error: "Failed to remove member" }, { status: 500 });
    }
}
