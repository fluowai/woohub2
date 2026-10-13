import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

// GET: Get QR code for session
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        const liveQr = instance?.qr ?? null;
        const isConnected = instance?.status === "CONNECTED" || !!instance?.socket?.user;

        if (isConnected) {
            return NextResponse.json({
                error: "Already connected",
                connected: true,
                status: instance?.status
            }, { status: 400 });
        }

        // Preferred source: the QR held by the running instance (rotated every ~20s).
        if (liveQr) {
            const base64QR = await QRCode.toDataURL(liveQr);
            return NextResponse.json({
                success: true,
                qr: liveQr,
                base64: base64QR,
                live: true,
                status: instance?.status,
                generatedAt: instance?.qrGeneratedAt ?? null
            });
        }

        // Fallback: the QR persisted by the last connection.update. Useful when the
        // instance was evicted from memory (restart/reload) but the code is still valid.
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { qr: true, status: true }
        });

        if (session?.qr && session.status === "SCAN_QR") {
            const base64QR = await QRCode.toDataURL(session.qr);
            return NextResponse.json({
                success: true,
                qr: session.qr,
                base64: base64QR,
                live: false,
                status: session.status
            });
        }

        return NextResponse.json({
            error: "QR code not available. Session may be connecting...",
            qr: null,
            status: session?.status ?? "UNKNOWN",
            running: !!instance
        }, { status: 404 });

    } catch (error) {
        console.error("Get QR error:", error);
        return NextResponse.json({ status: false, message: "Failed to get QR code", error: "Failed to get QR code" }, { status: 500 });
    }
}
