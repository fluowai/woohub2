"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BarChart3,
    ArrowLeft,
    CheckCircle2,
    Shield,
    Server,
    Users,
    Package,
    Sliders,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface QuotaSummary {
    resellerId: string;
    resellerName: string;
    status: string;
    maxInstances: number;
    allocatedInstances: number;
    remainingInstances: number;
    activeInstancesCount: number;
    clientCount: number;
    maxTenants: number;
    utilizationPercent: number;
    features: Record<string, boolean>;
}

export default function SuperAdminQuotasPage() {
    const [quotas, setQuotas] = useState<QuotaSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchQuotas();
    }, []);

    const fetchQuotas = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/super-admin/quotas");
            const data = await res.json();
            if (data.status) {
                setQuotas(data.data);
            }
        } catch (e) {
            toast.error("Erro ao carregar resumo de cotas");
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
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Consumo e Cotas</h1>
                        <p className="text-xs text-slate-500">
                            Acompanhe a capacidade contratada com o Mega Admin e a distribuição entre seus clientes.
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                    <p className="text-xs text-slate-400 mt-2">Carregando métricas de cotas...</p>
                </div>
            ) : quotas ? (
                <div className="space-y-6">
                    {/* Capacity Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-white border-slate-200 shadow-xs">
                            <CardContent className="p-5">
                                <p className="text-xs text-slate-500 font-medium">Capacidade Contratada</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {quotas.maxInstances} instâncias
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1">Limite total da sua revenda</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-white border-slate-200 shadow-xs">
                            <CardContent className="p-5">
                                <p className="text-xs text-slate-500 font-medium">Alocadas para Clientes</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {quotas.allocatedInstances} instâncias
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1">{quotas.clientCount} clientes atendidos</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-white border-slate-200 shadow-xs">
                            <CardContent className="p-5">
                                <p className="text-xs text-slate-500 font-medium">Disponíveis para Revenda</p>
                                <p className="text-2xl font-bold text-[#ff5a00] mt-1">
                                    {quotas.remainingInstances} instâncias
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1">Saldo livre para novas alocações</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Utilization Progress Bar */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                                <span>Utilização da Capacidade</span>
                                <span className="text-xs font-semibold text-slate-600">
                                    {quotas.utilizationPercent}% ocupado
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-3">
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-[#ff5a00] rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, quotas.utilizationPercent)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>0</span>
                                <span>{quotas.allocatedInstances} de {quotas.maxInstances} instâncias alocadas</span>
                                <span>{quotas.maxInstances}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Allowed Features */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Sliders className="h-4 w-4 text-[#ff5a00]" />
                                <span>Recursos Liberados pelo Mega Admin</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {Object.entries(quotas.features).map(([feat, enabled]) => (
                                    <div
                                        key={feat}
                                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                                    >
                                        <span className="font-medium text-slate-700 capitalize">{feat}</span>
                                        <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                enabled
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : "bg-slate-200 text-slate-600"
                                            }`}
                                        >
                                            {enabled ? "Liberado" : "Bloqueado"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
