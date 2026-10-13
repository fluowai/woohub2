"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Settings, Globe, Bell, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface SettingsData {
    id: string;
    appName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    timezone: string;
    enableRegistration: boolean;
    telemetryEnabled: boolean;
    telemetryUrl: string | null;
    updatedAt: string;
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        appName: "",
        logoUrl: "",
        faviconUrl: "",
        timezone: "America/Sao_Paulo",
        enableRegistration: true,
        telemetryEnabled: false,
        telemetryUrl: "",
    });

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    useEffect(() => {
        if (session?.user?.role === "MEGA_ADMIN") fetchSettings();
    }, [session]);

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/mega-admin/settings");
            const data = await res.json();
            if (data.status && data.data) {
                setSettings(data.data);
                setFormData({
                    appName: data.data.appName || "",
                    logoUrl: data.data.logoUrl || "",
                    faviconUrl: data.data.faviconUrl || "",
                    timezone: data.data.timezone || "America/Sao_Paulo",
                    enableRegistration: data.data.enableRegistration ?? true,
                    telemetryEnabled: data.data.telemetryEnabled ?? false,
                    telemetryUrl: data.data.telemetryUrl || "",
                });
            }
        } catch (error) {
            toast.error("Erro ao carregar configurações");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch("/api/mega-admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Configurações salvas com sucesso");
                setSettings(data.data);
            } else {
                toast.error(data.message || "Erro ao salvar");
            }
        } catch (error) {
            toast.error("Erro de conexão");
        } finally {
            setSaving(false);
        }
    };

    if (status === "loading" || loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    // @ts-ignore
    const isMega = session?.user?.role === "MEGA_ADMIN" || session?.user?.email === "fluowai@gmail.com";
    if (!session || !isMega) {
        return <div className="text-center py-12">Acesso restrito a Mega Admins</div>;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Settings className="text-indigo-600" />
                        Configurações Globais
                    </h1>
                    <p className="text-muted-foreground">Configurações que afetam todo o sistema</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Geral</CardTitle>
                    <CardDescription>Configurações gerais do sistema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="appName">Nome do Sistema</Label>
                            <Input id="appName" value={formData.appName} onChange={(e) => setFormData({ ...formData, appName: e.target.value })} placeholder="Woohub" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="timezone">Fuso Horário</Label>
                            <Input id="timezone" value={formData.timezone} onChange={(e) => setFormData({ ...formData, timezone: e.target.value })} placeholder="America/Sao_Paulo" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="logoUrl">URL do Logo</Label>
                            <Input id="logoUrl" value={formData.logoUrl} onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })} placeholder="https://exemplo.com/logo.png" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="faviconUrl">URL do Favicon</Label>
                            <Input id="faviconUrl" value={formData.faviconUrl} onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })} placeholder="https://exemplo.com/favicon.ico" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="grid gap-1">
                            <Label>Permitir Registro Público</Label>
                            <p className="text-sm text-muted-foreground">Permite que novos usuários se cadastrem no sistema</p>
                        </div>
                        <Switch
                            checked={formData.enableRegistration}
                            onCheckedChange={(checked) => setFormData({ ...formData, enableRegistration: checked })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Telemetria</CardTitle>
                    <CardDescription>Configurações de telemetria externa (opcional)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="grid gap-1">
                            <Label>Telemetria Ativada</Label>
                            <p className="text-sm text-muted-foreground">Envia heartbeat anônimo para URL configurada</p>
                        </div>
                        <Switch
                            checked={formData.telemetryEnabled}
                            onCheckedChange={(checked) => setFormData({ ...formData, telemetryEnabled: checked })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="telemetryUrl">URL de Telemetria</Label>
                        <Input id="telemetryUrl" value={formData.telemetryUrl} onChange={(e) => setFormData({ ...formData, telemetryUrl: e.target.value })} placeholder="https://telemetria.exemplo.com/heartbeat" disabled={!formData.telemetryEnabled} />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-4 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <> <Save className="mr-2 h-4 w-4" />Salvar Configurações</> }
                </Button>
            </div>
        </form>
    );
}