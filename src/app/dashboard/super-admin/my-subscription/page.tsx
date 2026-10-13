"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ShieldCheck,
    ArrowLeft,
    CheckCircle2,
    Clock,
    CreditCard,
    Server,
    AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface SubscriptionDetails {
    resellerName: string;
    status: string;
    maxInstances: number;
    maxTenants: number;
    subscription: {
        id: string;
        status: string;
        planName: string;
        planPrice: number;
        currency: string;
        currentPeriodEnd: string | null;
    } | null;
}

export default function MySubscriptionPage() {
    const [sub, setSub] = useState<SubscriptionDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSubscription();
    }, []);

    const fetchSubscription = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/super-admin/my-subscription");
            const data = await res.json();
            if (data.status) {
                setSub(data.data);
            }
        } catch (e) {
            toast.error("Erro ao carregar dados da assinatura");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/super-admin"
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Minha Assinatura</h1>
                        <p className="text-xs text-slate-500">
                            Detalhes do seu contrato direto com o Mega Admin da plataforma Woohub.
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                    <p className="text-xs text-slate-400 mt-2">Carregando plano e assinatura...</p>
                </div>
            ) : sub ? (
                <div className="space-y-6">
                    {/* Status Card */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-[#ff5a00]" />
                                <span>Situação do Contrato</span>
                            </CardTitle>
                            <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    sub.status === "ACTIVE"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-amber-50 text-amber-700"
                                }`}
                            >
                                <span
                                    className={`h-2 w-2 rounded-full ${
                                        sub.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                                    }`}
                                />
                                {sub.status === "ACTIVE" ? "Contrato Ativo" : "Suspenso"}
                            </span>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                    <p className="text-[11px] text-slate-500">Operação White Label</p>
                                    <p className="text-base font-bold text-slate-900 mt-0.5">{sub.resellerName}</p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Capacidade contratada: {sub.maxInstances} instâncias
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                    <p className="text-[11px] text-slate-500">Plano com a Plataforma</p>
                                    <p className="text-base font-bold text-slate-900 mt-0.5">
                                        {sub.subscription?.planName || "Parceiro Oficial"}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Limite de clientes: {sub.maxTenants} empresas
                                    </p>
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
                                <span>
                                    Para solicitar upgrade de capacidade ou adicionar novas cotas ao seu contrato, entre em
                                    contato com a administração global do Woohub.
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
