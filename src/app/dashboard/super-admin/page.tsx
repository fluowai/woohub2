"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Users,
    Server,
    Package,
    ChevronRight,
    ArrowRight,
    MoreVertical,
    Globe,
    CheckCircle2,
    Clock,
    Plus,
    Palette,
    Shield,
    X,
    AlertCircle,
    ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SuperAdminStats {
    quotas: {
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
    };
    branding: {
        name: string;
        logoUrl: string | null;
        primaryColor: string;
        supportEmail: string | null;
    } | null;
    domain: {
        hostname: string;
        status: string;
        sslStatus: string;
    } | null;
    subscription: {
        status: string;
        currentPeriodEnd: string | null;
    } | null;
    recentClients: Array<{
        id: string;
        name: string;
        slug: string;
        status: string;
        instancesAllocated: number;
        sessionsCount: number;
        ownerName: string;
        ownerEmail: string;
        planName: string;
    }>;
}

export default function SuperAdminDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const supportResellerId = searchParams.get("supportResellerId");
    const [stats, setStats] = useState<SuperAdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    // Modal state for "+ Novo cliente"
    const [showClientModal, setShowClientModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [clientForm, setClientForm] = useState({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        maxInstances: 1,
    });

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/auth/login");
        }
    }, [status, router]);

    useEffect(() => {
        // @ts-ignore
        const role = session?.user?.role;
        if (role === "SUPER_ADMIN" || role === "SUPERADMIN" || (role === "MEGA_ADMIN" && supportResellerId)) {
            fetchStats();
        }
    }, [session, supportResellerId]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/super-admin/stats${supportResellerId ? `?supportResellerId=${encodeURIComponent(supportResellerId)}` : ""}`);
            const data = await res.json();
            if (data.status) {
                setStats(data.data);
            } else {
                toast.error(data.message || "Erro ao carregar dados da revenda");
            }
        } catch (error) {
            console.error("Falha ao carregar as estatísticas do super administrador:", error);
            toast.error("Falha ao comunicar com o servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stats) return;

        if (clientForm.maxInstances > stats.quotas.remainingInstances) {
            toast.error(
                `Você possui apenas ${stats.quotas.remainingInstances} instância(s) disponível(is) para alocação.`
            );
            return;
        }

        setSubmitting(true);
        try {
            const clientsQuery = supportResellerId ? `?supportResellerId=${encodeURIComponent(supportResellerId)}` : "";
            const res = await fetch(`/api/super-admin/clients${clientsQuery}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(clientForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Cliente criado com sucesso!");
                setShowClientModal(false);
                setClientForm({
                    name: "",
                    ownerName: "",
                    ownerEmail: "",
                    ownerPassword: "",
                    maxInstances: 1,
                });
                fetchStats();
            } else {
                toast.error(data.message || "Falha ao criar cliente");
            }
        } catch (err) {
            toast.error("Erro ao enviar dados do cliente");
        } finally {
            setSubmitting(false);
        }
    };

    // @ts-ignore
    const userRole = session?.user?.role;
    const canOpenSupportPanel = userRole === "MEGA_ADMIN" && !!supportResellerId;
    if (!session || ((userRole !== "SUPER_ADMIN" && userRole !== "SUPERADMIN") && !canOpenSupportPanel)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 max-w-md shadow-xs">
                    <Shield className="mx-auto h-12 w-12 text-slate-400" />
                    <h2 className="mt-4 text-lg font-semibold text-slate-900">Acesso Restrito</h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Esta área é exclusiva para revendedores white label autorizados.
                    </p>
                </div>
            </div>
        );
    }

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#ff5a00] border-t-transparent" />
                    <p className="text-xs text-slate-500 font-medium">Carregando indicadores da sua revenda...</p>
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
                .toUpperCase() || "CL"
        );
    };

    const brandName = stats?.branding?.name || "Marca não configurada";
    const domainHostname = stats?.domain?.hostname || "Não configurado";
    const isDomainVerified = stats?.domain?.status === "VERIFIED" || stats?.domain?.status === "ACTIVE";

    const displayQuotas = stats?.quotas ?? { clientCount: 0, allocatedInstances: 0, maxInstances: 0, remainingInstances: 0 };
    const displayClients = stats?.recentClients ?? [];
    const displayBrandName = stats?.branding?.name || "Marca não configurada";
    const displayDomain = stats?.domain?.hostname || "Não configurado";

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header matching mockup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Minha operação de revenda
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Acompanhe seus clientes, instâncias e recursos da sua revenda.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowClientModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#ff5a00] hover:bg-[#ea5300] text-white font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={16} />
                        <span>Novo cliente</span>
                    </button>
                </div>
            </div>

            {/* 3 Metric Cards per row matching mockup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Clientes ativos */}
                <Link href={supportResellerId ? `/dashboard/super-admin/clients?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/clients"} className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center text-[#ff5a00] flex-shrink-0">
                                    <Users className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Clientes ativos</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayQuotas.clientCount}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </CardContent>
                    </Card>
                </Link>

                {/* Card 2: Instâncias alocadas */}
                <Link href={supportResellerId ? `/dashboard/super-admin/instances?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/instances"} className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 flex-shrink-0">
                                    <Server className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Instâncias alocadas</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayQuotas.allocatedInstances} / {displayQuotas.maxInstances}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </CardContent>
                    </Card>
                </Link>

                {/* Card 3: Disponíveis para revenda */}
                <Link href={supportResellerId ? `/dashboard/super-admin/quotas?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/quotas"} className="group">
                    <Card className="bg-white border-slate-200 hover:border-orange-200 transition-all shadow-xs h-full rounded-2xl">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center text-[#ff5a00] flex-shrink-0">
                                    <Package className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-500">Disponíveis para revenda</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-0.5">
                                        {displayQuotas.remainingInstances}
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
                {/* Left: Meus Clientes Table (col-span-8) */}
                <div className="lg:col-span-8">
                    <Card className="bg-white border-slate-200 shadow-xs h-full rounded-2xl flex flex-col justify-between overflow-hidden">
                        <div>
                            <CardHeader className="p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-bold text-slate-900">Meus clientes</CardTitle>
                                <Link
                                    href={supportResellerId ? `/dashboard/super-admin/clients?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/clients"}
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
                                            <th className="py-3.5 px-4">Plano</th>
                                            <th className="py-3.5 px-4">Instâncias</th>
                                            <th className="py-3.5 px-4">Status</th>
                                            <th className="py-3.5 px-4 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                        {displayClients.map((c, idx) => (
                                            <tr key={c.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-[#dbeafe] text-[#2563eb] flex items-center justify-center font-bold text-xs flex-shrink-0">
                                                            {initials(c.name)}
                                                        </div>
                                                        <span className="font-semibold text-slate-900 text-xs">
                                                            {c.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 font-semibold text-slate-800 text-xs">
                                                    {c.planName}
                                                </td>
                                                <td className="py-4 px-4 font-semibold text-slate-800 text-xs">
                                                    {c.instancesAllocated}
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e8f7ee] text-[#16a34a]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                                                        Ativo
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <Link
                                                        href={supportResellerId ? `/dashboard/super-admin/clients?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/clients"}
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

                {/* Right: Minha marca e domínio Card (col-span-4) */}
                <div className="lg:col-span-4">
                    <Card className="bg-white border-slate-200 shadow-xs h-full rounded-2xl flex flex-col justify-between">
                        <div>
                            <CardHeader className="p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-[#ff5a00]" />
                                    <span>Minha marca e domínio</span>
                                </CardTitle>
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                            </CardHeader>
                            <CardContent className="p-6 space-y-5">
                                {/* Brand Badge & Name matching mockup */}
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[#ff5a00] text-2xl font-black leading-none">▲</span>
                                    <h3 className="font-bold text-slate-900 text-lg">
                                        {displayBrandName}
                                    </h3>
                                </div>

                                {/* Domain Info */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <ExternalLink size={14} className="text-slate-400 flex-shrink-0" />
                                        <span className="font-mono text-xs">{displayDomain}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                                        <span className="text-xs font-semibold text-emerald-700">
                                            Domínio verificado
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </div>

                        <div className="p-6 pt-0">
                            <Link href={supportResellerId ? `/dashboard/super-admin/branding?supportResellerId=${encodeURIComponent(supportResellerId)}` : "/dashboard/super-admin/branding"} className="w-full block">
                                <button className="w-full py-3 px-4 rounded-xl bg-[#fff1eb] hover:bg-[#ffe6db] text-[#ff5a00] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5">
                                    <span>Personalizar marca</span>
                                    <ArrowRight size={14} />
                                </button>
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Modal: Novo Cliente */}
            {showClientModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Cliente da Revenda</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Crie uma conta ADMIN para sua empresa cliente.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowClientModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateClient} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome da Empresa Cliente *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Imobiliária Costa"
                                    value={clientForm.name}
                                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Nome do Administrador *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Renato Costa"
                                        value={clientForm.ownerName}
                                        onChange={(e) => setClientForm({ ...clientForm, ownerName: e.target.value })}
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
                                        placeholder="renato@imobiliariacosta.com"
                                        value={clientForm.ownerEmail}
                                        onChange={(e) => setClientForm({ ...clientForm, ownerEmail: e.target.value })}
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
                                    value={clientForm.ownerPassword}
                                    onChange={(e) => setClientForm({ ...clientForm, ownerPassword: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-semibold text-slate-700">
                                        Quantidade de Instâncias Alocadas *
                                    </label>
                                    <span className="text-[11px] font-bold text-[#ff5a00]">
                                        Disponível: {stats?.quotas.remainingInstances ?? 0}
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    max={stats?.quotas.remainingInstances || 1}
                                    value={clientForm.maxInstances}
                                    onChange={(e) =>
                                        setClientForm({ ...clientForm, maxInstances: parseInt(e.target.value) || 1 })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
                                <span>
                                    As instâncias serão deduzidas do saldo da sua revenda ({stats?.quotas.allocatedInstances}/
                                    {stats?.quotas.maxInstances}). O cliente receberá papel ADMIN na empresa dele.
                                </span>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowClientModal(false)}
                                    className="text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting || (stats?.quotas.remainingInstances ?? 0) <= 0}
                                    size="sm"
                                    className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                                >
                                    {submitting ? "Criando..." : "Criar Cliente"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
