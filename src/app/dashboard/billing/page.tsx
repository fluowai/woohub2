"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, CreditCard, Gauge, Layers, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

interface PlanRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    period: "MONTHLY" | "YEARLY" | "ONE_TIME";
    maxInstances: number;
    maxUsers: number;
    requestLimit: number;
    sendLimit: number;
    storageLimitMb: number;
    retentionDays: number;
    status: string;
    sort: number;
}

interface UsageSnapshot {
    mode: "pilot" | "active" | "suspended";
    planCode: string | null;
    planName: string | null;
    subscriptionStatus: string | null;
    periodKey: string | null;
    limits: {
        maxInstances: number;
        maxUsers: number;
        requestLimit: number;
        sendLimit: number;
        storageLimitMb: number;
        retentionDays: number;
    } | null;
    usage: { requests: number; messagesSent: number };
}

interface SubscriptionRow {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    plan: PlanRow;
}

const STATUS_LABELS: Record<string, string> = {
    TRIALING: "Período de teste",
    ACTIVE: "Ativa",
    PAST_DUE: "Em atraso",
    SUSPENDED: "Suspensa",
    CANCELED: "Cancelada",
    EXPIRED: "Expirada",
};

const PERIOD_LABELS: Record<string, string> = {
    MONTHLY: "por mês",
    YEARLY: "por ano",
    ONE_TIME: "pagamento único",
};

const MODE_LABELS: Record<string, string> = {
    pilot: "Modo piloto (sem limites)",
    active: "Plano ativo",
    suspended: "Plano suspenso",
};

function formatMoney(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
    }
}

function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function percent(used: number, limit: number): number {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

export default function BillingPage() {
    const [plans, setPlans] = useState<PlanRow[]>([]);
    const [usage, setUsage] = useState<UsageSnapshot | null>(null);
    const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const [plansRes, usageRes, subsRes] = await Promise.all([
                fetch("/api/plans"),
                fetch("/api/tenants/usage"),
                fetch("/api/subscriptions"),
            ]);

            const plansData = await plansRes.json();
            if (plansRes.ok && plansData.status) setPlans(plansData.data);
            else toast.error(plansData.message || "Não foi possível carregar os planos");

            const usageData = await usageRes.json();
            if (usageRes.ok && usageData.status) setUsage(usageData.data);
            else toast.error(usageData.message || "Não foi possível carregar o consumo");

            const subsData = await subsRes.json();
            if (subsRes.ok && subsData.status && Array.isArray(subsData.data) && subsData.data.length > 0) {
                setSubscription(subsData.data[0]);
            }
        } catch {
            toast.error("Erro de conexão ao carregar faturamento");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const activePlan = usage?.limits ? usage.planCode : null;
    const metrics = usage?.limits
        ? [
            {
                label: "Requisições na API",
                used: usage.usage.requests,
                limit: usage.limits.requestLimit,
                icon: Gauge,
            },
            {
                label: "Mensagens enviadas",
                used: usage.usage.messagesSent,
                limit: usage.limits.sendLimit,
                icon: Layers,
            },
        ]
        : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Planos e assinatura</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Acompanhe o plano da sua empresa, o consumo do período e as opções disponíveis.
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
                </Button>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CreditCard className="h-4 w-4 text-primary" /> Situação atual
                    </CardTitle>
                    <CardDescription>
                        {usage ? MODE_LABELS[usage.mode] || usage.mode : "Consultando…"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={subscription ? "default" : "secondary"}>
                            {subscription ? subscription.plan.name : usage?.planName || "Sem assinatura"}
                        </Badge>
                        {subscription && (
                            <Badge variant="outline">{STATUS_LABELS[subscription.status] || subscription.status}</Badge>
                        )}
                        {subscription && (
                            <span className="text-xs text-muted-foreground">
                                Período atual até {formatDate(subscription.currentPeriodEnd)}
                                {subscription.trialEndsAt && ` · teste até ${formatDate(subscription.trialEndsAt)}`}
                            </span>
                        )}
                    </div>

                    {usage?.limits ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                            {metrics.map((m) => {
                                const Icon = m.icon;
                                return (
                                    <div key={m.label} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2 font-medium">
                                                <Icon className="h-4 w-4 text-muted-foreground" /> {m.label}
                                            </span>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {m.used.toLocaleString("pt-BR")} / {m.limit.toLocaleString("pt-BR")}
                                            </span>
                                        </div>
                                        <Progress value={percent(m.used, m.limit)} className="h-2" />
                                        <p className="text-[11px] text-muted-foreground">
                                            {percent(m.used, m.limit)}% do limite do período
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/30 p-4 text-sm">
                            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <p className="text-muted-foreground">
                                Sua empresa está no modo piloto: nenhuma cobrança ou limite está ativo. Quando um plano for
                                ativado, os limites passam a valer imediatamente.
                            </p>
                        </div>
                    )}

                    {usage?.limits && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div className="rounded-xl border border-border/50 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Instâncias</p>
                                <p className="font-bold text-foreground">{usage.limits.maxInstances}</p>
                            </div>
                            <div className="rounded-xl border border-border/50 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Usuários</p>
                                <p className="font-bold text-foreground">{usage.limits.maxUsers}</p>
                            </div>
                            <div className="rounded-xl border border-border/50 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Armazenamento</p>
                                <p className="font-bold text-foreground">{usage.limits.storageLimitMb} MB</p>
                            </div>
                            <div className="rounded-xl border border-border/50 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Retenção</p>
                                <p className="font-bold text-foreground">{usage.limits.retentionDays} dias</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Planos disponíveis</h3>
                {loading ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Carregando planos…</p>
                ) : plans.length === 0 ? (
                    <Card className="border-dashed border-2 border-slate-200 shadow-none">
                        <CardContent className="py-10 text-center">
                            <p className="text-sm font-medium text-slate-600 mb-1">Nenhum plano publicado</p>
                            <p className="text-xs text-slate-400">
                                O administrador da plataforma ainda não cadastrou planos no catálogo.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {plans.map((plan) => {
                            const isCurrent = activePlan === plan.code;
                            return (
                                <Card
                                    key={plan.id}
                                    className={`glass-panel shadow-sm flex flex-col transition-all duration-300 ${
                                        isCurrent
                                            ? "border-primary shadow-md shadow-primary/10"
                                            : "border-border/50 hover:shadow-md"
                                    }`}
                                >
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                                            {isCurrent && <Badge>Plano atual</Badge>}
                                        </div>
                                        <CardDescription className="min-h-[2.5rem]">
                                            {plan.description || "Plano da plataforma Woohub."}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-1 space-y-4">
                                        <div>
                                            <span className="text-3xl font-extrabold text-foreground">
                                                {formatMoney(plan.priceCents, plan.currency)}
                                            </span>
                                            <span className="text-sm text-muted-foreground">
                                                {" "}{PERIOD_LABELS[plan.period] || ""}
                                            </span>
                                        </div>

                                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                {plan.maxInstances} instância{plan.maxInstances > 1 ? "s" : ""}
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                {plan.maxUsers} usuário{plan.maxUsers > 1 ? "s" : ""}
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                {plan.requestLimit.toLocaleString("pt-BR")} requisições/{plan.period === "YEARLY" ? "ano" : "mês"}
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                {plan.sendLimit.toLocaleString("pt-BR")} mensagens/{plan.period === "YEARLY" ? "ano" : "mês"}
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                {plan.storageLimitMb} MB de mídia
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                                Retenção de {plan.retentionDays} dias
                                            </li>
                                        </ul>

                                        <div className="pt-2 mt-auto">
                                            <Button
                                                variant={isCurrent ? "secondary" : "outline"}
                                                className="w-full"
                                                disabled={isCurrent}
                                                onClick={() =>
                                                    toast.info(
                                                        "A ativação de plano é feita pelo administrador da plataforma nesta fase. Fale com o suporte para contratar."
                                                    )
                                                }
                                            >
                                                {isCurrent ? "Em uso" : "Solicitar plano"}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Como funciona a cobrança</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        Esta plataforma ainda não possui um gateway de pagamento integrado. A ativação de planos é
                        manual e auditada: o administrador atribui o plano à empresa e os limites passam a valer na hora.
                    </p>
                    <p>
                        Enquanto isso, empresas sem assinatura permanecem no modo piloto, com todos os recursos
                        liberados para avaliação.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
