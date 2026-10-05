"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";

interface SubscriptionRow {
    id: string;
    tenantId: string;
    status: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    plan: { id: string; code: string; name: string; priceCents: number; currency: string };
    tenant: { id: string; name: string; slug: string };
}

interface Option { id: string; label: string }

const statusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "ACTIVE" ? "default" : s === "TRIALING" ? "secondary" : "destructive";

const STATUS_LABEL: Record<string, string> = {
    TRIALING: "Teste", ACTIVE: "Ativa", PAST_DUE: "Vencida",
    SUSPENDED: "Suspensa", CANCELED: "Cancelada", EXPIRED: "Expirada",
};

const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export default function SubscriptionsPage() {
    const [subs, setSubs] = useState<SubscriptionRow[]>([]);
    const [tenants, setTenants] = useState<Option[]>([]);
    const [plans, setPlans] = useState<Option[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ tenantId: "", planId: "", status: "TRIALING", periodDays: "30" });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [sRes, tRes, pRes] = await Promise.all([
                fetch("/api/subscriptions"),
                fetch("/api/tenants"),
                fetch("/api/plans?all=1"),
            ]);
            if (sRes.status === 403 || tRes.status === 403 || pRes.status === 403) {
                toast.error("Acesso restrito ao SUPERADMIN.");
                return;
            }
            if (sRes.ok) {
                const json = await sRes.json();
                setSubs(json.data || []);
            }
            if (tRes.ok) {
                const json = await tRes.json();
                setTenants((json.data || []).map((t: { id: string; name: string }) => ({ id: t.id, label: t.name })));
            }
            if (pRes.ok) {
                const json = await pRes.json();
                setPlans((json.data || []).filter((p: { status: string }) => p.status === "ACTIVE")
                    .map((p: { id: string; name: string; code: string }) => ({ id: p.id, label: `${p.name} (${p.code})` })));
            }
        } catch {
            toast.error("Falha ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch("/api/subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId: form.tenantId,
                    planId: form.planId,
                    status: form.status,
                    periodDays: Number(form.periodDays),
                }),
            });
            const json = await res.json();
            if (res.ok) {
                toast.success("Assinatura atribuída (ativada e auditada).");
                fetchAll();
            } else {
                toast.error(json.message || "Falha ao atribuir assinatura.");
            }
        } catch {
            toast.error("Falha ao atribuir assinatura.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Link2 className="h-6 w-6 text-primary" /> Assinaturas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Enlace empresa → plano. Sem gateway configurado, a ativação é manual e auditada (piloto).
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Atribuir plano a uma empresa</CardTitle>
                    <CardDescription>
                        Substitui a assinatura atual da empresa e define o período (limite vigente).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAssign} className="grid gap-3 md:grid-cols-5">
                        <div className="space-y-1">
                            <Label>Empresa</Label>
                            <Select value={form.tenantId} onValueChange={(v) => setForm({ ...form, tenantId: v })} required>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                    {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Plano</Label>
                            <Select value={form.planId} onValueChange={(v) => setForm({ ...form, planId: v })} required>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Status inicial</Label>
                            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="TRIALING">Teste</SelectItem>
                                    <SelectItem value="ACTIVE">Ativa</SelectItem>
                                    <SelectItem value="PAST_DUE">Vencida</SelectItem>
                                    <SelectItem value="SUSPENDED">Suspensa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Período (dias)</Label>
                            <Select value={form.periodDays} onValueChange={(v) => setForm({ ...form, periodDays: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {["7", "15", "30", "90", "180", "365"].map((d) => (
                                        <SelectItem key={d} value={d}>{d} dias</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end">
                            <Button type="submit" className="w-full" disabled={saving || !form.tenantId || !form.planId}>
                                {saving ? "Salvando…" : "Atribuir"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Assinaturas atuais</CardTitle>
                    <CardDescription>{loading ? "Carregando…" : `${subs.length} assinatura(s)`}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Empresa</TableHead>
                                <TableHead>Plano</TableHead>
                                <TableHead>Preço</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Fim do período</TableHead>
                                <TableHead>Teste até</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {subs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        {loading ? "Carregando…" : "Nenhuma assinatura — atribua um plano acima."}
                                    </TableCell>
                                </TableRow>
                            )}
                            {subs.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell className="font-medium">
                                        {s.tenant.name}
                                        <div className="text-xs text-muted-foreground font-mono">{s.tenant.slug}</div>
                                    </TableCell>
                                    <TableCell>
                                        {s.plan.name}
                                        <div className="text-xs text-muted-foreground font-mono">{s.plan.code}</div>
                                    </TableCell>
                                    <TableCell>
                                        {(s.plan.priceCents / 100).toLocaleString("pt-BR", {
                                            style: "currency", currency: s.plan.currency || "BRL",
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(s.status)}>{STATUS_LABEL[s.status] || s.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{date(s.currentPeriodEnd)}</TableCell>
                                    <TableCell className="text-xs">{date(s.trialEndsAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
