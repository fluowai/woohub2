import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin } from "@/lib/access";
import bcrypt from "bcryptjs";
import { recordAudit } from "@/lib/audit";
import { isStrongPassword } from "@/lib/security/password";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const directClients = await prisma.tenant.findMany({
            where: { resellerId: null },
            orderBy: { createdAt: "desc" },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                subscriptions: {
                    include: {
                        plan: true,
                    },
                },
                _count: {
                    select: {
                        sessions: true,
                        members: true,
                    },
                },
            },
        });

        const formatted = directClients.map((c) => {
            const ownerMember = c.members.find((m) => m.role === "OWNER" || m.role === "ADMIN") || c.members[0];
            const activeSub = c.subscriptions[0];

            return {
                id: c.id,
                name: c.name,
                slug: c.slug,
                status: c.status,
                maxInstances: c.maxInstances,
                sessionCount: c._count.sessions,
                memberCount: c._count.members,
                ownerName: ownerMember?.user?.name || "Sem responsável",
                ownerEmail: ownerMember?.user?.email || "Sem e-mail",
                planName: activeSub?.plan?.name || "Padrão",
                subscriptionStatus: activeSub?.status || "TRIALING",
                createdAt: c.createdAt,
            };
        });

        return NextResponse.json({ status: true, data: formatted });
    } catch (error) {
        console.error("Error fetching direct clients:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar clientes diretos" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { companyName, ownerEmail, ownerName, password, maxInstances = 1, planId } = body;

        if (!companyName || !ownerEmail) {
            return NextResponse.json({ status: false, message: "Nome da empresa e e-mail são obrigatórios" }, { status: 400 });
        }

        const normalizedEmail = ownerEmail.trim().toLowerCase();

        const result = await prisma.$transaction(async (tx) => {
            let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
            if (!user) {
                if (!isStrongPassword(password)) {
                    throw new Error("Senha com no mínimo 8 caracteres, maiúsculas, minúsculas e números é obrigatória para novo usuário");
                }
                const hashedPassword = await bcrypt.hash(password, 10);
                user = await tx.user.create({
                    data: {
                        name: ownerName || companyName,
                        email: normalizedEmail,
                        password: hashedPassword,
                        role: "OWNER",
                    },
                });
            }

            const baseSlug = companyName
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 30);
            const slug = `${baseSlug || "empresa"}-${Date.now().toString(36).slice(-4)}`;

            const tenant = await tx.tenant.create({
                data: {
                    name: companyName,
                    slug,
                    status: "ACTIVE",
                    resellerId: null, // Direct client of Mega Admin!
                    maxInstances: Number(maxInstances),
                },
            });

            await tx.tenantMember.create({
                data: {
                    tenantId: tenant.id,
                    userId: user.id,
                    role: "OWNER",
                },
            });

            if (planId) {
                const plan = await tx.plan.findUnique({ where: { id: planId } });
                if (plan) {
                    await tx.subscription.create({
                        data: {
                            tenantId: tenant.id,
                            planId: plan.id,
                            status: "ACTIVE",
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        },
                    });
                }
            }

            return { tenant, user };
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "tenant.create_direct",
            resource: "Tenant",
            resourceId: result.tenant.id,
            metadata: { name: result.tenant.name, ownerEmail: normalizedEmail },
        });

        return NextResponse.json({
            status: true,
            message: "Cliente direto criado com sucesso",
            data: result.tenant,
        });
    } catch (error: any) {
        console.error("Error creating direct client:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao criar cliente direto" }, { status: 400 });
    }
}
