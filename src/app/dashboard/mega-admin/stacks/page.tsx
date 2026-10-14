"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Installation = { id: string; name: string; status: string; mode: string; capacity: number; reportedInstances: number; reportedConnected: number; lastContactAt: string | null; reseller?: { name: string }; license?: { status: string; expiresAt: string | null }; templateVersion?: { version: string; template?: { name: string } } };

const INSTALLATION_STATUS_LABELS: Record<string, string> = { DRAFT: "Rascunho", RESERVED: "Reservada", PREPARED: "Preparada", ACTIVATING: "Ativando", ACTIVE: "Ativa", DEGRADED: "Degradada", OFFLINE: "Offline", LICENSE_RESTRICTED: "Licença restrita", RETIRED: "Desativada" };

const LICENSE_STATUS_LABELS: Record<string, string> = { ACTIVE: "Ativa", EXPIRED: "Expirada", SUSPENDED: "Suspensa", REVOKED: "Revogada", PENDING: "Pendente" };

export default function MegaAdminStacksPage() {
  const [items, setItems] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); const response = await fetch("/api/mega-admin/installations"); const body = await response.json(); setItems(body.data ?? []); setLoading(false); };
  useEffect(() => { void load(); }, []);
  return <main className="space-y-6 p-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Stacks e instalações</h1><p className="text-sm text-slate-500">Controle de instalações white label, versões e comunicação.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Instalações autorizadas</CardTitle></CardHeader><CardContent>{loading ? <p>Carregando...</p> : items.length === 0 ? <p className="text-sm text-slate-500">Nenhuma instalação cadastrada.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Nome</th><th className="p-3">Revenda</th><th className="p-3">Estado</th><th className="p-3">Uso</th><th className="p-3">Licença</th><th className="p-3">Último contato</th></tr></thead><tbody>{items.map((item) => <tr className="border-b" key={item.id}><td className="p-3 font-medium">{item.name}</td><td className="p-3">{item.reseller?.name ?? "—"}</td><td className="p-3">{INSTALLATION_STATUS_LABELS[item.status] || item.status}</td><td className="p-3">{item.reportedInstances}/{item.capacity} ({item.reportedConnected} conectadas)</td><td className="p-3">{item.license ? (LICENSE_STATUS_LABELS[item.license.status] || item.license.status) : "—"}</td><td className="p-3">{item.lastContactAt ? new Date(item.lastContactAt).toLocaleString("pt-BR") : "Sem comunicação"}</td></tr>)}</tbody></table></div>}</CardContent></Card></main>;
}
