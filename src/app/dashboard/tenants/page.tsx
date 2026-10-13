"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Building2, Ban, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TenantRow {
    id: string;
    slug: string;
    name: string;
    status: string;
    createdAt: string;
    _count?: { members?: number; sessions?: number; subscriptions?: number };
}

const statusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "ACTIVE" ? "default" : s === "SUSPENDED" ? "destructive" : "secondary";

export default function TenantsPage() {
    const [tenants, setTenants] = useState<TenantRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", slug: "" });
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const fetchTenants = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/tenants");
            if (res.status === 403) { toast.error("Acesso restrito ao SUPERADMIN."); return; }
            if (!res.ok) { toast.error("Falha ao carregar empresas."); return; }
            const json = await res.json();
            setTenants(json.data || []);
        } catch {
            toast.error("Falha ao carregar empresas.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTenants(); }, [fetchTenants]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/tenants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const json = await res.json();
            if (res.ok) {
                toast.success("Empresa criada.");
                setForm({ name: "", slug: "" });
                setShowForm(false);
                fetchTenants();
            } else {
                toast.error(json.message || "Falha ao criar empresa.");
            }
        } catch {
            toast.error("Falha ao criar empresa.");
        }
    };

    const toggleStatus = async (t: TenantRow) => {
        const next = t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        try {
            const res = await fetch(`/api/tenants/${t.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: next }),
            });
            if (res.ok) {
                toast.success(next === "ACTIVE" ? "Empresa reativada." : "Empresa suspensa.");
                fetchTenants();
            } else {
                toast.error("Falha ao alterar status.");
            }
        } catch {
            toast.error("Falha ao alterar status.");
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const res = await fetch(`/api/tenants/${deleteId}`, { method: "DELETE" });
            if (res.ok) { toast.success("Empresa excluída."); fetchTenants(); }
            else { toast.error("Falha ao excluir empresa."); }
        } catch {
            toast.error("Falha ao excluir empresa.");
        } finally {
            setDeleteId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-primary" /> Empresas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Multi-tenant: cada empresa tem suas próprias instâncias, usuários e assinatura.
                    </p>
                </div>
                <Button onClick={() => setShowForm((v) => !v)}>
                    <Plus className="h-4 w-4 mr-2" /> Nova empresa
                </Button>
            </div>

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Criar empresa</CardTitle>
                        <CardDescription>O slug é usado em URLs e deve ser único (minúsculas, hífens).</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                                <Label htmlFor="t-name">Nome</Label>
                                <Input id="t-name" required value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Minha Empresa Ltda" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="t-slug">Slug</Label>
                                <Input id="t-slug" required pattern="^[a-z0-9\\-]+$" value={form.slug}
                                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                    placeholder="minha-empresa" />
                            </div>
                            <div className="flex items-end gap-2">
                                <Button type="submit" className="flex-1">Criar</Button>
                                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Lista</CardTitle>
                    <CardDescription>{loading ? "Carregando…" : `${tenants.length} empresa(s)`}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Slug</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Membros</TableHead>
                                <TableHead>Instâncias</TableHead>
                                <TableHead>Criada em</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tenants.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        {loading ? "Carregando…" : "Nenhuma empresa cadastrada."}
                                    </TableCell>
                                </TableRow>
                            )}
                            {tenants.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-medium">{t.name}</TableCell>
                                    <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                                    </TableCell>
                                    <TableCell>{t._count?.members ?? 0}</TableCell>
                                    <TableCell>{t._count?.sessions ?? 0}</TableCell>
                                    <TableCell className="text-xs">
                                        {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => toggleStatus(t)}
                                                title={t.status === "ACTIVE" ? "Suspender" : "Reativar"}>
                                                {t.status === "ACTIVE"
                                                    ? <><Ban className="h-3.5 w-3.5 mr-1" /> Suspender</>
                                                    : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Reativar</>}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => setDeleteId(t.id)}
                                                title="Excluir definitivamente">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação é definitiva e remove em cascata instâncias, contatos, mensagens e
                            assinaturas da empresa. Prefira <strong>Suspender</strong> quando quiser apenas
                            bloquear o acesso.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
