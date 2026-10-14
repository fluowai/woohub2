"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Building2, Users, Server, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Tenant {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
    _count: { members: number; sessions: number; subscriptions: number };
}

const STATUS_LABELS: Record<string, string> = {
    ACTIVE: "Ativo",
    SUSPENDED: "Suspenso",
    CLOSED: "Encerrado",
};

export default function TenantsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 20;

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    useEffect(() => {
        if (session?.user?.role === "MEGA_ADMIN") fetchTenants();
    }, [session, page]);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/mega-admin/tenants?page=${page}&limit=${limit}&search=${search}`);
            const data = await res.json();
            if (data.status) {
                setTenants(data.data);
                setTotalPages(data.pagination.totalPages);
            }
        } catch (error) {
            toast.error("Erro ao carregar empresas");
        } finally {
            setLoading(false);
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
                        <Building2 className="text-blue-600" />
                        Empresas (Global)
                    </h1>
                    <p className="text-muted-foreground">Todas as empresas do sistema</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle>Lista de Empresas</CardTitle>
                        <div className="relative max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar empresas..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Membros</TableHead>
                                    <TableHead>Instâncias</TableHead>
                                    <TableHead>Assinaturas</TableHead>
                                    <TableHead>Criado em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tenants.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            Nenhuma empresa encontrada
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    tenants.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="font-medium">{t.name}</TableCell>
                                            <TableCell>{t.slug}</TableCell>
                                            <TableCell>
                                                <Badge variant={t.status === "ACTIVE" ? "default" : "secondary"}>
                                                    {STATUS_LABELS[t.status] || t.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{t._count.members}</TableCell>
                                            <TableCell>{t._count.sessions}</TableCell>
                                            <TableCell>{t._count.subscriptions}</TableCell>
                                            <TableCell>{new Date(t.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                                            <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/tenants/${t.id}`)}><Eye className="h-4 w-4" /></Button>
                                        </TableCell>
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