"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Users, Smartphone, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Reseller = { id: string; name: string; slug: string; status: string; maxInstances: number; maxTenants: number; owner: { name: string | null; email: string }; branding?: { name: string } | null; domains: Array<{ hostname: string; status: string }>; tenants: Array<{ id: string; name: string; status: string; maxInstances: number; _count: { sessions: number }; members: Array<{ user: { name: string | null; email: string } }>; subscriptions: Array<{ plan: { name: string; code: string } }> }> };

const STATUS_LABELS: Record<string, string> = { ACTIVE: "Ativo", SUSPENDED: "Suspenso", CANCELED: "Cancelado", CLOSED: "Encerrado" };

export default function ResellerInspectionPage({ params }: { params: Promise<{ id: string }> }) {
    const [data, setData] = useState<Reseller | null>(null);
    useEffect(() => { params.then(({ id }) => fetch(`/api/mega-admin/resellers/${id}`).then((r) => r.json()).then((body) => { if (body.status) setData(body.data); else toast.error(body.message); }).catch(() => toast.error("Erro ao carregar a revenda"))); }, [params]);
    if (!data) return <div className="p-10 text-sm text-slate-500">Carregando visão de suporte...</div>;
    return <div className="space-y-6"><div className="flex items-center gap-3"><Link href="/dashboard/mega-admin/resellers" className="rounded-lg border p-2"><ArrowLeft size={16} /></Link><div><div className="flex items-center gap-2"><Eye size={18} className="text-orange-600" /><h1 className="text-xl font-bold">Visão de suporte da revenda</h1></div><p className="text-xs text-slate-500">Modo somente leitura auditado — {data.name}</p></div></div>
        <div className="grid gap-4 md:grid-cols-4"><Card><CardContent className="p-5"><p className="text-xs text-slate-500">Responsável</p><strong>{data.owner.name || data.owner.email}</strong><p className="text-xs text-slate-400">{data.owner.email}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-slate-500">Clientes</p><strong className="text-2xl">{data.tenants.length}</strong> <span className="text-xs text-slate-400">/ {data.maxTenants}</span></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-slate-500">Instâncias conectadas</p><strong className="text-2xl">{data.tenants.reduce((sum, tenant) => sum + tenant._count.sessions, 0)}</strong></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-slate-500">Status</p><strong>{STATUS_LABELS[data.status] || data.status}</strong></CardContent></Card></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users size={18} /> Clientes da revenda</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Empresa</th><th className="p-4">Plano</th><th className="p-4">Usuários</th><th className="p-4">Instâncias</th><th className="p-4">Status</th></tr></thead><tbody className="divide-y">{data.tenants.map((tenant) => <tr key={tenant.id}><td className="p-4 font-semibold">{tenant.name}</td><td className="p-4">{tenant.subscriptions[0]?.plan.name || "Sem plano"}</td><td className="p-4">{tenant.members.length}</td><td className="p-4"><span className="inline-flex items-center gap-1"><Smartphone size={14} /> {tenant._count.sessions} / {tenant.maxInstances}</span></td><td className="p-4">{STATUS_LABELS[tenant.status] || tenant.status}</td></tr>)}</tbody></table>{data.tenants.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nenhum cliente criado.</p>}</CardContent></Card>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><div className="flex gap-2"><ShieldCheck size={18} /><p>O acesso de suporte é somente leitura e foi registrado na auditoria. O Mega Admin não entra usando a senha do revendedor nem altera a sessão dele.</p></div></div>
    </div>;
}
