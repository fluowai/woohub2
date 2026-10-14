"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RefreshCw, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface JobRow {
    id: string;
    tenantId: string;
    sessionPk: string;
    instanceId: string;
    type: string;
    status: string;
    priority: number;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    resultKey: string | null;
    createdAt: string;
    updatedAt: string;
}

const STATUS_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "PENDING", label: "Pendente" },
    { value: "RUNNING", label: "Executando" },
    { value: "SUCCEEDED", label: "Concluído" },
    { value: "FAILED", label: "Falhou" },
    { value: "CANCELED", label: "Cancelado" },
    { value: "DEAD", label: "Morto (DLQ)" },
] as const;

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "secondary",
    RUNNING: "default",
    SUCCEEDED: "outline",
    FAILED: "destructive",
    CANCELED: "secondary",
    DEAD: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente",
    RUNNING: "Executando",
    SUCCEEDED: "Concluído",
    FAILED: "Falhou",
    CANCELED: "Cancelado",
    DEAD: "Morto (DLQ)",
};

function formatDate(value: string): string {
    return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function JobsPage() {
    const [jobs, setJobs] = useState<JobRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("");
    const [limit, setLimit] = useState(50);
    const [requeuing, setRequeuing] = useState(false);

    const load = useCallback(async () => {
        try {
            const url = new URL("/api/jobs", window.location.origin);
            if (statusFilter) url.searchParams.set("status", statusFilter);
            url.searchParams.set("limit", String(limit));
            const res = await fetch(url.toString());
            const data = await res.json();
            if (res.ok && data.status) setJobs(data.data);
            else toast.error(data.message || "Não foi possível carregar os jobs");
        } catch {
            toast.error("Erro de conexão ao carregar jobs");
        } finally {
            setLoading(false);
        }
    }, [statusFilter, limit]);

    useEffect(() => {
        load();
    }, [load]);

    const requeue = async (status: "DEAD" | "FAILED") => {
        setRequeuing(true);
        try {
            const res = await fetch("/api/jobs/requeue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, limit: 200 }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success(data.message || "Jobs reenfileirados");
                setLoading(true);
                load();
            } else {
                toast.error(data.message || "Não foi possível reenfileirar");
            }
        } catch {
            toast.error("Erro de conexão ao reenfileirar");
        } finally {
            setRequeuing(false);
        }
    };

    const deadJobs = jobs.filter((j) => j.status === "DEAD" || j.status === "FAILED");

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Fila de jobs</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Monitore a fila de mensagens e a DLQ (dead-letter queue). {deadJobs.length > 0 && <span className="text-red-600 font-medium">{deadJobs.length} job(s) falhado(s).</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Filtrar status" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        min={1}
                        max={200}
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="w-[80px]"
                    />
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
                    </Button>
                    {deadJobs.length > 0 && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                                disabled={requeuing}
                                onClick={() => requeue("DEAD")}
                            >
                                <RotateCcw className={`h-4 w-4 ${requeuing ? "animate-spin" : ""}`} /> Reenfileirar DLQ
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={requeuing}
                                onClick={() => requeue("FAILED")}
                            >
                                <RotateCcw className={`h-4 w-4 ${requeuing ? "animate-spin" : ""}`} /> Reenfileirar falhas
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Jobs recentes</CardTitle>
                    <CardDescription>Ordenados por data de criação decrescente.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">Carregando jobs…</p>
                    ) : jobs.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-sm font-medium text-slate-600">Nenhum job encontrado</p>
                            <p className="text-xs text-slate-400">Ajuste os filtros ou aguarde novos jobs.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border/50">
                                        <th className="py-2 pr-4 font-bold">ID</th>
                                        <th className="py-2 pr-4 font-bold">Tipo</th>
                                        <th className="py-2 pr-4 font-bold">Instância</th>
                                        <th className="py-2 pr-4 font-bold">Status</th>
                                        <th className="py-2 pr-4 font-bold">Tentativas</th>
                                        <th className="py-2 pr-4 font-bold">Erro</th>
                                        <th className="py-2 pr-4 font-bold">Criado em</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <tr key={job.id} className="border-b border-border/30 last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs text-slate-600">{job.id.slice(0, 8)}…</td>
                                            <td className="py-2 pr-4">{job.type}</td>
                                            <td className="py-2 pr-4 font-mono text-xs text-slate-600">{job.instanceId}</td>
                                            <td className="py-2 pr-4">
                                                <Badge variant={STATUS_VARIANTS[job.status] ?? "secondary"}>{STATUS_LABELS[job.status] || job.status}</Badge>
                                            </td>
                                            <td className="py-2 pr-4">{job.attempts} / {job.maxAttempts}</td>
                                            <td className="py-2 pr-4 max-w-[240px] truncate">
                                                {job.lastError ? (
                                                    <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> {job.lastError}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(job.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
