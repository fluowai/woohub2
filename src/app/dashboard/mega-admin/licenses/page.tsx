"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Shield, CheckCircle, XCircle, AlertTriangle, Copy, Trash2, Edit, RefreshCw, Clock, Server, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface License {
  id: string;
  licenseKey: string;
  status: string;
  type: string;
  issuedTo: string;
  issuedToEmail: string;
  maxInstances: number;
  maxTenants: number;
  maxUsers: number;
  maxResellers: number;
  features?: string[] | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  validationCount: number;
  createdAt: string;
  _count: { validations: number };
}

export default function LicensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);
  const [formData, setFormData] = useState({
    type: "TRIAL",
    issuedTo: "",
    issuedToEmail: "",
    maxInstances: 1,
    maxTenants: 1,
    maxUsers: 5,
    maxResellers: 0,
    expiresAt: "",
    features: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [portainerDialogOpen, setPortainerDialogOpen] = useState(false);
  const [selectedPortainerLicense, setSelectedPortainerLicense] = useState<License | null>(null);
  const limit = 20;

  const openPortainerModal = (license: License) => {
    setSelectedPortainerLicense(license);
    setPortainerDialogOpen(true);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role === "MEGA_ADMIN") {
      fetchLicenses();
      fetchStats();
    }
  }, [session, page, statusFilter, typeFilter]);

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      let url = `/api/mega-admin/licenses?page=${page}&limit=${limit}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (typeFilter) url += `&type=${typeFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status) {
        setLicenses(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      toast.error("Erro ao carregar licenças");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/mega-admin/licenses?stats=true");
      const data = await res.json();
      if (data.status) setStats(data.data);
    } catch (error) {
      console.error("Falha ao carregar as estatísticas", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/mega-admin/licenses/${editing.id}` : "/api/mega-admin/licenses";
      const method = editing ? "PATCH" : "POST";
      const body = editing ? {
        type: formData.type,
        issuedTo: formData.issuedTo,
        issuedToEmail: formData.issuedToEmail,
        maxInstances: formData.maxInstances,
        maxTenants: formData.maxTenants,
        maxUsers: formData.maxUsers,
        maxResellers: formData.maxResellers,
        expiresAt: formData.expiresAt || null,
        features: formData.features ? formData.features.split(",").map(f => f.trim()).filter(Boolean) : [],
      } : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.status) {
        toast.success(editing ? "Licença atualizada" : "Licença criada");
        setDialogOpen(false);
        setEditing(null);
        setFormData({ type: "TRIAL", issuedTo: "", issuedToEmail: "", maxInstances: 1, maxTenants: 1, maxUsers: 5, maxResellers: 0, expiresAt: "", features: "" });
        fetchLicenses();
        fetchStats();
      } else {
        toast.error(data.message || "Erro ao salvar");
      }
    } catch (error) {
      toast.error("Erro de conexão");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Tem certeza que deseja revogar esta licença?")) return;
    try {
      const res = await fetch(`/api/mega-admin/licenses/${id}?reason=Revoked+by+admin`, { method: "DELETE" });
      const data = await res.json();
      if (data.status) {
        toast.success("Licença revogada");
        fetchLicenses();
        fetchStats();
      } else {
        toast.error(data.message || "Erro ao revogar");
      }
    } catch (error) {
      toast.error("Erro de conexão");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Chave copiada");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      ACTIVE: { variant: "default", label: "Ativa", icon: CheckCircle },
      EXPIRED: { variant: "destructive", label: "Expirada", icon: XCircle },
      SUSPENDED: { variant: "secondary", label: "Suspensa", icon: AlertTriangle },
      REVOKED: { variant: "destructive", label: "Revogada", icon: XCircle },
      PENDING: { variant: "outline", label: "Pendente", icon: Clock },
    };
    const config = variants[status] || { variant: "outline", label: status, icon: Shield };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ type: "TRIAL", issuedTo: "", issuedToEmail: "", maxInstances: 1, maxTenants: 1, maxUsers: 5, maxResellers: 0, expiresAt: "", features: "" });
    setDialogOpen(true);
  };

  const openEdit = (license: License) => {
    setEditing(license);
    setFormData({
      type: license.type,
      issuedTo: license.issuedTo,
      issuedToEmail: license.issuedToEmail,
      maxInstances: license.maxInstances,
      maxTenants: license.maxTenants,
      maxUsers: license.maxUsers,
      maxResellers: license.maxResellers,
      expiresAt: license.expiresAt ? license.expiresAt.split("T")[0] : "",
      features: license.features?.join(", ") || "",
    });
    setDialogOpen(true);
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!session || session.user?.role !== "MEGA_ADMIN") {
    return <div className="text-center py-12">Acesso restrito a Mega Admins</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="text-orange-600" />
            Gerenciar Licenças
          </h1>
          <p className="text-muted-foreground">Controle de licenças do sistema Woohub</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nova Licença</Button>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ativas</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{stats.active}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expiradas</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">{stats.expired}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Trial</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.trial}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Por Tipo</CardTitle></CardHeader>
            <CardContent>
              <div className="text-xs space-y-1">
                {Object.entries(stats.byType || {}).map(([type, count]: [string, any]) => (
                  <div key={type} className="flex justify-between">
                    <span>{type}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Lista de Licenças</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Ativa</SelectItem>
                  <SelectItem value="EXPIRED">Expirada</SelectItem>
                  <SelectItem value="SUSPENDED">Suspensa</SelectItem>
                  <SelectItem value="REVOKED">Revogada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="PROFESSIONAL">Professional</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                  <SelectItem value="RESELLER">Reseller</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Emitida Para</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validações</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma licença encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  licenses.map((license) => (
                    <TableRow key={license.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{license.licenseKey}</code>
                          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(license.licenseKey)}><Copy className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{license.type}</Badge></TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{license.issuedTo}</p>
                          <p className="text-xs text-muted-foreground">{license.issuedToEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(license.status)}</TableCell>
                      <TableCell>{license.validationCount}</TableCell>
                      <TableCell>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("pt-BR") : "Nunca"}</TableCell>
                      <TableCell>{new Date(license.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPortainerModal(license)}
                            className="h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                            title="Link da Stack para Portainer"
                          >
                            <Server className="h-3.5 w-3.5 mr-1" />
                            Portainer
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(license)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleRevoke(license.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                        </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Licença" : "Criar Nova Licença"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {!editing && (
                <div className="grid gap-2">
                  <Label htmlFor="type">Tipo de Licença</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRIAL">Trial</SelectItem>
                      <SelectItem value="STANDARD">Standard</SelectItem>
                      <SelectItem value="PROFESSIONAL">Professional</SelectItem>
                      <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                      <SelectItem value="RESELLER">Reseller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="issuedTo">Emitida Para (Empresa)</Label>
                <Input id="issuedTo" value={formData.issuedTo} onChange={(e) => setFormData({ ...formData, issuedTo: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issuedToEmail">E-mail de Contato</Label>
                <Input id="issuedToEmail" type="email" value={formData.issuedToEmail} onChange={(e) => setFormData({ ...formData, issuedToEmail: e.target.value })} required />
              </div>
              {editing && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="maxInstances">Máximo de Instâncias</Label>
                    <Input id="maxInstances" type="number" value={formData.maxInstances} onChange={(e) => setFormData({ ...formData, maxInstances: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxTenants">Máximo de Clientes</Label>
                    <Input id="maxTenants" type="number" value={formData.maxTenants} onChange={(e) => setFormData({ ...formData, maxTenants: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxUsers">Máximo de Usuários</Label>
                    <Input id="maxUsers" type="number" value={formData.maxUsers} onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxResellers">Máximo de Revendas</Label>
                    <Input id="maxResellers" type="number" value={formData.maxResellers} onChange={(e) => setFormData({ ...formData, maxResellers: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="expiresAt">Data de Expiração</Label>
                    <Input id="expiresAt" type="date" value={formData.expiresAt} onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="features">Recursos (separados por vírgula)</Label>
                    <Input id="features" value={formData.features} onChange={(e) => setFormData({ ...formData, features: e.target.value })} placeholder="feature1, feature2" />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setFormData({ type: "TRIAL", issuedTo: "", issuedToEmail: "", maxInstances: 1, maxTenants: 1, maxUsers: 5, maxResellers: 0, expiresAt: "", features: "" }); }}>Cancelar</Button>
              <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={portainerDialogOpen} onOpenChange={setPortainerDialogOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-orange-600" />
              Integração Portainer — Revenda White-Label
            </DialogTitle>
          </DialogHeader>

          {selectedPortainerLicense && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenda:</span>
                  <span className="font-semibold">{selectedPortainerLicense.issuedTo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status da Licença:</span>
                  <span>{getStatusBadge(selectedPortainerLicense.status)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chave:</span>
                  <code className="text-xs font-mono">{selectedPortainerLicense.licenseKey}</code>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">1. Link Direto da Stack (Compose URL para Portainer)</Label>
                <p className="text-xs text-muted-foreground">
                  A revenda pode colar este link no Portainer em <strong>Stacks &gt; Add stack &gt; Web Editor / Upload</strong> ou usar via curl. A stack só é entregue se a licença estiver ativa no banco.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/license/portainer-stack?key=${selectedPortainerLicense.licenseKey}` : ""}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        copyToClipboard(`${window.location.origin}/api/license/portainer-stack?key=${selectedPortainerLicense.licenseKey}`);
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">2. Link de Verificação Pública (verificação de status)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/license/check?key=${selectedPortainerLicense.licenseKey}` : ""}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        copyToClipboard(`${window.location.origin}/api/license/check?key=${selectedPortainerLicense.licenseKey}`);
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-950 space-y-1">
                <p className="font-semibold text-orange-800">🔒 Como o Bloqueio Funciona:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Download da imagem:</strong> A revenda adiciona o registry privado no Portainer (ex: <code>ghcr.io</code>) com o token de leitura fornecido. Sem licença ou token revogado, o Docker recusa o download (HTTP 401).</li>
                  <li><strong>Execução dos containers:</strong> Se você suspender ou revogar a licença nesta tela, o container aborta a execução automaticamente via validação online e sai com código 1 (status <code>Exited 1</code> no Portainer).</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPortainerDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}