"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Users,
    Building2,
    Server,
    Shield,
    CheckCircle2,
    Clock,
    Plus,
    ChevronRight,
    ArrowRight,
    MoreVertical,
    Globe,
    AlertCircle,
    X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StatsData {
    totals: {
        activeResellers: number;
        totalResellers: number;
        directClients: number;
        resellerClients: number;
        totalClients: number;
        totalInstances: number;
        connectedInstances: number;
        verifiedDomains: number;
        pendingDomains: number;
        pendingOrSuspendedSubs: number;
        totalUsers: number;
    };
    recentResellers: Array<{
        id: string;
        name: string;
        ownerName: string;
        ownerEmail: string;
        domain: string;
        instancesAllocated: number;
        instancesContracted: number;
        status: string;
        clientCount: number;
        createdAt: string;
    }>;
}

export default function MegaAdminDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    // Modal states
    const [showResellerModal, setShowResellerModal] = useState(false);
    const [showDirectClientModal, setShowDirectClientModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Reseller form
    const [resellerForm, setResellerForm] = useState({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        maxInstances: 30,
        maxTenants: 50,
        primaryDomain: "",
    });

    // Direct client form
    const [directClientForm, setDirectClientForm] = useState({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        maxInstances: 5,
    });

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/auth/login");
        }
    }, [status, router]);

    useEffect(() => {
        // @ts-ignore
        if (session?.user?.role === "MEGA_ADMIN" || session?.user?.email === "fluowai@gmail.com") {
            fetchStats();
        }
    }, [session]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/mega-admin/stats");
            const data = await res.json();
            if (data.status) {
                setStats(data.data);
            } else {
                toast.error(data.message || "Erro ao carregar dados");
            }
        } catch (error) {
            console.error("Failed to fetch stats:", error);
            toast.error("Falha ao comunicar com o servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateReseller = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/mega-admin/resellers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(resellerForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Revendedor criado com sucesso!");
                setShowResellerModal(false);
                setResellerForm({
                    name: "",
                    ownerName: "",
                    ownerEmail: "",
                    ownerPassword: "",
                    maxInstances: 30,
                    maxTenants: 50,
                    primaryDomain: "",
                });
                fetchStats();
            } else {
                toast.error(data.message || "Falha ao criar revendedor");
            }
        } catch (err) {
            toast.error("Erro ao enviar dados");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateDirectClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/mega-admin/direct-clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(directClientForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Cliente direto criado com sucesso!");
                setShowDirectClientModal(false);
                setDirectClientForm({
                    name: "",
                    ownerName: "",
                    ownerEmail: "",
                    ownerPassword: "",
                    maxInstances: 5,
                });
                fetchStats();
            } else {
                toast.error(data.message || "Falha ao criar cliente");
            }
        } catch (err) {
            toast.error("Erro ao enviar dados");
        } finally {
            setSubmitting(false);
        }
    };

    if (status === "loading" || (loading && !stats)) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#ff5a00] border-t-transparent" />
                    <p className="text-xs text-slate-500 font-medium">Carregando painel Mega Admin...</p>
                </div>
            </div>
        );
    }

    // @ts-ignore
    const isMega = session?.user?.role === "MEGA_ADMIN" || session?.user?.email === "fluowai@gmail.com";
    if (!session || !isMega) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 max-w-md shadow-xs">
                    <Shield className="mx-auto h-12 w-12 text-slate-400" />
                    <h2 className="mt-4 text-lg font-semibold text-slate-900">Acesso Restrito</h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Esta área é exclusiva para a administração global do proprietário da API.
                    </p>
                </div>
            </div>
        );
    }

    const initials = (name: string) => {
        return (
            name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "WL"
        );
    };

    // O painel sempre reflete exclusivamente a resposta real da API.
    const displayStats = stats ?? {
        totals: { activeResellers: 0, directClients: 0, connectedInstances: 0, verifiedDomains: 0, pendingDomains: 0 },
        recentResellers: [],
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header matching mockup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Visão geral da plataforma
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Acompanhe os principais indicadores da sua API WhatsApp e gerencie toda a operação.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setShowResellerModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#ff5a00] hover:bg-[#ea5300] text-white font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={16} />
                        <span>Novo revendedor</span>
                    </button>
                    <button
                        onClick={() => setShowDirectClientModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#ff5a00] text-[#ff5a00] hover:bg-orange-50 font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={16} />
                        <span>Cliente direto</span>
                    </button>
                </div>
            </div>

            {/* 3 Metric Cards per row matching mockup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Revendedores ativos */}
                <Link href="/dashboard/mega-admin/resellers" className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center text-[#ff5a00] flex-shrink-0">
                                    <Users className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Revendedores ativos</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayStats.totals.activeResellers}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </CardContent>
                    </Card>
                </Link>

                {/* Card 2: Clientes diretos */}
                <Link href="/dashboard/mega-admin/direct-clients" className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 flex-shrink-0">
                                    <Users className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Clientes diretos</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayStats.totals.directClients}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </CardContent>
                    </Card>
                </Link>

                {/* Card 3: Instâncias conectadas */}
                <Link href="/dashboard/mega-admin/instances" className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 flex-shrink-0">
                                    <Server className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Instâncias conectadas</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayStats.totals.connectedInstances}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Split Section matching mockup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left: Revendedores white label Table (col-span-8) */}
                <div className="lg:col-span-8">
                    <Card className="bg-white border-slate-200 shadow-xs h-full rounded-2xl flex flex-col justify-between overflow-hidden">
                        <div>
                            <CardHeader className="p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-bold text-slate-900">
                                    Revendedores white label
                                </CardTitle>
                                <Link
                                    href="/dashboard/mega-admin/resellers"
                                    className="text-xs font-semibold text-[#ff5a00] hover:text-[#ea5300] inline-flex items-center gap-1 transition-colors"
                                >
                                    <span>Ver todos</span>
                                    <ArrowRight size={14} />
                                </Link>
                            </CardHeader>
                            <CardContent className="p-0 overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-white border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                                        <tr>
                                            <th className="py-3.5 px-6">Empresa</th>
                                            <th className="py-3.5 px-4">Domínio</th>
                                            <th className="py-3.5 px-4">Instâncias</th>
                                            <th className="py-3.5 px-4">Status</th>
                                            <th className="py-3.5 px-4 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {displayStats.recentResellers.map((r, idx) => (
                                            <tr key={r.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0 ${
                                                                idx % 2 === 0 ? "bg-[#ea580c]" : "bg-[#9a3412]"
                                                            }`}
                                                        >
                                                            {initials(r.name)}
                                                        </div>
                                                        <span className="font-semibold text-slate-900 text-xs">
                                                            {r.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 font-mono text-xs text-slate-600">
                                                    {r.domain}
                                                </td>
                                                <td className="py-4 px-4 font-semibold text-slate-800 text-xs">
                                                    {r.instancesAllocated} / {r.instancesContracted}
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e8f7ee] text-[#16a34a]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                                                        Ativo
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <Link
                                                        href={`/dashboard/mega-admin/resellers`}
                                                        className="text-slate-400 hover:text-slate-700 p-1 rounded inline-block"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </div>
                    </Card>
                </div>

                {/* Right: Controle de Domínios Card (col-span-4) */}
                <div className="lg:col-span-4">
                    <Card className="bg-white border-slate-200 shadow-xs h-full rounded-2xl flex flex-col justify-between">
                        <div>
                            <CardHeader className="p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-[#ff5a00]" />
                                    <span>Controle de domínios</span>
                                </CardTitle>
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Verificados */}
                                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                            <CheckCircle2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 font-normal">Verificados</p>
                                            <p className="text-xl font-bold text-slate-900">
                                                {displayStats.totals.verifiedDomains}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Pendentes */}
                                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 font-normal">Pendentes</p>
                                            <p className="text-xl font-bold text-slate-900">
                                                {displayStats.totals.pendingDomains}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </div>

                        <div className="p-6 pt-0">
                            <Link href="/dashboard/mega-admin/domains" className="w-full block">
                                <button className="w-full py-3 px-4 rounded-xl bg-[#fff1eb] hover:bg-[#ffe6db] text-[#ff5a00] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5">
                                    <span>Gerenciar domínios</span>
                                    <ArrowRight size={14} />
                                </button>
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Modal: Novo Revendedor */}
            {showResellerModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Revendedor White Label</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Crie uma operação parceira com cotas e marca própria.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowResellerModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateReseller} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome da Operação / Agência *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Agência Alfa"
                                    value={resellerForm.name}
                                    onChange={(e) => setResellerForm({ ...resellerForm, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Nome do Responsável *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="João Silva"
                                        value={resellerForm.ownerName}
                                        onChange={(e) => setResellerForm({ ...resellerForm, ownerName: e.target.value })}
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        E-mail de Login *
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="joao@agencia-alfa.com"
                                        value={resellerForm.ownerEmail}
                                        onChange={(e) => setResellerForm({ ...resellerForm, ownerEmail: e.target.value })}
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Senha Inicial *
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Mínimo 6 caracteres"
                                    value={resellerForm.ownerPassword}
                                    onChange={(e) => setResellerForm({ ...resellerForm, ownerPassword: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Cota de Instâncias *
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={resellerForm.maxInstances}
                                        onChange={(e) =>
                                            setResellerForm({ ...resellerForm, maxInstances: parseInt(e.target.value) || 1 })
                                        }
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Limite de Clientes
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={resellerForm.maxTenants}
                                        onChange={(e) =>
                                            setResellerForm({ ...resellerForm, maxTenants: parseInt(e.target.value) || 1 })
                                        }
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Domínio Próprio Inicial (Opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="api.agencia-alfa.com.br"
                                    value={resellerForm.primaryDomain}
                                    onChange={(e) => setResellerForm({ ...resellerForm, primaryDomain: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                                <span>
                                    O revendedor terá papel SUPER_ADMIN e poderá criar e distribuir cotas para seus clientes
                                    ADMIN com sua marca personalizada.
                                </span>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowResellerModal(false)}
                                    className="text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    size="sm"
                                    className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                                >
                                    {submitting ? "Criando..." : "Criar Revendedor"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Cliente Direto */}
            {showDirectClientModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Cliente Direto</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Venda direta do Mega Admin sem vínculo com revendedor.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowDirectClientModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateDirectClient} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome da Empresa / Cliente *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Clínica Vida"
                                    value={directClientForm.name}
                                    onChange={(e) => setDirectClientForm({ ...directClientForm, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Nome do Responsável *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Carlos Lima"
                                        value={directClientForm.ownerName}
                                        onChange={(e) =>
                                            setDirectClientForm({ ...directClientForm, ownerName: e.target.value })
                                        }
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        E-mail de Login *
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="carlos@clinicavida.com"
                                        value={directClientForm.ownerEmail}
                                        onChange={(e) =>
                                            setDirectClientForm({ ...directClientForm, ownerEmail: e.target.value })
                                        }
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Senha Inicial *
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Mínimo 6 caracteres"
                                    value={directClientForm.ownerPassword}
                                    onChange={(e) =>
                                        setDirectClientForm({ ...directClientForm, ownerPassword: e.target.value })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Cota de Instâncias Contratadas *
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={directClientForm.maxInstances}
                                    onChange={(e) =>
                                        setDirectClientForm({
                                            ...directClientForm,
                                            maxInstances: parseInt(e.target.value) || 1,
                                        })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowDirectClientModal(false)}
                                    className="text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    size="sm"
                                    className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                                >
                                    {submitting ? "Criando..." : "Criar Cliente Direto"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
