import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isMegaAdmin, isReseller } from "@/lib/access";
import bcrypt from "bcryptjs";
import { allocateInstancesToTenant } from "@/lib/quotas/commercial";
import { recordAudit } from "@/lib/audit";
import { isStrongPassword } from "@/lib/security/password";

export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    const supportResellerId = request.nextUrl.searchParams.get("supportResellerId");
    const supportMode = Boolean(supportResellerId && authResult.ok && isMegaAdmin(authResult.context));
    if (!authResult.ok || (!authResult.context.resellerId && !supportMode) || (!isReseller(authResult.context) && !supportMode)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = supportMode ? supportResellerId! : authResult.context.resellerId!;

    try {
        const clients = await prisma.tenant.findMany({
            where: { resellerId },
            orderBy: { createdAt: "desc" },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                subscriptions: {
                    include: { plan: true },
                },
                _count: {
                    select: { sessions: true, members: true },
                },
            },
        });

        const formatted = clients.map((c) => {
            const owner = c.members.find((m) => m.role === "OWNER" || m.role === "ADMIN") || c.members[0];
            const sub = c.subscriptions[0];

            return {
                id: c.id,
                name: c.name,
                slug: c.slug,
                status: c.status,
                maxInstances: c.maxInstances,
                sessionsCount: c._count.sessions,
                membersCount: c._count.members,
                ownerName: owner?.user?.name || "Sem nome",
                ownerEmail: owner?.user?.email || "Sem e-mail",
                planName: sub?.plan?.name || "Plano Revenda",
                subscriptionStatus: sub?.status || "ACTIVE",
                createdAt: c.createdAt,
            };
        });

        return NextResponse.json({ status: true, data: formatted });
    } catch (error) {
        console.error("Error fetching reseller clients:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar clientes da revenda" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    const supportResellerId = request.nextUrl.searchParams.get("supportResellerId");
    const supportMode = Boolean(supportResellerId && authResult.ok && isMegaAdmin(authResult.context));
    if (!authResult.ok || (!authResult.context.resellerId && !supportMode) || (!isReseller(authResult.context) && !supportMode)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Super Admin" }, { status: 403 });
    }

    const resellerId = supportMode ? supportResellerId! : authResult.context.resellerId!;

    try {
        const body = await request.json();
        const { companyName, ownerEmail, ownerName, password, maxInstances = 1, planId } = body;

        if (!companyName || !ownerEmail) {
            return NextResponse.json({ status: false, message: "Nome da empresa e e-mail são obrigatórios" }, { status: 400 });
        }

        const normalizedEmail = ownerEmail.trim().toLowerCase();
        const requestedInstances = Number(maxInstances);

        // Transactional creation + quota check
        const result = await prisma.$transaction(async (tx) => {
            // Check reseller status and capacity
            const reseller = await tx.reseller.findUnique({
                where: { id: resellerId },
                include: {
                    tenants: { select: { id: true, maxInstances: true } },
                },
            });

            if (!reseller) {
                throw new Error("Revendedor não encontrado");
            }

            if (reseller.status !== "ACTIVE") {
                throw new Error("Sua operação de revenda está suspensa. Não é possível cadastrar novos clientes.");
            }

            const currentAllocated = reseller.tenants.reduce((sum, t) => sum + (t.maxInstances || 0), 0);
            if (currentAllocated + requestedInstances > reseller.maxInstances) {
                const available = Math.max(0, reseller.maxInstances - currentAllocated);
                throw new Error(
                    `Saldo de instâncias insuficiente. Disponível para revenda: ${available}, solicitado: ${requestedInstances}. Contrate mais capacidade com o Mega Admin.`
                );
            }

            let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
            if (!user) {
                if (!isStrongPassword(password)) {
                    throw new Error("Senha com no mínimo 8 caracteres, maiúsculas, minúsculas e números é obrigatória para o novo cliente");
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
            const slug = `${baseSlug || "cliente"}-${Date.now().toString(36).slice(-4)}`;

            const tenant = await tx.tenant.create({
                data: {
                    name: companyName,
                    slug,
                    status: "ACTIVE",
                    resellerId, // Strictly scoped to this Super Admin!
                    maxInstances: requestedInstances,
                    features: reseller.features ? (reseller.features as any) : undefined,
                },
            });

            await tx.tenantMember.create({
                data: {
                    tenantId: tenant.id,
                    userId: user.id,
                    role: "ADMIN",
                },
            });

            // Create InstanceAllocation record
            await tx.instanceAllocation.create({
                data: {
                    resellerId,
                    tenantId: tenant.id,
                    allocated: requestedInstances,
                },
            });

            if (planId) {
                const plan = await tx.plan.findFirst({
                    where: { id: planId, resellerId },
                });
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
            actorLabel: authResult.context.email || "super_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.client_create",
            resource: "Tenant",
            resourceId: result.tenant.id,
            metadata: {
                companyName,
                ownerEmail: normalizedEmail,
                maxInstances: requestedInstances,
                resellerId,
                mode: supportMode ? "support_panel" : "reseller_panel",
            },
        });

        return NextResponse.json({
            status: true,
            message: "Cliente cadastrado com sucesso na sua operação de revenda!",
            data: result.tenant,
        });
    } catch (error: any) {
        console.error("Error creating reseller client:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao cadastrar cliente" }, { status: 400 });
    }
}
