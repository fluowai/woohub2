"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Building2,
    Plus,
    Search,
    ArrowLeft,
    CheckCircle2,
    X,
    Users,
    Server,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DirectClient {
    id: string;
    name: string;
    slug: string;
    status: string;
    maxInstances: number;
    sessionsCount: number;
    membersCount: number;
    ownerName: string;
    ownerEmail: string;
    createdAt: string;
}

export default function DirectClientsPage() {
    const [clients, setClients] = useState<DirectClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        maxInstances: 5,
    });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/mega-admin/direct-clients");
            const data = await res.json();
            if (data.status) {
                setClients(data.data);
            }
        } catch (e) {
            toast.error("Erro ao buscar clientes diretos");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/mega-admin/direct-clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Cliente direto criado com sucesso!");
                setShowModal(false);
                setForm({
                    name: "",
                    ownerName: "",
                    ownerEmail: "",
                    ownerPassword: "",
                    maxInstances: 5,
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
                        href="/dashboard/mega-admin"
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Clientes Diretos</h1>
                        <p className="text-xs text-slate-500">
                            Empresas que contratam conexões diretamente do Mega Admin da plataforma.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente direto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                        />
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff5a00] hover:bg-[#ea5300] text-white font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={15} />
                        <span>Novo cliente</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <Card className="bg-white border-slate-200 shadow-xs">
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="p-10 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                            <p className="text-xs text-slate-400 mt-2">Carregando clientes diretos...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                            Nenhum cliente direto cadastrado.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-3 px-5">Empresa</th>
                                    <th className="py-3 px-4">Responsável</th>
                                    <th className="py-3 px-4">Instâncias (Uso/Cota)</th>
                                    <th className="py-3 px-4">Membros</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Criado em</th>
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
                                        <td className="py-3.5 px-4 text-slate-600">{c.membersCount}</td>
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
                                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                                            {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Cliente Direto</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Empresa cliente sem revendedor</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Empresa *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Farmácia Central"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nome do Responsável *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Pedro Souza"
                                    value={form.ownerName}
                                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
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
                                    placeholder="pedro@farmacia.com"
                                    value={form.ownerEmail}
                                    onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
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
                                    value={form.ownerPassword}
                                    onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Cota de Instâncias *
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={form.maxInstances}
                                    onChange={(e) =>
                                        setForm({ ...form, maxInstances: parseInt(e.target.value) || 1 })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowModal(false)}
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
