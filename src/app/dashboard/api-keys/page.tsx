"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { KeyRound, Plus, Copy, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SCOPE_LABELS: Record<string, string> = {
    "instances:read": "Ler instâncias",
    "instances:write": "Gerenciar instâncias",
    "messages:read": "Ler mensagens",
    "messages:send": "Enviar mensagens",
    "contacts:read": "Ler contatos",
    "webhooks:read": "Ler webhooks",
    "webhooks:write": "Gerenciar webhooks",
};

const ALL_SCOPES = Object.keys(SCOPE_LABELS);

interface ApiKeyRow {
    id: string;
    publicId: string;
    name: string;
    display: string;
    scopes: string[];
    instanceId: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
}

function formatDate(value?: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKeyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [scopes, setScopes] = useState<string[]>([...ALL_SCOPES]);
    const [createdSecret, setCreatedSecret] = useState<{ key: string; name: string } | null>(null);
    const [revokeId, setRevokeId] = useState<string | null>(null);
    const [revoking, setRevoking] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/api-keys");
            const data = await res.json();
            if (res.ok && data.status) setKeys(data.data);
            else toast.error(data.message || "Não foi possível carregar as chaves de API");
        } catch {
            toast.error("Erro de conexão ao carregar as chaves de API");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCreate() {
        if (!name.trim()) {
            toast.error("Informe um nome para a chave");
            return;
        }
        if (scopes.length === 0) {
            toast.error("Selecione ao menos um escopo");
            return;
        }

        setCreating(true);
        try {
            const res = await fetch("/api/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    scopes,
                    expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
                }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                setCreatedSecret({ key: data.data.key, name: data.data.name });
                setShowCreate(false);
                setName("");
                setExpiresAt("");
                setScopes([...ALL_SCOPES]);
                toast.success("Chave de API criada");
                load();
            } else {
                toast.error(data.message || "Não foi possível criar a chave");
            }
        } catch {
            toast.error("Erro de conexão ao criar a chave");
        } finally {
            setCreating(false);
        }
    }

    async function handleRevoke() {
        if (!revokeId) return;
        setRevoking(true);
        try {
            const res = await fetch("/api/api-keys", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: revokeId }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success("Chave revogada");
                setRevokeId(null);
                load();
            } else {
                toast.error(data.message || "Não foi possível revogar a chave");
            }
        } catch {
            toast.error("Erro de conexão ao revogar a chave");
        } finally {
            setRevoking(false);
        }
    }

    async function copySecret(key: string) {
        try {
            await navigator.clipboard.writeText(key);
            toast.success("Chave copiada para a área de transferência");
        } catch {
            toast.error("Não foi possível copiar a chave");
        }
    }

    const activeKeys = keys.filter((k) => !k.revokedAt);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Chaves de API</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Credenciais da sua empresa para usar a API pública <code className="font-mono text-xs">/api/v1</code>.
                    </p>
                </div>
                <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4" /> Nova chave
                </Button>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4 text-primary" /> Resumo
                    </CardTitle>
                    <CardDescription>
                        As segredas são exibidas apenas uma vez, no momento da criação. Guarde-a em um cofre de senhas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Chaves ativas</p>
                        <p className="text-2xl font-extrabold text-foreground">{activeKeys.length}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Revogadas</p>
                        <p className="text-2xl font-extrabold text-foreground">{keys.length - activeKeys.length}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total</p>
                        <p className="text-2xl font-extrabold text-foreground">{keys.length}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base">Chaves da empresa</CardTitle>
                        <CardDescription>Escopos limitam o que cada chave pode fazer na API.</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">Carregando chaves…</p>
                    ) : keys.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="bg-muted h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <KeyRound className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 mb-1">Nenhuma chave de API</p>
                            <p className="text-xs text-slate-400">Crie a primeira chave para começar a integrar.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border/50">
                                        <th className="py-2 pr-4 font-bold">Nome</th>
                                        <th className="py-2 pr-4 font-bold">Chave</th>
                                        <th className="py-2 pr-4 font-bold">Escopos</th>
                                        <th className="py-2 pr-4 font-bold">Criada em</th>
                                        <th className="py-2 pr-4 font-bold">Último uso</th>
                                        <th className="py-2 font-bold">Status</th>
                                        <th className="py-2 font-bold" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {keys.map((k) => (
                                        <tr key={k.id} className="border-b border-border/30 last:border-0">
                                            <td className="py-3 pr-4 font-medium text-foreground">{k.name}</td>
                                            <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{k.display}</td>
                                            <td className="py-3 pr-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {k.scopes.map((s) => (
                                                        <Badge key={s} variant="secondary" className="text-[10px] font-mono">
                                                            {s}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(k.createdAt)}</td>
                                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(k.lastUsedAt)}</td>
                                            <td className="py-3 pr-4">
                                                {k.revokedAt ? (
                                                    <Badge variant="destructive">Revogada</Badge>
                                                ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                                                    <Badge variant="outline">Expirada</Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Ativa</Badge>
                                                )}
                                            </td>
                                            <td className="py-3 text-right">
                                                {!k.revokedAt && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => setRevokeId(k.id)}
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

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Nova chave de API</DialogTitle>
                        <DialogDescription>
                            A chave será exibida uma única vez após a criação.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="key-name">Nome</Label>
                            <Input
                                id="key-name"
                                placeholder="Produção, backend, integrador…"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="key-expiry">Validade (opcional)</Label>
                            <Input
                                id="key-expiry"
                                type="date"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Escopos</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {ALL_SCOPES.map((scope) => (
                                    <label
                                        key={scope}
                                        className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 transition-colors"
                                    >
                                        <Checkbox
                                            checked={scopes.includes(scope)}
                                            onCheckedChange={(checked) =>
                                                setScopes((prev) =>
                                                    checked ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope)
                                                )
                                            }
                                        />
                                        <span className="font-medium">{SCOPE_LABELS[scope]}</span>
                                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{scope}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                        <Button onClick={handleCreate} disabled={creating}>
                            {creating ? "Criando…" : "Criar chave"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!createdSecret} onOpenChange={(open) => !open && setCreatedSecret(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-amber-600">Chave criada</DialogTitle>
                        <DialogDescription>
                            Copie agora: esta segreda <strong>não será exibida novamente</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-2">{createdSecret?.name}</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 break-all font-mono text-xs text-foreground">{createdSecret?.key}</code>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 gap-2"
                                onClick={() => createdSecret && copySecret(createdSecret.key)}
                            >
                                <Copy className="h-4 w-4" /> Copiar
                            </Button>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setCreatedSecret(null)}>Entendi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revogar esta chave?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A chave deixará de funcionar imediatamente. Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevoke} disabled={revoking}>
                            {revoking ? "Revogando…" : "Revogar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
