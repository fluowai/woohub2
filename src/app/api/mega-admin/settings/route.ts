import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });

        return NextResponse.json({
            status: true,
            message: "Settings fetched successfully",
            data: systemConfig,
        });
    } catch (error) {
        console.error("Fetch settings error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch settings", error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    if (!user || !isMegaAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { appName, logoUrl, faviconUrl, timezone, enableRegistration, telemetryEnabled, telemetryUrl } = body;

        const systemConfig = await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: {
                appName,
                logoUrl,
                faviconUrl,
                timezone,
                enableRegistration,
                telemetryEnabled,
                telemetryUrl,
            },
            create: {
                id: "default",
                appName: appName || "Woohub",
                logoUrl,
                faviconUrl,
                timezone: timezone || "America/Sao_Paulo",
                enableRegistration: enableRegistration ?? true,
                telemetryEnabled: telemetryEnabled ?? false,
                telemetryUrl,
            },
        });

        return NextResponse.json({ status: true, message: "Settings updated successfully", data: systemConfig });
    } catch (error) {
        console.error("Update settings error:", error);
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}