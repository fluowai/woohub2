import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, samePhone } from "@/lib/phone";
import { safeErrorMessage } from "@/lib/safe-error";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, action: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const resolvedParams = await params;
        const sessionId = resolvedParams.sessionId;
        const action = resolvedParams.action;

        // Verify access
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        // Validate Action
        const validActions = ["start", "stop", "restart", "logout", "pair", "qr"];
        if (!validActions.includes(action)) {
            return NextResponse.json({ status: false, message: "Invalid action", error: "Invalid action" }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));

        const sessionRow = await prisma.session.findUnique({
            where: { sessionId },
            select: { linkedPhone: true }
        });
        if (!sessionRow) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        const registeredPhone = normalizePhone(sessionRow.linkedPhone) || null;
        const requestedPhone = normalizePhone(body.phone || body.phoneNumber || null);

        if (requestedPhone && registeredPhone && !samePhone(registeredPhone, requestedPhone)) {
            return NextResponse.json({
                status: false,
                code: "NUMBER_MISMATCH",
                message: `O numero ${requestedPhone} difere do numero registrado desta instancia (${registeredPhone}). Entre em contato com o suporte.`,
                error: "NUMBER_MISMATCH",
                data: { linkedPhone: registeredPhone, requestedPhone }
            }, { status: 409 });
        }

        const registersPhone = !registeredPhone && requestedPhone &&
            (action === "start" || action === "restart" || action === "qr" || action === "pair");
        if (registersPhone) {
            await prisma.session.update({
                where: { sessionId },
                data: { linkedPhone: requestedPhone, mismatchPhone: null }
            }).catch((err) => logger.warn("Session", `Failed to persist linked phone for ${sessionId}:`, err));
            const inst = waManager.getInstance(sessionId);
            if (inst) inst.linkedPhone = requestedPhone;
        }

        switch (action) {
            case "pair":
                const { phoneNumber } = body;
                if (!phoneNumber) {
                    return NextResponse.json({ status: false, message: "Phone number required for pairing" }, { status: 400 });
                }
                const pairingCode = await waManager.requestPairingCode(sessionId, phoneNumber);
                return NextResponse.json({ status: true, message: "Pairing code generated", data: { pairingCode } });

            case "start":
                await waManager.startSession(sessionId);
                break;
            case "stop":
                await waManager.stopSession(sessionId);
                break;
            case "restart":
            case "qr":
                // "qr" is the explicit "generate a brand new QR" action: it tears the
                // connection down and opens a fresh one, so a stale/expired code can
                // always be replaced.
                await waManager.restartSession(sessionId);
                break;
            case "logout":
                // Retrieve instance to logout properly
                const instance = waManager.getInstance(sessionId);
                if (instance?.socket) {
                    await instance.socket.logout();
                } else {
                    // Fallback DB update if instance not running
                    await prisma.session.update({
                        where: { sessionId },
                        data: { status: "LOGGED_OUT", qr: null }
                    });
                }
                break;
        }

        const messages: Record<string, string> = {
            start: "Session started successfully",
            stop: "Session stopped successfully",
            restart: "Session restarted successfully",
            qr: "Generating a new QR code",
            logout: "Session disconnected successfully",
        };
        return NextResponse.json({ status: true, message: messages[action] || `Session ${action}ed successfully` });

    } catch (error) {
        const err = error as { code?: string; message?: string };
        if (err?.code === "NUMBER_MISMATCH") {
            return NextResponse.json({
                status: false,
                code: "NUMBER_MISMATCH",
                message: err.message,
                error: "NUMBER_MISMATCH"
            }, { status: 409 });
        }
        console.error("Session action error:", error);
        return NextResponse.json({ error: `Failed to ${safeErrorMessage(error, "perform action")}` }, { status: 500 });
    }
}
