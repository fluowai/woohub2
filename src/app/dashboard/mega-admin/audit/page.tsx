"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Filter, ScrollText, Calendar, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AuditLog {
    id: string;
    tenantId: string | null;
    actorUserId: string | null;
    actorLabel: string;
    actorType: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    metadata: any;
    ip: string | null;
    requestId: string | null;
    createdAt: string;
    tenant?: { id: string; name: string; slug: string } | null;
}

export default function AuditPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actionFilter, setActionFilter] = useState("");
    const [actorTypeFilter, setActorTypeFilter] = useState("");
    const limit = 50;

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    useEffect(() => {
        if (session?.user?.role === "MEGA_ADMIN") fetchLogs();
    }, [session, page, actionFilter, actorTypeFilter]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let url = `/api/mega-admin/audit?page=${page}&limit=${limit}`;
            if (search) url += `&search=${search}`;
            if (actionFilter) url += `&action=${actionFilter}`;
            if (actorTypeFilter) url += `&actorType=${actorTypeFilter}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status) {
                setLogs(data.data);
                setTotalPages(data.pagination.totalPages);
            }
        } catch (error) {
            toast.error("Erro ao carregar auditoria");
        } finally {
            setLoading(false);
        }
    };

    const getActorTypeBadge = (type: string) => {
        switch (type) {
            case "SUPERADMIN": return <Badge variant="default">Super Admin</Badge>;
            case "MEGA_ADMIN": return <Badge variant="secondary">Mega Admin</Badge>;
            case "API_KEY": return <Badge variant="outline">API Key</Badge>;
            case "SYSTEM": return <Badge variant="destructive">Sistema</Badge>;
            default: return <Badge variant="outline">{type}</Badge>;
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ScrollText className="text-red-600" />
                        Auditoria Global
                    </h1>
                    <p className="text-muted-foreground">Log de todas as ações administrativas do sistema</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle>Logs de Auditoria</CardTitle>
                        <div className="flex gap-2 flex-wrap">
                            <div className="relative max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar ação, recurso, IP..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                            </div>
                            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="border rounded-md px-3 py-2 text-sm w-48">
                                <option value="">Todas as ações</option>
                                <option value="superadmin.access">Acesso Super Admin</option>
                                <option value="session.create">Criar Sessão</option>
                                <option value="session.delete">Excluir Sessão</option>
                                <option value="user.create">Criar Usuário</option>
                                <option value="user.update">Atualizar Usuário</option>
                                <option value="user.delete">Excluir Usuário</option>
                                <option value="tenant.create">Criar Empresa</option>
                                <option value="tenant.update">Atualizar Empresa</option>
                            </select>
                            <select value={actorTypeFilter} onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1); }} className="border rounded-md px-3 py-2 text-sm w-40">
                                <option value="">Todos os atores</option>
                                <option value="USER">Usuário</option>
                                <option value="API_KEY">API Key</option>
                                <option value="SYSTEM">Sistema</option>
                            </select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data/Hora</TableHead>
                                    <TableHead>Ator</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Recurso</TableHead>
                                    <TableHead>Empresa</TableHead>
                                    <TableHead>IP</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum log encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span>{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{log.actorLabel}</TableCell>
                                            <TableCell>{getActorTypeBadge(log.actorType)}</TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</code>
                                            </TableCell>
                                            <TableCell>
                                                {log.resource && (
                                                    <div className="flex items-center gap-1 text-sm">
                                                        <span className="font-mono">{log.resource}</span>
                                                        {log.resourceId && <span className="text-muted-foreground">#{log.resourceId.slice(0, 8)}</span>}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {log.tenant ? (
                                                    <div className="flex items-center gap-1">
                                                        <Building2 className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-sm">{log.tenant.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">Global</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{log.ip || "-"}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                            <span className="px-3 text-sm">Página {page} de {totalPages}</span>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}