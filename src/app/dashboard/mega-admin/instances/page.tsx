"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Database, Eye, Plus, RefreshCw, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface InstanceRow {
    id: string;
    name: string;
    sessionId: string;
    status: string;
    tenantName: string;
    ownerName: string | null;
    ownerEmail: string | null;
    running: boolean;
    contactsCount: number;
    messagesCount: number;
    createdAt: string;
}

interface TenantOption {
    id: string;
    name: string;
    status: string;
}

const STATUS_STYLES: Record<string, string> = {
    CONNECTED: "bg-green-100 text-green-700",
    SCAN_QR: "bg-yellow-100 text-yellow-800",
    QR_REQUIRED: "bg-yellow-100 text-yellow-800",
    DISCONNECTED: "bg-gray-100 text-gray-700",
    STOPPED: "bg-red-100 text-red-700",
    LOGGED_OUT: "bg-red-100 text-red-700",
    ERROR: "bg-red-100 text-red-700",
};

export default function MegaAdminInstancesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [instances, setInstances] = useState<InstanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tenants, setTenants] = useState<TenantOption[]>([]);
    const [form, setForm] = useState({ name: "", sessionId: "", tenantId: "" });

    const limit = 20;
    const isMega = session?.user?.role === "MEGA_ADMIN";

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    const fetchInstances = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
            });
            if (search.trim()) params.set("search", search.trim());
            if (statusFilter !== "ALL") params.set("status", statusFilter);

            const res = await fetch(`/api/mega-admin/instances?${params.toString()}`);
            const data = await res.json();
            if (data.status) {
                setInstances(data.data);
                setTotalPages(data.pagination.totalPages);
                setTotal(data.pagination.total);
            } else {
                toast.error(data.message || "Erro ao carregar instâncias");
            }
        } catch {
            toast.error("Erro ao carregar instâncias");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (status === "authenticated" && isMega) fetchInstances();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, isMega, page, statusFilter]);

    const openDialog = async () => {
        setForm({ name: "", sessionId: "", tenantId: "" });
        setOpen(true);
        if (tenants.length === 0) {
            try {
                const res = await fetch("/api/mega-admin/tenants?page=1&limit=100");
                const data = await res.json();
                if (data.status) setTenants(data.data);
            } catch {
                toast.error("Erro ao carregar empresas");
            }
        }
    };

    const createInstance = async () => {
        if (!form.name.trim()) {
            toast.error("Informe o nome da instância");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/mega-admin/instances", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name.trim(),
                    sessionId: form.sessionId.trim() || undefined,
                    // "none" é o sentinel do Select (string vazia não é valor válido)
                    tenantId:
                        form.tenantId && form.tenantId !== "none"
                            ? form.tenantId
                            : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.status) throw new Error(data.message || "Falha ao criar");
            toast.success("Instância criada");
            setOpen(false);
            setPage(1);
            await fetchInstances();
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!session || !isMega) {
        return <div className="text-center py-12">Acesso restrito a Mega Admins</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Database className="text-blue-600" />
                        Instâncias (Global)
                    </h1>
                    <p className="text-muted-foreground">
                        Todas as instâncias de WhatsApp da plataforma
                        {total > 0 ? ` — ${total} no total` : ""}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchInstances} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Atualizar
                    </Button>
                    <Button onClick={openDialog}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova instância
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle>Lista de instâncias</CardTitle>
                        <div className="flex items-center gap-2">
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => {
                                    setStatusFilter(value);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[170px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os status</SelectItem>
                                    <SelectItem value="CONNECTED">Conectado</SelectItem>
                                    <SelectItem value="SCAN_QR">Aguardando QR</SelectItem>
                                    <SelectItem value="DISCONNECTED">Desconectado</SelectItem>
                                    <SelectItem value="STOPPED">Parado</SelectItem>
                                    <SelectItem value="LOGGED_OUT">Deslogado</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nome, ID ou e-mail"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") fetchInstances();
                                    }}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </div>
                    <CardDescription>
                        O status exibido é o da instância em memória quando ela está rodando;
                        o banco é usado como espelho.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Empresa</TableHead>
                                    <TableHead>Dono</TableHead>
                                    <TableHead>Contatos</TableHead>
                                    <TableHead>Mensagens</TableHead>
                                    <TableHead>Criada em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : instances.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                            Nenhuma instância encontrada
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    instances.map((inst) => (
                                        <TableRow key={inst.id}>
                                            <TableCell className="font-medium">{inst.name}</TableCell>
                                            <TableCell className="font-mono text-xs">{inst.sessionId}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={STATUS_STYLES[inst.status] || "bg-gray-100 text-gray-700"}
                                                >
                                                    {inst.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{inst.tenantName}</TableCell>
                                            <TableCell className="text-sm">
                                                {inst.ownerName || inst.ownerEmail || "-"}
                                            </TableCell>
                                            <TableCell>{inst.contactsCount}</TableCell>
                                            <TableCell>{inst.messagesCount}</TableCell>
                                            <TableCell>
                                                {new Date(inst.createdAt).toLocaleDateString("pt-BR")}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Abrir detalhes da instância"
                                                    onClick={() => router.push(`/dashboard/sessions/${inst.sessionId}`)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                Anterior
                            </Button>
                            <span className="px-3 text-sm">
                                Página {page} de {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                            >
                                Próxima
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Server className="h-5 w-5" />
                            Nova instância
                        </DialogTitle>
                        <DialogDescription>
                            A instância é criada parada. Depois é só abrir e gerar o QR Code.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome *</label>
                            <Input
                                placeholder="Ex.: Vendas"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Empresa</label>
                            <Select
                                value={form.tenantId}
                                onValueChange={(value) => setForm({ ...form, tenantId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecionar empresa (opcional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sem empresa (modo piloto)</SelectItem>
                                    {tenants.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Com empresa, a instância conta na cota do plano e o dono é o
                                OWNER/ADMIN dela.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">ID personalizado (opcional)</label>
                            <Input
                                placeholder="Deixe em branco para gerar automaticamente"
                                value={form.sessionId}
                                onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
                                className="font-mono"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={createInstance}
                            disabled={saving || !form.name.trim()}
                        >
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Criar instância
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
