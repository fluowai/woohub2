"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus, Edit, Trash2, Search, Loader2, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SuperAdmin {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    _count: { sessions: number; memberships: number };
}

export default function SuperAdminsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SuperAdmin | null>(null);
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/login");
    }, [status, router]);

    useEffect(() => {
        if (session?.user?.role === "MEGA_ADMIN") fetchSuperAdmins();
    }, [session]);

    const fetchSuperAdmins = async () => {
        try {
            const res = await fetch("/api/mega-admin/super-admins");
            const data = await res.json();
            if (data.status) setSuperAdmins(data.data);
        } catch (error) {
            console.error("Failed to fetch:", error);
            toast.error("Erro ao carregar super admins");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const url = editing ? `/api/mega-admin/super-admins/${editing.id}` : "/api/mega-admin/super-admins";
            const method = editing ? "PATCH" : "POST";
            const body = editing ? { name: formData.name, email: formData.email } : formData;

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (data.status) {
                toast.success(editing ? "Super admin atualizado" : "Super admin criado");
                setDialogOpen(false);
                setEditing(null);
                setFormData({ name: "", email: "", password: "" });
                fetchSuperAdmins();
            } else {
                toast.error(data.message || "Erro ao salvar");
            }
        } catch (error) {
            toast.error("Erro de conexão");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este super admin?")) return;
        try {
            const res = await fetch(`/api/mega-admin/super-admins/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.status) {
                toast.success("Super admin excluído");
                fetchSuperAdmins();
            } else {
                toast.error(data.message || "Erro ao excluir");
            }
        } catch (error) {
            toast.error("Erro de conexão");
        }
    };

    const openCreate = () => {
        setEditing(null);
        setFormData({ name: "", email: "", password: "" });
        setDialogOpen(true);
    };

    const openEdit = (sa: SuperAdmin) => {
        setEditing(sa);
        setFormData({ name: sa.name, email: sa.email, password: "" });
        setDialogOpen(true);
    };

    if (status === "loading" || loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    // @ts-ignore
    const isMega = session?.user?.role === "MEGA_ADMIN" || session?.user?.email === "fluowai@gmail.com";
    if (!session || !isMega) {
        return <div className="text-center py-12">Acesso restrito a Mega Admins</div>;
    }

    const filtered = superAdmins.filter(sa =>
        sa.name.toLowerCase().includes(search.toLowerCase()) ||
        sa.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Crown className="text-yellow-600" />
                        Gerenciar Super Admins
                    </h1>
                    <p className="text-muted-foreground">Administradores globais (whitelabel)</p>
                </div>
                <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo Super Admin</Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle>Lista de Super Admins</CardTitle>
                        <div className="relative max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum super admin encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((sa) => (
                                        <TableRow key={sa.id}>
                                            <TableCell className="font-medium">{sa.name}</TableCell>
                                            <TableCell>{sa.email}</TableCell>
                                            <TableCell><Badge variant="default">{sa.role}</Badge></TableCell>
                                            <TableCell>{sa._count.sessions}</TableCell>
                                            <TableCell>{sa._count.memberships}</TableCell>
                                            <TableCell>{new Date(sa.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(sa)}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(sa.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Editar Super Admin" : "Criar Super Admin"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nome</Label>
                                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                            </div>
                            {!editing && (
                                <div className="grid gap-2">
                                    <Label htmlFor="password">Senha</Label>
                                    <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required minLength={8} />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setFormData({ name: "", email: "", password: "" }); }}>Cancelar</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}