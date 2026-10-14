"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Globe,
    Plus,
    Search,
    ArrowLeft,
    CheckCircle2,
    Clock,
    XCircle,
    Shield,
    ExternalLink,
    RefreshCw,
    X,
    Copy,
    AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DomainRecord {
    id: string;
    hostname: string;
    type: "PLATFORM" | "RESELLER";
    status: "PENDING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "FAILED" | "SUSPENDED";
    verificationToken: string;
    verifiedAt: string | null;
    sslStatus: string;
    dnsInstructions: {
        recordType: string;
        name: string;
        target: string;
        instructions: string;
    } | null;
    reseller: {
        id: string;
        name: string;
    } | null;
    createdAt: string;
}

const SSL_STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente",
    ISSUED: "Emitido",
    FAILED: "Falhou",
    EXTERNAL: "Externo",
};

export default function DomainsAdminPage() {
    const [domains, setDomains] = useState<DomainRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    // Modal state for register
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [registerForm, setRegisterForm] = useState({
        hostname: "",
        type: "PLATFORM",
        resellerId: "",
    });
    const [submitting, setSubmitting] = useState(false);

    // Instructions modal
    const [selectedDomain, setSelectedDomain] = useState<DomainRecord | null>(null);

    useEffect(() => {
        fetchDomains();
    }, []);

    const fetchDomains = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/mega-admin/domains");
            const data = await res.json();
            if (data.status) {
                setDomains(data.data);
            }
        } catch (e) {
            toast.error("Erro ao buscar domínios");
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (domain: DomainRecord) => {
        setVerifyingId(domain.id);
        try {
            const res = await fetch(`/api/mega-admin/domains/${domain.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify" }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success(data.message || "Domínio verificado com sucesso!");
                fetchDomains();
            } else {
                toast.error(data.message || "Falha na verificação DNS");
            }
        } catch (err) {
            toast.error("Erro ao processar verificação");
        } finally {
            setVerifyingId(null);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/mega-admin/domains", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(registerForm),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Domínio cadastrado no catálogo!");
                setShowRegisterModal(false);
                setRegisterForm({ hostname: "", type: "PLATFORM", resellerId: "" });
                fetchDomains();
            } else {
                toast.error(data.message || "Erro ao cadastrar domínio");
            }
        } catch (err) {
            toast.error("Erro ao enviar dados");
        } finally {
            setSubmitting(false);
        }
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copiado para a área de transferência");
    };

    const filtered = domains.filter(
        (d) =>
            d.hostname.toLowerCase().includes(search.toLowerCase()) ||
            (d.reseller?.name || "").toLowerCase().includes(search.toLowerCase())
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
                            Catálogo Global de Domínios
                        </h1>
                        <p className="text-xs text-slate-500">
                            Roteamento seguro por host, instruções DNS TXT e certificados SSL para a plataforma e revendas.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar hostname..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                        />
                    </div>
                    <button
                        onClick={() => setShowRegisterModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff5a00] hover:bg-[#ea5300] text-white font-medium text-xs shadow-xs transition-colors"
                    >
                        <Plus size={15} />
                        <span>Novo domínio</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <Card className="bg-white border-slate-200 shadow-xs">
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="p-10 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                            <p className="text-xs text-slate-400 mt-2">Carregando catálogo de domínios...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                            Nenhum domínio cadastrado.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-3 px-5">Hostname</th>
                                    <th className="py-3 px-4">Tipo</th>
                                    <th className="py-3 px-4">Revendedor Vinculado</th>
                                    <th className="py-3 px-4">Status DNS</th>
                                    <th className="py-3 px-4">SSL</th>
                                    <th className="py-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {filtered.map((d) => (
                                    <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="py-3.5 px-5">
                                            <div className="flex items-center gap-2">
                                                <Globe className="h-4 w-4 text-[#ff5a00] flex-shrink-0" />
                                                <span className="font-mono text-xs font-bold text-slate-900">
                                                    {d.hostname}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    d.type === "PLATFORM"
                                                        ? "bg-slate-100 text-slate-800"
                                                        : "bg-orange-100 text-orange-800"
                                                }`}
                                            >
                                                {d.type === "PLATFORM" ? "Plataforma" : "Revendedor"}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                                            {d.reseller?.name || "Global (Mega Admin)"}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                                    d.status === "ACTIVE" || d.status === "VERIFIED"
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : d.status === "PENDING_VERIFICATION"
                                                        ? "bg-amber-50 text-amber-700"
                                                        : "bg-red-50 text-red-700"
                                                }`}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${
                                                        d.status === "ACTIVE" || d.status === "VERIFIED"
                                                            ? "bg-emerald-500"
                                                            : d.status === "PENDING_VERIFICATION"
                                                            ? "bg-amber-500"
                                                            : "bg-red-500"
                                                    }`}
                                                />
                                                {d.status === "ACTIVE"
                                                    ? "Ativo"
                                                    : d.status === "VERIFIED"
                                                    ? "Verificado"
                                                    : d.status === "PENDING_VERIFICATION"
                                                    ? "Pendente"
                                                    : "Falhou"}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                                            {SSL_STATUS_LABELS[d.sslStatus] || d.sslStatus}
                                        </td>
                                        <td className="py-3.5 px-4 text-right space-x-2">
                                            <button
                                                onClick={() => setSelectedDomain(d)}
                                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                                            >
                                                Instruções DNS
                                            </button>
                                            {d.status === "PENDING_VERIFICATION" && (
                                                <button
                                                    onClick={() => handleVerify(d)}
                                                    disabled={verifyingId === d.id}
                                                    className="px-2.5 py-1 rounded bg-orange-50 hover:bg-orange-100 text-[#ff5a00] font-semibold text-[11px] transition-colors inline-flex items-center gap-1"
                                                >
                                                    <RefreshCw
                                                        size={11}
                                                        className={verifyingId === d.id ? "animate-spin" : ""}
                                                    />
                                                    <span>{verifyingId === d.id ? "Checando..." : "Verificar"}</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {/* Modal: Instruções DNS */}
            {selectedDomain && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Instruções de Apontamento DNS</h3>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedDomain.hostname}</p>
                            </div>
                            <button
                                onClick={() => setSelectedDomain(null)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-xs">
                            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                                        1. Desafio de Titularidade (Registro TXT)
                                    </span>
                                    <div className="mt-1 flex items-center justify-between p-2 rounded bg-white border border-slate-200 font-mono text-[11px]">
                                        <div className="truncate">
                                            <span className="text-slate-500">Nome: </span>
                                            <strong>_woohub-challenge.{selectedDomain.hostname}</strong>
                                        </div>
                                        <button
                                            onClick={() => copyText(`_woohub-challenge.${selectedDomain.hostname}`)}
                                            className="p-1 hover:text-[#ff5a00]"
                                        >
                                            <Copy size={13} />
                                        </button>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between p-2 rounded bg-white border border-slate-200 font-mono text-[11px]">
                                        <div className="truncate">
                                            <span className="text-slate-500">Valor TXT: </span>
                                            <strong>{selectedDomain.verificationToken}</strong>
                                        </div>
                                        <button
                                            onClick={() => copyText(selectedDomain.verificationToken)}
                                            className="p-1 hover:text-[#ff5a00]"
                                        >
                                            <Copy size={13} />
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-200">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                                        2. Apontamento de Roteamento (Registro CNAME)
                                    </span>
                                    <div className="mt-1 flex items-center justify-between p-2 rounded bg-white border border-slate-200 font-mono text-[11px]">
                                        <div>
                                            <span className="text-slate-500">CNAME para: </span>
                                            <strong>proxy.woohub.app</strong>
                                        </div>
                                        <button
                                            onClick={() => copyText("proxy.woohub.app")}
                                            className="p-1 hover:text-[#ff5a00]"
                                        >
                                            <Copy size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                                <span>
                                    Após configurar a entrada TXT no provedor DNS (Cloudflare, GoDaddy, Registro.br), clique
                                    em "Verificar". A propagação pode levar alguns minutos.
                                </span>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedDomain(null)}
                                    className="text-xs"
                                >
                                    Fechar
                                </Button>
                                {selectedDomain.status === "PENDING_VERIFICATION" && (
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            handleVerify(selectedDomain);
                                            setSelectedDomain(null);
                                        }}
                                        size="sm"
                                        className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                                    >
                                        Verificar Agora
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Cadastrar Domínio */}
            {showRegisterModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Novo Domínio na Plataforma</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Cadastre um hostname para verificação DNS.</p>
                            </div>
                            <button
                                onClick={() => setShowRegisterModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleRegister} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Hostname FQDN *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="api.meudominio.com.br"
                                    value={registerForm.hostname}
                                    onChange={(e) => setRegisterForm({ ...registerForm, hostname: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Não inclua http:// ou barras. Apenas o hostname (RFC 1123).
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Uso</label>
                                <select
                                    value={registerForm.type}
                                    onChange={(e) => setRegisterForm({ ...registerForm, type: e.target.value })}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                >
                                    <option value="PLATFORM">Domínio Principal da Plataforma</option>
                                    <option value="RESELLER">Domínio de Revendedor White Label</option>
                                </select>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowRegisterModal(false)}
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
                                    {submitting ? "Cadastrando..." : "Cadastrar Domínio"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
