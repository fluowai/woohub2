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
        const resellers = await prisma.reseller.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                owner: { select: { id: true, name: true, email: true, createdAt: true } },
                branding: true,
                domains: true,
                tenants: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        maxInstances: true,
                        _count: { select: { sessions: true } },
                    },
                },
                _count: { select: { tenants: true, plans: true } },
            },
        });

        const formatted = resellers.map((r) => {
            const allocatedInstances = r.tenants.reduce((sum, t) => sum + (t.maxInstances || 0), 0);
            const totalSessions = r.tenants.reduce((sum, t) => sum + t._count.sessions, 0);

            return {
                id: r.id,
                name: r.name,
                slug: r.slug,
                status: r.status,
                ownerId: r.ownerId,
                owner: r.owner,
                branding: r.branding,
                domains: r.domains,
                contractedInstances: r.maxInstances,
                allocatedInstances,
                availableInstances: Math.max(0, r.maxInstances - allocatedInstances),
                totalSessions,
                maxTenants: r.maxTenants,
                currentTenants: r._count.tenants,
                maxUsers: r.maxUsers,
                features: r.features,
                storageLimitMb: r.storageLimitMb,
                retentionDays: r.retentionDays,
                customDomainAllowed: r.customDomainAllowed,
                notes: r.notes,
                createdAt: r.createdAt,
            };
        });

        return NextResponse.json({ status: true, data: formatted });
    } catch (error) {
        console.error("Error fetching resellers:", error);
        return NextResponse.json({ status: false, message: "Erro ao buscar revendedores" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok || !isMegaAdmin(authResult.context)) {
        return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const {
            name,
            ownerEmail,
            ownerName,
            password,
            maxInstances = 30,
            maxTenants = 20,
            maxUsers = 50,
            planId,
            features = { chat: true, broadcast: true, webhooks: true, bot: true, scheduler: true, customDomain: true },
            customDomainAllowed = true,
            storageLimitMb = 1024,
            retentionDays = 30,
            notes,
        } = body;

        if (!name || !ownerEmail) {
            return NextResponse.json({ status: false, message: "Nome e e-mail do responsável são obrigatórios" }, { status: 400 });
        }

        const selectedPlan = await prisma.plan.findFirst({ where: planId ? { id: String(planId), status: "ACTIVE", resellerId: null } : { status: "ACTIVE", resellerId: null }, orderBy: { sort: "asc" } });
        if (!selectedPlan) return NextResponse.json({ status: false, message: "Selecione um plano ativo disponível para revenda" }, { status: 400 });

        const normalizedEmail = ownerEmail.trim().toLowerCase();

        const result = await prisma.$transaction(async (tx) => {
            let user = await tx.user.findUnique({ where: { email: normalizedEmail } });

            if (user) {
                if (user.role === "MEGA_ADMIN") {
                    throw new Error("Não é possível associar o Mega Admin como revendedor.");
                }
                user = await tx.user.update({
                    where: { id: user.id },
                    data: { role: "SUPER_ADMIN", name: ownerName || user.name },
                });
            } else {
                if (!isStrongPassword(password)) {
                    throw new Error("Senha com no mínimo 8 caracteres, maiúsculas, minúsculas e números é obrigatória para novo usuário");
                }
                const hashedPassword = await bcrypt.hash(password, 10);
                user = await tx.user.create({
                    data: {
                        name: ownerName || name,
                        email: normalizedEmail,
                        password: hashedPassword,
                        role: "SUPER_ADMIN",
                    },
                });
            }

            const baseSlug = name
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 30);
            const slug = `${baseSlug || "revenda"}-${user.id.slice(-4)}`;

            const reseller = await tx.reseller.create({
                data: {
                    name,
                    slug,
                    ownerId: user.id,
                    status: "ACTIVE",
                    maxInstances: Number(maxInstances),
                    maxTenants: Number(maxTenants),
                    maxUsers: Number(maxUsers),
                    features,
                    customDomainAllowed: Boolean(customDomainAllowed),
                    storageLimitMb: Number(storageLimitMb),
                    retentionDays: Number(retentionDays),
                    notes,
                    branding: {
                        create: {
                            name,
                            primaryColor: "#ff5a00",
                            secondaryColor: "#0f172a",
                            accentColor: "#f97316",
                            supportEmail: normalizedEmail,
                            docBrandName: name,
                        },
                    },
                },
                include: { branding: true },
            });

            const periodStart = new Date();
            const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
            await tx.subscription.create({
                data: {
                    resellerId: reseller.id,
                    planId: selectedPlan.id,
                    status: "TRIALING",
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    trialEndsAt: periodEnd,
                },
            });

            return { reseller, user };
        });

        await recordAudit({
            actorType: "USER",
            actorLabel: authResult.context.email || "mega_admin",
            actorUserId: authResult.context.userId || undefined,
            action: "reseller.create",
            resource: "Reseller",
            resourceId: result.reseller.id,
            metadata: { name: result.reseller.name, ownerEmail: normalizedEmail, planId: selectedPlan.id, planCode: selectedPlan.code },
        });

        return NextResponse.json({
            status: true,
            message: "Revendedor white label criado com sucesso!",
            data: result.reseller,
        });
    } catch (error: any) {
        console.error("Error creating reseller:", error);
        return NextResponse.json({ status: false, message: error.message || "Erro ao criar revendedor" }, { status: 400 });
    }
}
