"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Users,
    Plus,
    Search,
    ArrowLeft,
    CheckCircle2,
    X,
    Building2,
    Sliders,
    AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ClientItem {
    id: string;
    name: string;
    slug: string;
    status: string;
    maxInstances: number;
    sessionsCount: number;
    membersCount: number;
    ownerName: string;
    ownerEmail: string;
    planName: string;
    createdAt: string;
}

export default function SuperAdminClientsPage() {
    const searchParams = useSearchParams();
    const supportResellerId = searchParams.get("supportResellerId");
    const clientsQuery = supportResellerId ? `?supportResellerId=${encodeURIComponent(supportResellerId)}` : "";
    const [clients, setClients] = useState<ClientItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [remainingInstances, setRemainingInstances] = useState(0);

    // Create client modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        maxInstances: 1,
    });

    // Edit client quota modal
    const [editingClient, setEditingClient] = useState<ClientItem | null>(null);
    const [editInstances, setEditInstances] = useState(1);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchClients();
    }, [clientsQuery]);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/super-admin/clients${clientsQuery}`);
            const data = await res.json();
            if (data.status) {
                const rows = Array.isArray(data.data) ? data.data : data.data?.clients || [];
                setClients(rows);
                setRemainingInstances(data.data?.remainingInstances ?? rows.reduce((sum: number, item: ClientItem) => sum + item.maxInstances, 0));
            }
        } catch (e) {
            toast.error("Erro ao buscar clientes da revenda");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (createForm.maxInstances > remainingInstances) {
            toast.error(`Você possui apenas ${remainingInstances} instância(s) disponível(is).`);
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/super-admin/clients${clientsQuery}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Cliente criado com sucesso!");
                setShowCreateModal(false);
                setCreateForm({
                    name: "",
                    ownerName: "",
                    ownerEmail: "",
                    ownerPassword: "",
                    maxInstances: 1,
                });
                fetchClients();
            } else {
                toast.error(data.message || "Erro ao criar cliente");
            }
        } catch (err) {
            toast.error("Erro ao enviar dados");
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenEdit = (client: ClientItem) => {
        setEditingClient(client);
        setEditInstances(client.maxInstances);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClient) return;

        setSaving(true);
        try {
            const res = await fetch(`/api/super-admin/clients/${editingClient.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxInstances: editInstances }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Cota de instâncias atualizada!");
                setEditingClient(null);
                fetchClients();
            } else {
                toast.error(data.message || "Falha ao atualizar");
            }
        } catch (e) {
            toast.error("Erro ao salvar alterações");
        } finally {
            setSaving(false);
        }
    };

    const filtered = clients.filter(
        (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
            c.ownerName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/super-admin"
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Meus Clientes</h1>
                        <p className="text-xs text-slate-500">
                            Gerencie as contas ADMIN de empresas atendidas pela sua revenda.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                        />
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff5a00] hover:bg-[#ea5300] text-white font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={15} />
                        <span>Novo cliente</span>
                    </button>
                </div>
            </div>

            {/* Quota Summary Pill */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-slate-600">Total de clientes:</span>
                    <strong className="text-slate-900">{clients.length}</strong>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-600">Saldo disponível para novas alocações:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-[#ff5a00] font-bold">
                        {remainingInstances} instâncias
                    </span>
                </div>
            </div>

            {/* Table */}
            <Card className="bg-white border-slate-200 shadow-xs">
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="p-10 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                            <p className="text-xs text-slate-400 mt-2">Carregando clientes...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                            Nenhum cliente cadastrado.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-3 px-5">Empresa Cliente</th>
                                    <th className="py-3 px-4">Administrador</th>
                                    <th className="py-3 px-4">Instâncias (Conectadas/Cota)</th>
                                    <th className="py-3 px-4">Plano</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {filtered.map((c) => (
                                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="py-3.5 px-5 font-bold text-slate-900">{c.name}</td>
                                        <td className="py-3.5 px-4">
                                            <p className="text-slate-900 font-medium">{c.ownerName}</p>
                                            <p className="text-[11px] text-slate-400">{c.ownerEmail}</p>
                                        </td>
                                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                                            {c.sessionsCount} / {c.maxInstances}
                                        </td>
                                        <td className="py-3.5 px-4 font-medium text-slate-600">{c.planName}</td>
                                        <td className="py-3.5 px-4">
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                                    c.status === "ACTIVE"
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : "bg-red-50 text-red-700"
                                                }`}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${
                                                        c.status === "ACTIVE" ? "bg-emerald-500" : "bg-red-500"
                                                    }`}
                                                />
                                                {c.status === "ACTIVE" ? "Ativo" : "Inativo"}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 text-right">
                                            <button
                                                onClick={() => handleOpenEdit(c)}
                                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                                            >
                                                Ajustar Cota
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {/* Modal: Ajustar Cota */}
            {editingClient && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Ajustar Cota de Instâncias</h3>
                                <p className="text-xs text-slate-500 mt-0.5">{editingClient.name}</p>
                            </div>
                            <button
                                onClick={() => setEditingClient(null)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Quantidade de Instâncias Alocadas
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={editingClient.maxInstances + remainingInstances}
                                    value={editInstances}
                                    onChange={(e) => setEditInstances(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Máximo permitido com seu saldo atual: {editingClient.maxInstances + remainingInstances}
                                </p>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingClient(null)}
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
                                    {saving ? "Salvando..." : "Salvar Alteração"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Novo Cliente */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Cliente da Revenda</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Cadastrar empresa compradora de instâncias</p>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome da Empresa *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Clínica Vida"
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome do Administrador *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Marcos Silva"
                                    value={createForm.ownerName}
                                    onChange={(e) => setCreateForm({ ...createForm, ownerName: e.target.value })}
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
                                    placeholder="marcos@clinicavida.com"
                                    value={createForm.ownerEmail}
                                    onChange={(e) => setCreateForm({ ...createForm, ownerEmail: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
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
                                    value={createForm.ownerPassword}
                                    onChange={(e) => setCreateForm({ ...createForm, ownerPassword: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-semibold text-slate-700">
                                        Cota de Instâncias *
                                    </label>
                                    <span className="text-[11px] font-bold text-[#ff5a00]">
                                        Disponível: {remainingInstances}
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    max={remainingInstances || 1}
                                    value={createForm.maxInstances}
                                    onChange={(e) =>
                                        setCreateForm({ ...createForm, maxInstances: parseInt(e.target.value) || 1 })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowCreateModal(false)}
                                    className="text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting || remainingInstances <= 0}
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
