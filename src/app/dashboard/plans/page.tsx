"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

interface PlanRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    period: string;
    maxInstances: number;
    maxUsers: number;
    requestLimit: number;
    sendLimit: number;
    storageLimitMb: number;
    retentionDays: number;
    status: string;
    sort: number;
}

const emptyForm = {
    code: "", name: "", description: "", priceBrl: "0", period: "MONTHLY",
    maxInstances: "1", maxUsers: "1", requestLimit: "1000", sendLimit: "500",
    storageLimitMb: "100", retentionDays: "30", sort: "0",
};

const brl = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PlansPage() {
    const [plans, setPlans] = useState<PlanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyForm });

    const fetchPlans = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/plans?all=1");
            if (res.status === 403) { toast.error("Acesso restrito ao SUPERADMIN."); return; }
            if (!res.ok) { toast.error("Falha ao carregar planos."); return; }
            const json = await res.json();
            setPlans(json.data || []);
        } catch {
            toast.error("Falha ao carregar planos.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    const openEdit = (p: PlanRow) => {
        setEditingId(p.id);
        setForm({
            code: p.code, name: p.name, description: p.description || "",
            priceBrl: String(p.priceCents / 100), period: p.period,
            maxInstances: String(p.maxInstances), maxUsers: String(p.maxUsers),
            requestLimit: String(p.requestLimit), sendLimit: String(p.sendLimit),
            storageLimitMb: String(p.storageLimitMb), retentionDays: String(p.retentionDays),
            sort: String(p.sort),
        });
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const priceCents = Math.round(parseFloat(form.priceBrl.replace(",", ".")) * 100);
        if (!Number.isFinite(priceCents) || priceCents < 0) {
            toast.error("Preço inválido.");
            return;
        }
        const payload = {
            name: form.name,
            description: form.description || null,
            priceCents,
            period: form.period,
            maxInstances: Number(form.maxInstances),
            maxUsers: Number(form.maxUsers),
            requestLimit: Number(form.requestLimit),
            sendLimit: Number(form.sendLimit),
            storageLimitMb: Number(form.storageLimitMb),
            retentionDays: Number(form.retentionDays),
            sort: Number(form.sort),
        };
        try {
            let res: Response;
            if (editingId) {
                res = await fetch(`/api/plans/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch("/api/plans", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, code: form.code }),
                });
            }
            const json = await res.json();
            if (res.ok) {
                toast.success(editingId ? "Plano atualizado." : "Plano criado.");
                setShowForm(false);
                setEditingId(null);
                setForm({ ...emptyForm });
                fetchPlans();
            } else {
                toast.error(json.message || "Falha ao salvar plano.");
            }
        } catch {
            toast.error("Falha ao salvar plano.");
        }
    };

    const toggleStatus = async (p: PlanRow) => {
        const next = p.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
        try {
            const res = await fetch(`/api/plans/${p.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: next }),
            });
            if (res.ok) {
                toast.success(next === "ACTIVE" ? "Plano reativado." : "Plano arquivado.");
                fetchPlans();
            } else {
                toast.error("Falha ao alterar status do plano.");
            }
        } catch {
            toast.error("Falha ao alterar status do plano.");
        }
    };

    const num = (k: keyof typeof form) => (
        <div className="space-y-1">
            <Label htmlFor={`p-${k}`}>{String(k)}</Label>
            <Input id={`p-${k}`} type="number" min={0} value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Pencil className="h-6 w-6 text-primary" /> Planos
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Catálogo comercial: preços em centavos definidos pelo operador, limites aplicados por quota.
                    </p>
                </div>
                <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setShowForm((v) => !v); }}>
                    <Plus className="h-4 w-4 mr-2" /> Novo plano
                </Button>
            </div>

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{editingId ? "Editar plano" : "Criar plano"}</CardTitle>
                        <CardDescription>
                            {editingId ? "O código não pode ser alterado após a criação." : "O código identifica o plano (ex.: pro-monthly)."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
                            <div className="space-y-1">
                                <Label htmlFor="p-code">Código</Label>
                                <Input id="p-code" required disabled={!!editingId} pattern="^[a-z0-9-]+$"
                                    value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                                    placeholder="pro-monthly" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="p-name">Nome</Label>
                                <Input id="p-name" required value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="p-price">Preço (BRL)</Label>
                                <Input id="p-price" type="number" step="0.01" min={0} required value={form.priceBrl}
                                    onChange={(e) => setForm({ ...form, priceBrl: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Período</Label>
                                <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MONTHLY">Mensal</SelectItem>
                                        <SelectItem value="YEARLY">Anual</SelectItem>
                                        <SelectItem value="ONE_TIME">Único</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {num("maxInstances")}
                            {num("maxUsers")}
                            {num("requestLimit")}
                            {num("sendLimit")}
                            {num("storageLimitMb")}
                            {num("retentionDays")}
                            {num("sort")}
                            <div className="flex items-end gap-2 md:col-span-1">
                                <Button type="submit" className="w-full">{editingId ? "Salvar" : "Criar"}</Button>
                            </div>
                            <div className="space-y-1 md:col-span-3">
                                <Label htmlFor="p-desc">Descrição</Label>
                                <Input id="p-desc" value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Texto exibido no catálogo" />
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Catálogo</CardTitle>
                    <CardDescription>{loading ? "Carregando…" : `${plans.length} plano(s)`}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead>Preço</TableHead>
                                <TableHead>Instâncias</TableHead>
                                <TableHead>Envios/periodo</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plans.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        {loading ? "Carregando…" : "Nenhum plano cadastrado."}
                                    </TableCell>
                                </TableRow>
                            )}
                            {plans.map((p) => (
                                <TableRow key={p.id} className={p.status !== "ACTIVE" ? "opacity-60" : undefined}>
                                    <TableCell className="font-medium">
                                        {p.name}
                                        <div className="text-xs text-muted-foreground">{p.description}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                                    <TableCell>
                                        {brl(p.priceCents)}
                                        <div className="text-xs text-muted-foreground">
                                            {p.period === "MONTHLY" ? "mês" : p.period === "YEARLY" ? "ano" : "único"}
                                        </div>
                                    </TableCell>
                                    <TableCell>{p.maxInstances}</TableCell>
                                    <TableCell>{p.sendLimit.toLocaleString("pt-BR")}</TableCell>
                                    <TableCell>
                                        <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>{p.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                                                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => toggleStatus(p)}>
                                                {p.status === "ACTIVE"
                                                    ? <><Archive className="h-3.5 w-3.5 mr-1" /> Arquivar</>
                                                    : <><ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Reativar</>}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
