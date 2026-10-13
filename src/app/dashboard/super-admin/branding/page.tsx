"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Palette,
    ArrowLeft,
    Save,
    Upload,
    Globe,
    Mail,
    Phone,
    HelpCircle,
    CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BrandingPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: "",
        logoUrl: "",
        faviconUrl: "",
        primaryColor: "#ff5a00",
        secondaryColor: "#1e293b",
        supportEmail: "",
        supportPhone: "",
        websiteUrl: "",
        documentationName: "",
    });

    useEffect(() => {
        fetchBranding();
    }, []);

    const fetchBranding = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/super-admin/branding");
            const data = await res.json();
            if (data.status && data.data) {
                setForm({
                    name: data.data.name || "",
                    logoUrl: data.data.logoUrl || "",
                    faviconUrl: data.data.faviconUrl || "",
                    primaryColor: data.data.primaryColor || "#ff5a00",
                    secondaryColor: data.data.secondaryColor || "#1e293b",
                    supportEmail: data.data.supportEmail || "",
                    supportPhone: data.data.supportPhone || "",
                    websiteUrl: data.data.websiteUrl || "",
                    documentationName: data.data.documentationName || "",
                });
            }
        } catch (e) {
            toast.error("Erro ao carregar dados de marca");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch("/api/super-admin/branding", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Identidade visual da sua revenda atualizada!");
            } else {
                toast.error(data.message || "Erro ao salvar");
            }
        } catch (err) {
            toast.error("Falha ao comunicar com o servidor");
        } finally {
            setSaving(false);
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
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Personalizar Minha Marca</h1>
                        <p className="text-xs text-slate-500">
                            Configure nome comercial, logotipos, cores e links da sua plataforma white label.
                        </p>
                    </div>
                </div>

                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[#ff5a00] hover:bg-[#ea5300] text-white text-xs font-semibold inline-flex items-center gap-2"
                >
                    <Save size={15} />
                    <span>{saving ? "Salvando..." : "Salvar Marca"}</span>
                </Button>
            </div>

            {loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ff5a00] border-t-transparent mx-auto" />
                    <p className="text-xs text-slate-400 mt-2">Carregando dados da marca...</p>
                </div>
            ) : (
                <form onSubmit={handleSave} className="space-y-6">
                    {/* Visual Identity Card */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Palette className="h-4 w-4 text-[#ff5a00]" />
                                <span>Identidade e Cores</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Nome Comercial da Plataforma *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Agência Alfa"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Este nome aparecerá nos cabeçalhos, e-mails e telas de login dos seus clientes.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        URL do Logotipo (PNG / SVG)
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://meusite.com/logo.png"
                                        value={form.logoUrl}
                                        onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        URL do Favicon (ICO / PNG)
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://meusite.com/favicon.png"
                                        value={form.faviconUrl}
                                        onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Cor Primária / Destaque
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={form.primaryColor}
                                            onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                                            className="h-9 w-12 rounded cursor-pointer border border-slate-200"
                                        />
                                        <input
                                            type="text"
                                            value={form.primaryColor}
                                            onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Nome para Documentação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: API Alfa Docs"
                                        value={form.documentationName}
                                        onChange={(e) => setForm({ ...form, documentationName: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Support & Commercial Contacts */}
                    <Card className="bg-white border-slate-200 shadow-xs">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Mail className="h-4 w-4 text-[#ff5a00]" />
                                <span>Canais de Atendimento e Suporte</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        E-mail de Suporte
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="suporte@minhaagencia.com"
                                        value={form.supportEmail}
                                        onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        WhatsApp / Telefone de Suporte
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="+55 11 99999-9999"
                                        value={form.supportPhone}
                                        onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Website Comercial
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://minhaagencia.com.br"
                                    value={form.websiteUrl}
                                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Legal Notice */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 shadow-xs flex items-center justify-between">
                        <span>
                            <strong>Termos e Licença:</strong> A personalização white label preserva os termos técnicos e
                            avisos legais exigidos pela plataforma base.
                        </span>
                        <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                    </div>
                </form>
            )}
        </div>
    );
}
