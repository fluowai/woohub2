"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, UserPlus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    STAFF: "Equipe",
    BILLING: "Cobrança",
};

const ADDABLE_ROLES = ["ADMIN", "STAFF", "BILLING"] as const;

interface MemberRow {
    id: string;
    role: string;
    createdAt: string;
    user: {
        id: string;
        name: string | null;
        email: string;
        createdAt: string;
    };
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function TeamPage() {
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [adding, setAdding] = useState(false);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<string>("STAFF");
    const [removeId, setRemoveId] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/tenants/members");
            const data = await res.json();
            if (res.ok && data.status) setMembers(data.data);
            else toast.error(data.message || "Não foi possível carregar os membros");
        } catch {
            toast.error("Erro de conexão ao carregar os membros");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleAdd() {
        if (!email.trim()) {
            toast.error("Informe o e-mail do usuário");
            return;
        }
        setAdding(true);
        try {
            const res = await fetch("/api/tenants/members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success("Membro adicionado à empresa");
                setShowAdd(false);
                setEmail("");
                setRole("STAFF");
                load();
            } else {
                toast.error(data.message || "Não foi possível adicionar o membro");
            }
        } catch {
            toast.error("Erro de conexão ao adicionar o membro");
        } finally {
            setAdding(false);
        }
    }

    async function handleRemove() {
        if (!removeId) return;
        setRemoving(true);
        try {
            const res = await fetch(`/api/tenants/members/${removeId}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success("Membro removido");
                setRemoveId(null);
                load();
            } else {
                toast.error(data.message || "Não foi possível remover o membro");
            }
        } catch {
            toast.error("Erro de conexão ao remover o membro");
        } finally {
            setRemoving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Equipe</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Usuários com acesso à empresa e suas permissões internas.
                    </p>
                </div>
                <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
                    <UserPlus className="h-4 w-4" /> Adicionar membro
                </Button>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4 text-primary" /> Membros da empresa
                        </CardTitle>
                        <CardDescription>
                            O usuário já precisa ter uma conta na plataforma para ser adicionado.
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">Carregando membros…</p>
                    ) : members.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="bg-muted h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Users className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 mb-1">Nenhum membro encontrado</p>
                            <p className="text-xs text-slate-400">Adicione colegas para compartilhar o acesso.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border/50">
                                        <th className="py-2 pr-4 font-bold">Nome</th>
                                        <th className="py-2 pr-4 font-bold">E-mail</th>
                                        <th className="py-2 pr-4 font-bold">Função</th>
                                        <th className="py-2 pr-4 font-bold">Entrou em</th>
                                        <th className="py-2 font-bold" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((m) => (
                                        <tr key={m.id} className="border-b border-border/30 last:border-0">
                                            <td className="py-3 pr-4 font-medium text-foreground">{m.user.name || "—"}</td>
                                            <td className="py-3 pr-4 text-muted-foreground">{m.user.email}</td>
                                            <td className="py-3 pr-4">
                                                <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>
                                                    {ROLE_LABELS[m.role] || m.role}
                                                </Badge>
                                            </td>
                                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(m.createdAt)}</td>
                                            <td className="py-3 text-right">
                                                {m.role !== "OWNER" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => setRemoveId(m.user.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Adicionar membro</DialogTitle>
                        <DialogDescription>
                            A pessoa precisa já possuir uma conta cadastrada na plataforma.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="member-email">E-mail</Label>
                            <Input
                                id="member-email"
                                type="email"
                                placeholder="nome@empresa.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Função</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ADDABLE_ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {role === "ADMIN"
                                    ? "Gerencia instâncias, mensagens, membros e chaves de API."
                                    : role === "BILLING"
                                        ? "Acesso somente a planos, assinatura e uso."
                                        : "Operação do dia a dia: instâncias, mensagens e webhooks."}
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
                        <Button onClick={handleAdd} disabled={adding}>
                            {adding ? "Adicionando…" : "Adicionar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover este membro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O acesso da pessoa à empresa será revogado imediatamente. Você pode adicioná-lo novamente depois.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} disabled={removing}>
                            {removing ? "Removendo…" : "Remover"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
