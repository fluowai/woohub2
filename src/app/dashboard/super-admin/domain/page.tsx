"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Globe,
    ArrowLeft,
    CheckCircle2,
    Clock,
    XCircle,
    Copy,
    RefreshCw,
    ExternalLink,
    AlertCircle,
    Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ResellerDomain {
    id: string;
    hostname: string;
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
}

const SSL_STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente",
    ISSUED: "Emitido",
    FAILED: "Falhou",
    EXTERNAL: "Externo",
};

export default function ResellerDomainPage() {
    const [domain, setDomain] = useState<ResellerDomain | null>(null);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [hostnameInput, setHostnameInput] = useState("");

    useEffect(() => {
        fetchDomain();
    }, []);

    const fetchDomain = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/super-admin/domain");
            const data = await res.json();
            if (data.status) {
                setDomain(data.data);
                if (data.data?.hostname) {
                    setHostnameInput(data.data.hostname);
                }
            }
        } catch (e) {
            toast.error("Erro ao carregar dados do domínio");
        } finally {
            setLoading(false);
        }
    };

    const handleRequestDomain = async (e: React.FormEvent) => {
        e.preventDefault();
        setRequesting(true);
        try {
            const res = await fetch("/api/super-admin/domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hostname: hostnameInput }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success(data.message || "Domínio solicitado com sucesso!");
                fetchDomain();
            } else {
                toast.error(data.message || "Falha ao solicitar domínio");
            }
        } catch (err) {
            toast.error("Erro ao comunicar com o servidor");
        } finally {
            setRequesting(false);
        }
    };

    const handleVerifyNow = async () => {
        setVerifying(true);
        try {
            const res = await fetch("/api/super-admin/domain/verify", {
                method: "POST",
            });
            const data = await res.json();
            if (data.status) {
                toast.success(data.message || "Domínio verificado com sucesso!");
                fetchDomain();
            } else {
                toast.error(data.message || "Verificação pendente");
            }
        } catch (err) {
            toast.error("Falha ao consultar verificação");
        } finally {
            setVerifying(false);
        }
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copiado para a área de transferência");
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
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Meu Domínio Próprio</h1>
                        <p className="text-xs text-slate-500">
                            Configure o endereço exclusivo da sua revenda para oferecer acesso aos seus clientes com certificado SSL.
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                    <p className="text-xs text-slate-400 mt-2">Carregando status do domínio...</p>
                </div>
            ) : domain ? (
                <div className="space-y-6">
                    {/* Domain Status Card */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Globe className="h-4 w-4 text-[#ff5a00]" />
                                <span>Status do Domínio</span>
                            </CardTitle>
                            <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    domain.status === "ACTIVE" || domain.status === "VERIFIED"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : domain.status === "PENDING_VERIFICATION"
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-red-50 text-red-700"
                                }`}
                            >
                                <span
                                    className={`h-2 w-2 rounded-full ${
                                        domain.status === "ACTIVE" || domain.status === "VERIFIED"
                                            ? "bg-emerald-500"
                                            : domain.status === "PENDING_VERIFICATION"
                                            ? "bg-amber-500"
                                            : "bg-red-500"
                                    }`}
                                />
                                {domain.status === "ACTIVE"
                                    ? "Ativo e Roteado"
                                    : domain.status === "VERIFIED"
                                    ? "Verificado (Aguardando SSL)"
                                    : domain.status === "PENDING_VERIFICATION"
                                    ? "Verificação Pendente"
                                    : "Falha na Verificação"}
                            </span>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                                <div>
                                    <p className="text-slate-500 text-[11px]">Hostname Configurado</p>
                                    <p className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                                        {domain.hostname}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-500 text-[11px]">Certificado SSL</p>
                                    <p className="font-semibold text-slate-800 text-xs mt-0.5">
                                        {SSL_STATUS_LABELS[domain.sslStatus] || domain.sslStatus}
                                    </p>
                                </div>
                            </div>

                            {domain.status === "PENDING_VERIFICATION" && (
                                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                                    <div className="flex items-start gap-2 text-amber-800 font-medium">
                                        <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                        <span>Configure as seguintes entradas no seu provedor DNS para ativar seu domínio:</span>
                                    </div>

                                    {/* TXT Challenge */}
                                    <div className="bg-white p-3 rounded-lg border border-amber-200 space-y-2">
                                        <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider block">
                                            1. Registro TXT (Confirmação de Titularidade)
                                        </span>
                                        <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]">
                                            <span className="truncate">
                                                <span className="text-slate-400">Nome: </span>
                                                _woohub-challenge.{domain.hostname}
                                            </span>
                                            <button
                                                onClick={() => copyText(`_woohub-challenge.${domain.hostname}`)}
                                                className="p-1 hover:text-[#ff5a00]"
                                            >
                                                <Copy size={13} />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]">
                                            <span className="truncate">
                                                <span className="text-slate-400">Valor TXT: </span>
                                                {domain.verificationToken}
                                            </span>
                                            <button
                                                onClick={() => copyText(domain.verificationToken)}
                                                className="p-1 hover:text-[#ff5a00]"
                                            >
                                                <Copy size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* CNAME */}
                                    <div className="bg-white p-3 rounded-lg border border-amber-200 space-y-2">
                                        <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider block">
                                            2. Registro CNAME (Roteamento de Tráfego)
                                        </span>
                                        <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]">
                                            <span>
                                                <span className="text-slate-400">Destino CNAME: </span>
                                                proxy.woohub.app
                                            </span>
                                            <button
                                                onClick={() => copyText("proxy.woohub.app")}
                                                className="p-1 hover:text-[#ff5a00]"
                                            >
                                                <Copy size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <Button
                                            onClick={handleVerifyNow}
                                            disabled={verifying}
                                            size="sm"
                                            className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold inline-flex items-center gap-2"
                                        >
                                            <RefreshCw size={13} className={verifying ? "animate-spin" : ""} />
                                            <span>{verifying ? "Verificando DNS..." : "Verificar Apontamento Agora"}</span>
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {domain.status === "ACTIVE" && (
                                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                                        <div>
                                            <p className="font-bold text-emerald-900">Domínio Ativo e Operacional</p>
                                            <p className="text-[11px] text-emerald-700 mt-0.5">
                                                Seus clientes já podem acessar https://{domain.hostname} com isolamento total.
                                            </p>
                                        </div>
                                    </div>
                                    <a
                                        href={`https://${domain.hostname}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
                                    >
                                        <span>Abrir Painel</span>
                                        <ExternalLink size={13} />
                                    </a>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <Card className="bg-white border-slate-200 shadow-xs">
                    <CardHeader className="p-5 pb-3 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Globe className="h-4 w-4 text-[#ff5a00]" />
                            <span>Solicitar Novo Domínio</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5">
                        <form onSubmit={handleRequestDomain} className="space-y-4 max-w-md text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Hostname Desejado *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="api.minhaagencia.com.br"
                                    value={hostnameInput}
                                    onChange={(e) => setHostnameInput(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Informe apenas o hostname sem http:// ou caminhos.
                                </p>
                            </div>

                            <Button
                                type="submit"
                                disabled={requesting}
                                size="sm"
                                className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold"
                            >
                                {requesting ? "Solicitando..." : "Solicitar Domínio"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
