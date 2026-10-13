import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const branding = await prisma.branding.findUnique({
            where: { resellerId },
        });

        return NextResponse.json({ status: true, data: branding });
    } catch (error) {
        console.error("Error fetching branding:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar dados da marca" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const body = await request.json();
        const {
            name,
            logoUrl,
            faviconUrl,
            primaryColor = "#ff5a00",
            secondaryColor = "#0f172a",
            accentColor = "#f97316",
            supportEmail,
            supportPhone,
            commercialLinks,
            docBrandName,
            customCss,
        } = body;

        if (!name) {
            return NextResponse.json({ status: false, message: "Nome da marca é obrigatório" }, { status: 400 });
        }

        const branding = await prisma.branding.upsert({
            where: { resellerId },
            update: {
                name,
                logoUrl,
                faviconUrl,
                primaryColor,
                secondaryColor,
                accentColor,
                supportEmail,
                supportPhone,
                commercialLinks,
                docBrandName: docBrandName || name,
                customCss,
            },
            create: {
                resellerId,
                name,
                logoUrl,
                faviconUrl,
                primaryColor,
                secondaryColor,
                accentColor,
                supportEmail,
                supportPhone,
                commercialLinks,
                docBrandName: docBrandName || name,
                customCss,
            },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.branding_update",
            resource: "Branding",
            resourceId: branding.id,
            metadata: { name, primaryColor, resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Configuração de marca salva com sucesso!",
            data: branding,
        });
    } catch (error: any) {
        console.error("Error saving branding:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao salvar marca" }, { status: 400 });
    }
}
