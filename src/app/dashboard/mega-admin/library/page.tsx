"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Code2, FileText } from "lucide-react";

const links = [{ href: "/docs", title: "Documentação do produto", text: "Uso da API, instâncias, webhooks e operação." }, { href: "/docs/v1", title: "API pública v1", text: "Contrato, endpoints, escopos e exemplos." }, { href: "/dashboard/api-docs", title: "Documentação técnica", text: "Referência operacional disponível no painel." }, { href: "/dashboard/system-monitor", title: "Saúde da plataforma", text: "Estado do serviço central e seus componentes." }];

export default function MegaAdminLibraryPage() { return <main className="space-y-6 p-6"><div><h1 className="text-2xl font-bold">Biblioteca e documentação</h1><p className="text-sm text-slate-500">Ponto único para consultar as funções e os procedimentos do sistema.</p></div><div className="grid gap-4 md:grid-cols-2">{links.map((link) => <Card key={link.href}><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />{link.title}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-slate-600">{link.text}</p><Link href={link.href}><Button variant="outline"><FileText className="mr-2 h-4 w-4" />Abrir</Button></Link></CardContent></Card>)}</div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5" />Biblioteca de funções</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-600">As funções centrais permanecem disponíveis por permissões de backend: clientes, revendas, instâncias, planos, pagamentos, licenças, stacks, auditoria e monitoramento.</p></CardContent></Card></main>; }
