import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isReseller } from "@/lib/access";
import { validateHostname, generateDnsInstructions } from "@/lib/domains";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const [domain, reseller] = await Promise.all([
            prisma.domain.findFirst({
                where: { resellerId },
                orderBy: { createdAt: "desc" },
            }),
            prisma.reseller.findUnique({
                where: { id: resellerId },
                select: { customDomainAllowed: true },
            }),
        ]);

        return NextResponse.json({
            status: true,
            data: {
                domain,
                customDomainAllowed: reseller?.customDomainAllowed ?? false,
            },
        });
    } catch (error) {
        console.error("Error fetching domain:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar domínio da revenda" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !authResult.context.resellerId || !isReseller(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = authResult.context.resellerId;

    try {
        const reseller = await prisma.reseller.findUnique({
            where: { id: resellerId },
            select: { customDomainAllowed: true, status: true },
        });

        if (!reseller) {
            return NextResponse.json({ status: false, message: "Revendedor não encontrado" }, { status: 404 });
        }

        if (!reseller.customDomainAllowed) {
            return NextResponse.json(
                { status: false, message: "Seu plano de revenda não possui permissão para domínio próprio. Solicite a liberação ao Mega Admin." },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { hostname: rawHostname } = body;

        const validation = validateHostname(rawHostname);
        if (!validation.valid || !validation.normalized) {
            return NextResponse.json({ status: false, message: validation.error }, { status: 400 });
        }

        const hostname = validation.normalized;

        // Check if hostname is already taken globally
        const existing = await prisma.domain.findUnique({ where: { hostname } });
        if (existing && existing.resellerId !== resellerId) {
            return NextResponse.json({ status: false, message: "Este hostname já está registrado por outro usuário" }, { status: 400 });
        }

        const { verificationToken, instructions } = generateDnsInstructions(hostname);

        const domain = await prisma.domain.upsert({
            where: { hostname },
            update: {
                status: "PENDING_VERIFICATION",
                verificationToken,
                dnsInstructions: instructions,
                certificateStatus: "PENDING",
                history: [
                    ...((existing?.history as any[]) || []),
                    { event: "RECONFIGURED", timestamp: new Date().toISOString() },
                ],
            },
            create: {
                hostname,
                type: "RESELLER",
                resellerId,
                status: "PENDING_VERIFICATION",
                verificationToken,
                verificationMethod: "DNS_TXT",
                certificateStatus: "PENDING",
                dnsInstructions: instructions,
                history: [{ event: "CREATED_BY_SUPER_ADMIN", timestamp: new Date().toISOString() }],
            },
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.domain_request",
            resource: "Domain",
            resourceId: domain.id,
            metadata: { hostname, resellerId },
        });

        return NextResponse.json({
            status: true,
            message: "Domínio cadastrado! Siga as instruções DNS para comprovar a propriedade.",
            data: domain,
        });
    } catch (error: any) {
        console.error("Error configuring domain:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao configurar domínio" }, { status: 400 });
    }
}
