"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Search, Loader2, UserCircle, Users, Crown, Edit, Eye, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    _count: { sessions: number; memberships: number };
}

export default function UsersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [roleFilter, setRoleFilter] = useState("");
    const limit = 20;

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    useEffect(() => {
        if (session?.user?.role === "MEGA_ADMIN") fetchUsers();
    }, [session, page, roleFilter]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            let url = `/api/mega-admin/users?page=${page}&limit=${limit}&search=${search}`;
            if (roleFilter) url += `&role=${roleFilter}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status) {
                setUsers(data.data);
                setTotalPages(data.pagination.totalPages);
            }
        } catch (error) {
            toast.error("Erro ao carregar usuários");
        } finally {
            setLoading(false);
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case "MEGA_ADMIN": return <Shield className="h-3 w-3 text-orange-600" />;
            case "SUPERADMIN": return <Crown className="h-3 w-3 text-yellow-600" />;
            default: return <UserCircle className="h-3 w-3 text-blue-600" />;
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
                        <Users className="text-purple-600" />
                        Usuários (Global)
                    </h1>
                    <p className="text-muted-foreground">Todos os usuários do sistema</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle>Lista de Usuários</CardTitle>
                        <div className="flex gap-2">
                            <div className="relative max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar usuários..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                            </div>
                            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="border rounded-md px-3 py-2 text-sm">
                                <option value="">Todos os roles</option>
                                <option value="MEGA_ADMIN">Mega Admin</option>
                                <option value="SUPERADMIN">Super Admin</option>
                                <option value="OWNER">Owner</option>
                                <option value="STAFF">Staff</option>
                            </select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Instâncias</TableHead>
                                    <TableHead>Empresas</TableHead>
                                    <TableHead>Criado em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum usuário encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell className="font-medium flex items-center gap-2">
                                                {getRoleIcon(u.role)}
                                                {u.name}
                                            </TableCell>
                                            <TableCell>{u.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={u.role === "MEGA_ADMIN" ? "default" : u.role === "SUPERADMIN" ? "secondary" : "outline"}>
                                                    {u.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{u._count.sessions}</TableCell>
                                            <TableCell>{u._count.memberships}</TableCell>
                                            <TableCell>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                                            <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/users/${u.id}`)}><Eye className="h-4 w-4" /></Button>
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