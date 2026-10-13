"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
    Briefcase,
    Plus,
    Search,
    Shield,
    CheckCircle2,
    XCircle,
    MoreVertical,
    ArrowLeft,
    Sliders,
    X,
    AlertCircle,
    Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ResellerItem {
    id: string;
    name: string;
    owner: { id: string; name: string; email: string };
    maxInstances: number;
    maxTenants: number;
    status: "ACTIVE" | "SUSPENDED" | "CANCELED";
    domains?: Array<{ hostname: string; status: string }>;
    _count?: { tenants?: number };
    tenants?: Array<{ id: string; maxInstances: number; status: string }>;
    createdAt: string;
}

export default function ResellersPage() {
    const { data: session } = useSession();
    const [resellers, setResellers] = useState<ResellerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Edit modal
    const [editingReseller, setEditingReseller] = useState<ResellerItem | null>(null);
    const [editForm, setEditForm] = useState({
        maxInstances: 30,
        maxTenants: 50,
        status: "ACTIVE",
    });
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [submittingCreate, setSubmittingCreate] = useState(false);
    const [plans, setPlans] = useState<Array<{ id: string; code: string; name: string; maxInstances: number; maxUsers: number; priceCents: number }>>([]);
    const [createForm, setCreateForm] = useState({ name: "", ownerName: "", ownerEmail: "", password: "", planId: "", maxInstances: 30, maxTenants: 20 });

    useEffect(() => {
        fetchResellers();
        fetch("/api/plans").then((response) => response.json()).then((body) => setPlans(body.data ?? [])).catch(() => toast.error("Não foi possível carregar os planos disponíveis"));
    }, []);

    const fetchResellers = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/mega-admin/resellers");
            const data = await res.json();
            if (data.status) {
                setResellers(data.data);
            }
        } catch (e) {
            toast.error("Erro ao buscar revendedores");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEdit = (r: ResellerItem) => {
        setEditingReseller(r);
        setEditForm({
            maxInstances: r.maxInstances,
            maxTenants: r.maxTenants,
            status: r.status,
        });
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingReseller) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/mega-admin/resellers/${editingReseller.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Revendedor atualizado com sucesso!");
                setEditingReseller(null);
                fetchResellers();
            } else {
                toast.error(data.message || "Falha ao salvar");
            }
        } catch (e) {
            toast.error("Erro ao salvar alterações");
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingCreate) return;
        setSubmittingCreate(true);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20_000);
        try {
            const res = await fetch("/api/mega-admin/resellers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm), signal: controller.signal });
            const data = await res.json();
            if (!res.ok || !data.status) throw new Error(data.message || "Não foi possível criar a revenda");
            toast.success("Revendedor criado com sucesso");
            setCreateForm({ name: "", ownerName: "", ownerEmail: "", password: "", planId: "", maxInstances: 30, maxTenants: 20 });
            setCreating(false);
            fetchResellers();
        } catch (error) {
            toast.error(error instanceof DOMException && error.name === "AbortError" ? "O banco ou o servidor demorou mais de 20 segundos para responder" : error instanceof Error ? error.message : "Erro ao criar revendedor");
        } finally {
            window.clearTimeout(timeout);
            setSubmittingCreate(false);
        }
    };

    const filtered = resellers.filter(
        (r) =>
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.owner.email.toLowerCase().includes(search.toLowerCase()) ||
            r.owner.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button onClick={() => setCreating(true)} className="bg-[#ff5a00] text-xs text-white hover:bg-[#ea5300]"><Plus size={15} className="mr-1" /> Criar revendedor</Button>
                    <Link
                        href="/dashboard/mega-admin"
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">
                            Revendedores White Label
                        </h1>
                        <p className="text-xs text-slate-500">
                            Gerencie as operações parceiras, cotas contratadas e status das marcas.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar revendedor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                        />
                    </div>
                </div>
            </div>

            {/* Resellers Table */}
            <Card className="bg-white border-slate-200 shadow-xs">
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="p-10 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                            <p className="text-xs text-slate-400 mt-2">Carregando revendedores...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                            Nenhum revendedor encontrado.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-3 px-5">Operação / Agência</th>
                                    <th className="py-3 px-4">Responsável</th>
                                    <th className="py-3 px-4">Domínio</th>
                                    <th className="py-3 px-4">Instâncias Alocadas</th>
                                    <th className="py-3 px-4">Clientes</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {filtered.map((r) => {
                                    const allocated = (r.tenants ?? []).reduce(
                                        (sum, t) => sum + (t.maxInstances || 0),
                                        0
                                    );
                                    const primaryDomain = r.domains?.[0]?.hostname || "woohub.local";
                                    return (
                                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="py-3.5 px-5 font-bold text-slate-900">
                                                {r.name}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <p className="text-slate-900 font-medium">{r.owner.name}</p>
                                                <p className="text-[11px] text-slate-400">{r.owner.email}</p>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                                                {primaryDomain}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                                                {allocated} / {r.maxInstances}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                                                {r._count?.tenants ?? 0} / {r.maxTenants}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                                        r.status === "ACTIVE"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : r.status === "SUSPENDED"
                                                            ? "bg-amber-50 text-amber-700"
                                                            : "bg-red-50 text-red-700"
                                                    }`}
                                                >
                                                    <span
                                                        className={`h-1.5 w-1.5 rounded-full ${
                                                            r.status === "ACTIVE"
                                                                ? "bg-emerald-500"
                                                                : r.status === "SUSPENDED"
                                                                ? "bg-amber-500"
                                                                : "bg-red-500"
                                                        }`}
                                                    />
                                                    {r.status === "ACTIVE"
                                                        ? "Ativo"
                                                        : r.status === "SUSPENDED"
                                                        ? "Suspenso"
                                                        : "Cancelado"}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <Link href={`/dashboard/super-admin?supportResellerId=${encodeURIComponent(r.id)}`} className="mr-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-orange-50 text-orange-700 font-semibold text-[11px]" title="Entrar no painel real da revenda em modo de suporte"><Eye size={13} /> Acessar painel</Link>
                                                <button
                                                    onClick={() => handleOpenEdit(r)}
                                                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                                                >
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {creating && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><form onSubmit={handleCreate} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="text-base font-bold">Criar revendedor manualmente</h3><p className="text-xs text-slate-500">O responsável receberá acesso ao painel white label.</p></div><button type="button" disabled={submittingCreate} onClick={() => setCreating(false)}><X size={18} /></button></div>{[["name", "Nome da operação", "Ex.: Agência Silva"], ["ownerName", "Nome do responsável", "Nome completo"], ["ownerEmail", "E-mail de acesso", "responsavel@empresa.com"], ["password", "Senha inicial", "Mínimo de 6 caracteres"]].map(([key, label, placeholder]) => <label key={key} className="block text-xs font-semibold text-slate-700">{label}<input required={key !== "ownerName"} type={key === "password" ? "password" : key === "ownerEmail" ? "email" : "text"} value={String(createForm[key as keyof typeof createForm])} onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>)}<label className="block text-xs font-semibold text-slate-700">Plano comercial<select required value={createForm.planId} onChange={(e) => setCreateForm({ ...createForm, planId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Selecione um plano disponível</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.maxInstances} instâncias · R$ {(plan.priceCents / 100).toFixed(2).replace(".", ",")}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Máximo de instâncias<input type="number" min={1} value={createForm.maxInstances} onChange={(e) => setCreateForm({ ...createForm, maxInstances: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-xs font-semibold">Máximo de clientes<input type="number" min={1} value={createForm.maxTenants} onChange={(e) => setCreateForm({ ...createForm, maxTenants: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={submittingCreate} onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" disabled={submittingCreate || !createForm.planId} className="bg-[#ff5a00] text-white">{submittingCreate ? "Criando..." : "Criar revendedor"}</Button></div></form></div>}

            {/* Modal Editar Revendedor */}
            {editingReseller && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Editar Revendedor</h3>
                                <p className="text-xs text-slate-500 mt-0.5">{editingReseller.name}</p>
                            </div>
                            <button
                                onClick={() => setEditingReseller(null)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Cota Contratada de Instâncias
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={editForm.maxInstances}
                                    onChange={(e) =>
                                        setEditForm({ ...editForm, maxInstances: parseInt(e.target.value) || 1 })
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
                                    max={500}
                                    value={editForm.maxTenants}
                                    onChange={(e) =>
                                        setEditForm({ ...editForm, maxTenants: parseInt(e.target.value) || 1 })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Situação da Operação
                                </label>
                                <select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                >
                                    <option value="ACTIVE">Ativo (Operação Normal)</option>
                                    <option value="SUSPENDED">Suspenso (Bloqueia envios e criação de instâncias)</option>
                                    <option value="CANCELED">Cancelado</option>
                                </select>
                            </div>

                            {editForm.status === "SUSPENDED" && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 flex items-start gap-2">
                                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-600" />
                                    <span>
                                        Atenção: Suspender o revendedor bloqueia envios pagos via API, scheduler e novas
                                        instâncias de todos os clientes vinculados a ele.
                                    </span>
                                </div>
                            )}

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingReseller(null)}
                                    className="text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    size="sm"
                                    className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                                >
                                    {saving ? "Salvando..." : "Salvar Alterações"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
