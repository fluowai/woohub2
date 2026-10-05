"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldAlert, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

interface AuditRow {
    id: string;
    tenantId: string | null;
    actorLabel: string;
    actorType: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
    requestId: string | null;
    createdAt: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function AuditPage() {
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState("");
    const [actorLabel, setActorLabel] = useState("");
    const [tenantId, setTenantId] = useState("");
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const fetchAudit = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (action) qs.set("action", action);
            if (actorLabel) qs.set("actorLabel", actorLabel);
            if (tenantId) qs.set("tenantId", tenantId);
            const res = await fetch(`/api/audit?${qs.toString()}`);
            if (res.status === 403) {
                toast.error("Acesso restrito ao SUPERADMIN.");
                return;
            }
            if (!res.ok) {
                toast.error("Falha ao carregar a auditoria.");
                return;
            }
            const json = await res.json();
            setRows(json.data || []);
            setTotal(json.meta?.total || 0);
        } catch {
            toast.error("Falha ao carregar a auditoria.");
        } finally {
            setLoading(false);
        }
    }, [action, actorLabel, tenantId, offset]);

    useEffect(() => {
        fetchAudit();
        // Registrar o próprio acesso à trilha (quem consultou o log).
        fetch("/api/audit", { method: "POST" }).catch(() => undefined);
    }, [fetchAudit]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldAlert className="h-6 w-6 text-red-500" /> Auditoria
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Trilha append-only de eventos da plataforma (quem acessou, o quê, quando).
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchAudit} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filtros</CardTitle>
                    <CardDescription>Busca por ação, ator ou empresa.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                        <Label htmlFor="f-action">Ação (contém)</Label>
                        <Input id="f-action" placeholder="ex.: subscription.assign" value={action}
                            onChange={(e) => { setAction(e.target.value); setOffset(0); }} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="f-actor">Ator (e-mail)</Label>
                        <Input id="f-actor" placeholder="ex.: admin@" value={actorLabel}
                            onChange={(e) => { setActorLabel(e.target.value); setOffset(0); }} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="f-tenant">Empresa (id)</Label>
                        <Input id="f-tenant" placeholder="tenant id" value={tenantId}
                            onChange={(e) => { setTenantId(e.target.value); setOffset(0); }} />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={() => fetchAudit()} className="w-full">
                            <Search className="h-4 w-4 mr-2" /> Filtrar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Eventos</CardTitle>
                    <CardDescription>
                        {loading ? "Carregando…" : `${total} registro(s) — exibindo ${rows.length}`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[480px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Quando</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Ator</TableHead>
                                    <TableHead>Recurso</TableHead>
                                    <TableHead>IP</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                            {loading ? "Carregando…" : "Nenhum evento encontrado."}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {rows.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-mono text-[11px]">{r.action}</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div>{r.actorLabel}</div>
                                            <div className="text-muted-foreground">{r.actorType}</div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {r.resource || "—"}
                                            {r.resourceId && (
                                                <div className="text-muted-foreground font-mono truncate max-w-[120px]">{r.resourceId}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs font-mono">{r.ip || "—"}</TableCell>
                                        <TableCell className="text-xs max-w-[240px]">
                                            <span className="break-all text-muted-foreground">
                                                {r.metadata ? JSON.stringify(r.metadata).slice(0, 160) : "—"}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                    <div className="flex items-center justify-between mt-3">
                        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                            Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            {total > 0 ? `${offset + 1}–${offset + rows.length} de ${total}` : "0"}
                        </span>
                        <Button variant="outline" size="sm" disabled={offset + limit >= total}
                            onClick={() => setOffset(offset + limit)}>
                            Próxima
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
