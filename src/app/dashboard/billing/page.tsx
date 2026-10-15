"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, CreditCard, Gauge, Layers, RefreshCw, Info, Copy, QrCode, X, Smartphone } from "lucide-react";
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
    usage: { requests: number; messagesSent: number; instancesUsed: number };
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

interface PixCheckout {
    orderId: string;
    planName: string;
    qrImage: string | null;
    copyPaste: string | null;
}

export default function BillingPage() {
    const [plans, setPlans] = useState<PlanRow[]>([]);
    const [usage, setUsage] = useState<UsageSnapshot | null>(null);
    const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [subscribing, setSubscribing] = useState<string | null>(null);
    const [pix, setPix] = useState<PixCheckout | null>(null);

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

    const handleSubscribe = async (plan: PlanRow) => {
        setSubscribing(plan.id);
        try {
            const res = await fetch("/api/payments/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id }),
            });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.status) {
                toast.error(json?.message || "Não foi possível iniciar o pagamento.");
                return;
            }

            const data = json.data as {
                gateway: string;
                checkoutUrl?: string;
                raw?: { qrcode?: string | null; copy_paste?: string | null; order_id?: string | number | null };
            };

            if (data.gateway === "asgardpay") {
                const orderId = String(data.raw?.order_id ?? "");
                setPix({
                    orderId,
                    planName: plan.name,
                    qrImage: data.raw?.qrcode || null,
                    copyPaste: data.raw?.copy_paste || null,
                });
                return;
            }

            // Mercado Pago: redireciona para o checkout hospedado.
            if (data.checkoutUrl) window.location.href = data.checkoutUrl;
            else toast.error("Gateway não retornou a URL de pagamento.");
        } catch {
            toast.error("Erro de conexão ao iniciar o pagamento.");
        } finally {
            setSubscribing(null);
        }
    };

    // Polling do pedido PIX aberto (UX) — a confirmação real vem do webhook.
    useEffect(() => {
        if (!pix?.orderId) return;
        let cancelled = false;
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(pix.orderId)}`);
                const json = await res.json().catch(() => null);
                if (cancelled || !json?.status) return;
                if (json.data?.paid) {
                    cancelled = true;
                    clearInterval(timer);
                    setPix(null);
                    toast.success("Pagamento confirmado! Ativando seu plano…");
                    setLoading(true);
                    load();
                }
            } catch {
                /* proxima tentativa */
            }
        }, 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [pix?.orderId, load]);

    const activePlan = usage?.limits ? usage.planCode : null;
    const metrics = usage?.limits
        ? [
            {
                label: "Instâncias",
                used: usage.usage.instancesUsed ?? 0,
                limit: usage.limits.maxInstances,
                icon: Smartphone,
            },
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
                                        <div className="flex items-center justify-between gap-2">
                                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                                            <div className="flex items-center gap-1.5">
                                                {plan.period === "YEARLY" && (
                                                    <Badge
                                                        variant="outline"
                                                        className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold"
                                                    >
                                                        −10% anual
                                                    </Badge>
                                                )}
                                                {isCurrent && <Badge>Plano atual</Badge>}
                                            </div>
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
                                                disabled={isCurrent || subscribing === plan.id}
                                                onClick={() => handleSubscribe(plan)}
                                            >
                                                {subscribing === plan.id ? (
                                                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                                ) : (
                                                    <CreditCard className="h-4 w-4 mr-2" />
                                                )}
                                                {isCurrent ? "Em uso" : plan.priceCents > 0 ? "Assinar com PIX" : "Solicitar plano"}
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
                        Os planos são pagos via PIX pelo gateway integrado (AsgardPay ou Mercado Pago). Ao clicar em
                        <span className="font-medium text-foreground"> Assinar com PIX </span>
                        um QR Code é gerado: basta pagar e a ativação acontece automaticamente após a confirmação.
                    </p>
                    <p>
                        Enquanto isso, empresas sem assinatura permanecem no modo piloto, com todos os recursos
                        liberados para avaliação.
                    </p>
                </CardContent>
            </Card>

            {/* Modal PIX */}
            {pix && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
                    onClick={() => setPix(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <QrCode className="h-5 w-5 text-emerald-600" /> Pague com PIX
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Plano {pix.planName} · ativação automática após o pagamento
                                </p>
                            </div>
                            <button
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                onClick={() => setPix(null)}
                                aria-label="Fechar"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {pix.qrImage ? (
                            <div className="flex justify-center mb-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`data:image/png;base64,${pix.qrImage}`}
                                    alt="QR Code PIX"
                                    className="h-56 w-56 rounded-xl border border-slate-200 p-2 bg-white"
                                />
                            </div>
                        ) : (
                            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                                O gateway não devolveu a imagem do QR Code. Use o código copia e cola abaixo.
                            </div>
                        )}

                        {pix.copyPaste && (
                            <div className="space-y-2 mb-4">
                                <p className="text-xs font-medium text-slate-500">Copia e cola</p>
                                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-[11px] font-mono text-slate-600 break-all flex-1 max-h-20 overflow-hidden">
                                        {pix.copyPaste}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0 h-8"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(pix.copyPaste || "");
                                                toast.success("Código copiado!");
                                            } catch {
                                                toast.error("Não foi possível copiar automaticamente.");
                                            }
                                        }}
                                    >
                                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                            <RefreshCw className="h-3.5 w-3.5 mt-0.5 animate-spin shrink-0" />
                            <p>Verificando o pagamento automaticamente. Esta janela fecha sozinha quando o PIX for confirmado.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
