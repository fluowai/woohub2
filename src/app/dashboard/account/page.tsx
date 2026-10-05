"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, User, Lock } from "lucide-react";

interface ProfileData {
    id: string;
    name: string | null;
    email: string | null;
    createdAt: string;
    updatedAt: string;
}

export default function AccountPage() {
    const { data: session, update } = useSession();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [changingPw, setChangingPw] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/user/profile");
            const data = await res.json();
            if (res.ok && data.status) {
                setProfile(data.data);
                setName(data.data.name || "");
                setEmail(data.data.email || "");
            } else {
                toast.error(data.message || "Não foi possível carregar o perfil");
            }
        } catch {
            toast.error("Erro de conexão ao carregar perfil");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleUpdateProfile() {
        if (!profile) return;
        setSaving(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() || undefined }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                setProfile(data.data);
                toast.success("Perfil atualizado");
                if (data.data.email && data.data.email !== profile.email) {
                    await update({ email: data.data.email });
                }
            } else {
                toast.error(data.message || "Não foi possível atualizar o perfil");
            }
        } catch {
            toast.error("Erro de conexão ao atualizar perfil");
        } finally {
            setSaving(false);
        }
    }

    async function handleChangePassword() {
        if (!currentPw || !newPw) {
            toast.error("Preencha todos os campos de senha");
            return;
        }
        if (newPw.length < 8) {
            toast.error("A nova senha deve ter pelo menos 8 caracteres");
            return;
        }
        setChangingPw(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success("Senha alterada com sucesso");
                setCurrentPw("");
                setNewPw("");
            } else {
                toast.error(data.message || "Não foi possível alterar a senha");
            }
        } catch {
            toast.error("Erro de conexão ao alterar senha");
        } finally {
            setChangingPw(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Não foi possível carregar o perfil.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Minha conta</h2>
                <p className="text-sm text-slate-500 mt-1">
                    Gerencie suas informações de acesso e senha.
                </p>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <User className="h-4 w-4 text-primary" /> Dados de acesso
                    </CardTitle>
                    <CardDescription>Nome e e-mail usados para entrar na plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
                    </div>
                    <Button onClick={handleUpdateProfile} disabled={saving} className="gap-2">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Salvar alterações
                    </Button>
                </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Lock className="h-4 w-4 text-primary" /> Alterar senha
                    </CardTitle>
                    <CardDescription>Escolha uma senha forte com pelo menos 8 caracteres.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="current-password">Senha atual</Label>
                        <Input id="current-password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Nova senha</Label>
                        <Input id="new-password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                    </div>
                    <Button onClick={handleChangePassword} disabled={changingPw} className="gap-2">
                        {changingPw && <Loader2 className="h-4 w-4 animate-spin" />}
                        Alterar senha
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
