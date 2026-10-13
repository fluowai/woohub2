"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Users,
    Search,
    ArrowLeft,
    Shield,
    Briefcase,
    Building2,
    Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface ResellerClient {
    id: string;
    name: string;
    slug: string;
    status: string;
    maxInstances: number;
    sessionsCount: number;
    membersCount: number;
    reseller: {
        id: string;
        name: string;
        ownerName: string;
    };
    ownerName: string;
    ownerEmail: string;
    createdAt: string;
}

export default function ResellerClientsAuditPage() {
    const [clients, setClients] = useState<ResellerClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/mega-admin/reseller-clients");
            const data = await res.json();
            if (data.status) {
                setClients(data.data);
            }
        } catch (e) {
            toast.error("Erro ao carregar clientes dos revendedores");
        } finally {
            setLoading(false);
        }
    };

    const filtered = clients.filter(
        (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.reseller.name.toLowerCase().includes(search.toLowerCase()) ||
            c.ownerEmail.toLowerCase().includes(search.toLowerCase())
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
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">
                            Clientes dos Revendedores
                        </h1>
                        <p className="text-xs text-slate-500">
                            Auditoria global de empresas administradas por revendedores white label.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente ou revendedor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                        />
                    </div>
                </div>
            </div>

            {/* Privacy notice banner */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-2.5">
                    <Lock className="h-4 w-4 text-[#ff5a00] flex-shrink-0" />
                    <span>
                        <strong>Política de Privacidade:</strong> Dados operacionais e conversas privadas de clientes são
                        protegidos e não são expostos no painel global.
                    </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">Auditoria LGPD/ISO</span>
            </div>

            {/* Table */}
            <Card className="bg-white border-slate-200 shadow-xs">
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="p-10 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                            <p className="text-xs text-slate-400 mt-2">Carregando auditoria de clientes...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                            Nenhum cliente de revendedor encontrado.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-3 px-5">Empresa Cliente</th>
                                    <th className="py-3 px-4">Revendedor Responsável</th>
                                    <th className="py-3 px-4">Administrador</th>
                                    <th className="py-3 px-4">Instâncias Alocadas</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Data de Cadastro</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {filtered.map((c) => (
                                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="py-3.5 px-5 font-bold text-slate-900">{c.name}</td>
                                        <td className="py-3.5 px-4">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-semibold text-[11px] border border-orange-200/50">
                                                <Briefcase size={12} />
                                                {c.reseller.name}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <p className="text-slate-900 font-medium">{c.ownerName}</p>
                                            <p className="text-[11px] text-slate-400">{c.ownerEmail}</p>
                                        </td>
                                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                                            {c.sessionsCount} / {c.maxInstances}
                                        </td>
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
        </div>
    );
}
