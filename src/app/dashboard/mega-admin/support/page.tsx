"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LifeBuoy, ShieldCheck, ExternalLink } from "lucide-react";

export default function MegaAdminSupportPage() {
  return <main className="space-y-6 p-6"><div><h1 className="text-2xl font-bold">Suporte operacional</h1><p className="text-sm text-slate-500">Acompanhe licenças, instalações e auditoria para atender revendas.</p></div><div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle className="flex items-center gap-2"><LifeBuoy className="h-5 w-5" />Instalações</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-slate-600">Verifique estado, versão, capacidade e última comunicação.</p><Link href="/dashboard/mega-admin/stacks"><Button>Ver instalações</Button></Link></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Licenças</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-slate-600">Ative, suspenda, renove ou revogue licenças.</p><Link href="/dashboard/mega-admin/licenses"><Button>Gerenciar licenças</Button></Link></CardContent></Card><Card><CardHeader><CardTitle>Auditoria</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-slate-600">Consulte alterações administrativas e eventos de suporte.</p><Link href="/dashboard/mega-admin/audit"><Button variant="outline">Abrir auditoria <ExternalLink className="ml-2 h-4 w-4" /></Button></Link></CardContent></Card></div></main>;
}
