"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save, AlertCircle, Bell, Clock, Layers, Shield, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { WooTechLogo } from "@/components/ui/wootech-logo";

export default function SettingsPage() {
    const { data: authSession } = useSession();
    const isSuperAdmin = (authSession?.user as any)?.role === "SUPERADMIN";

    const [systemConfig, setSystemConfig] = useState({
        appName: "Woohub",
        logoUrl: "",
        timezone: "America/Sao_Paulo",
        enableRegistration: true
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "America/Sao_Paulo", "America/Fortaleza", "America/Manaus"]);

    useEffect(() => {
        try {
            if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
                const list = Intl.supportedValuesOf("timeZone");
                if (!list.includes("UTC")) {
                    list.push("UTC");
                }
                list.sort();
                setTimezones(list);
            }
        } catch (e) {
            console.error("Falha ao carregar os fusos horários dinamicamente", e);
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setSystemConfig({
                        appName: data.appName || "Woohub",
                        logoUrl: data.logoUrl || "",
                        // @ts-ignore
                        faviconUrl: data.faviconUrl || "/favicon.ico",
                        timezone: data.timezone || "America/Sao_Paulo",
                        enableRegistration: data.enableRegistration !== undefined ? data.enableRegistration : true
                    });
                }
            })
            .catch(() => { });
    }, []);

    const handleSaveSystem = async () => {
        setSystemLoading(true);
        try {
            const res = await fetch('/api/settings/system', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemConfig)
            });

            if (res.ok) {
                toast.success("Configurações do sistema atualizadas. Recarregue a página para ver as mudanças.");
            } else {
                toast.error("Falha ao atualizar as configurações do sistema.");
            }
        } catch (e) {
            console.error(e);
            toast.error("Erro ao salvar as configurações do sistema.");
        } finally {
            setSystemLoading(false);
        }
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    const userName = authSession?.user?.name || "Mega Admin";
    const userEmail = authSession?.user?.email || "admin@wootech.com.br";

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header matching Screen 8 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        Configurações
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Personalize sua conta e preferências.
                    </p>
                </div>
            </div>

            {/* Dados da conta Card matching Screen 8 */}
            <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Dados da conta
                </h2>
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
                            <WooTechLogo variant="icon" iconSize={28} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">{userName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{userEmail}</p>
                        </div>
                    </div>
                    <Button className="bg-[#FF6600] hover:bg-[#FF5500] text-white font-bold rounded-xl text-xs h-9 px-4 shadow-md shadow-orange-500/20 self-start sm:self-auto">
                        Gerenciar plano
                    </Button>
                </div>
            </div>

            {/* Preferências Section matching Screen 8 */}
            <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Preferências
                </h2>
                <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 shadow-xs overflow-hidden">
                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                                <Bell className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">Notificações</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Configure como receber notificações</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>

                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                                <Clock className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">Horário de atendimento</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Defina o horário de funcionamento</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>

                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                                <Layers className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">Integrações</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Conecte outras ferramentas</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>

                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                                <Shield className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">Segurança</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Gerencie acessos e permissões</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                </div>
            </div>

            {!isSuperAdmin && (
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-yellow-900">Modo somente leitura</p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    Apenas superadministradores podem modificar as configurações do sistema.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* System Configuration (Global) */}
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-xl">Configuração do aplicativo</CardTitle>
                    <CardDescription>Ajustes globais de marca e controle de acesso da plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Nome do aplicativo</Label>
                            <input
                                className={inputClass}
                                placeholder="Woohub"
                                value={systemConfig.appName}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, appName: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">Altera o nome exibido na barra lateral e no título do navegador.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label>Fuso horário</Label>
                            <select
                                className={inputClass}
                                value={systemConfig.timezone}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, timezone: e.target.value }))}
                                disabled={!isSuperAdmin}
                            >
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">O agendador usa este fuso horário.</p>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>URL do logotipo</Label>
                            <input
                                className={inputClass}
                                placeholder="https://example.com/logo.png"
                                value={systemConfig.logoUrl}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL do logotipo principal do painel.</p>
                        </div>
                        <div className="grid gap-2">
                            <Label>URL do favicon</Label>
                            <input
                                className={inputClass}
                                placeholder="/favicon.ico"
                                value={(systemConfig as any).faviconUrl || ""}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, faviconUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL do ícone da aba do navegador.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between space-x-2 pt-2 border-t border-border/50">
                        <Label htmlFor="enable-registration" className="flex flex-col space-y-1">
                            <span>Habilitar cadastro de novos usuários</span>
                            <span className="font-normal text-xs text-muted-foreground">Permite que novos usuários se cadastrem. Desative para manter a plataforma privada.</span>
                        </Label>
                        <Switch
                            id="enable-registration"
                            checked={systemConfig.enableRegistration}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, enableRegistration: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Salvar configuração
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* System Updates */}
            <Card>
                <CardHeader>
                    <CardTitle>Atualizações do sistema</CardTitle>
                    <CardDescription>Verifica a versão mais recente no GitHub.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                            setSystemLoading(true);
                            try {
                                const res = await fetch("/api/system/check-updates", { method: "POST" });
                                const data = await res.json();
                                if (data.status) {
                                    toast.success(data.message || "Verificação concluída!");
                                } else {
                                    toast.error(data.message || "Falha ao verificar atualizações.");
                                }
                            } catch (e) {
                                toast.error("Erro ao verificar atualizações.");
                            } finally {
                                setSystemLoading(false);
                            }
                        }}
                        disabled={systemLoading}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${systemLoading ? 'animate-spin' : ''}`} />
                        Verificar atualizações
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
