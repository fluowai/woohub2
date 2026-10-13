import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";
import { validateHostname, generateDnsInstructions, verifyDomainDns } from "@/lib/domains";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const domains = await prisma.domain.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                reseller: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        owner: { select: { email: true, name: true } },
                    },
                },
            },
        });

        return NextResponse.json({ status: true, data: domains });
    } catch (error) {
        console.error("Error fetching domains:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar catálogo de domínios" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { hostname: rawHostname, type = "PLATFORM", resellerId, notes } = body;

        const validation = validateHostname(rawHostname);
        if (!validation.valid || !validation.normalized) {
            return NextResponse.json({ status: false, message: validation.error }, { status: 400 });
        }

        const hostname = validation.normalized;

        // Check global uniqueness
        const existing = await prisma.domain.findUnique({ where: { hostname } });
        if (existing) {
            return NextResponse.json({ status: false, message: "Este hostname já está registrado na plataforma" }, { status: 400 });
        }

        if (type === "RESELLER" && resellerId) {
            const reseller = await prisma.reseller.findUnique({ where: { id: resellerId } });
            if (!reseller) {
                return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 400 });
            }
        }

        const { verificationToken, instructions } = generateDnsInstructions(hostname);

        const domain = await prisma.domain.create({
            data: {
                hostname,
                type: type === "PLATFORM" ? "PLATFORM" : "RESELLER",
                resellerId: type === "RESELLER" ? resellerId : null,
                status: "PENDING_VERIFICATION",
                verificationToken,
                verificationMethod: "DNS_TXT",
                certificateStatus: "PENDING",
                dnsInstructions: instructions,
                notes,
                history: [
                    {
                        event: "CREATED",
                        actor: authResult.context.email || "mega_admin",
                        timestamp: new Date().toISOString(),
                    },
                ],
            },
            include: { reseller: true },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "domain.create",
            resource: "Domain",
            resourceId: domain.id,
            metadata: { hostname, type, resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Domínio registrado. Instruções DNS geradas.",
            data: domain,
        });
    } catch (error: any) {
        console.error("Error creating domain:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao registrar domínio" }, { status: 400 });
    }
}
