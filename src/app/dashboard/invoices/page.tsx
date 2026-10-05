"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface InvoiceRow {
    id: string;
    number: string;
    amountCents: number;
    currency: string;
    status: string;
    dueAt: string | null;
    paidAt: string | null;
    externalId: string | null;
    description: string | null;
    createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
    OPEN: "Aberta",
    PENDING: "Pendente",
    PAID: "Paga",
    VOID: "Anulada",
    REFUNDED: "Reembolsada",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    OPEN: "outline",
    PENDING: "secondary",
    PAID: "default",
    VOID: "destructive",
    REFUNDED: "secondary",
};

function formatMoney(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
    }
}

function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/invoices");
            const data = await res.json();
            if (res.ok && data.status) setInvoices(data.data);
            else toast.error(data.message || "Não foi possível carregar as faturas");
        } catch {
            toast.error("Erro de conexão ao carregar faturas");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Cobrança e faturas</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Histórico de faturas e eventos de pagamento da sua empresa.
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
                </Button>
            </div>

            <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Faturas</CardTitle>
                    <CardDescription>Lista de faturas geradas para esta empresa.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">Carregando faturas…</p>
                    ) : invoices.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-sm font-medium text-slate-600">Nenhuma fatura encontrada</p>
                            <p className="text-xs text-slate-400">Quando uma assinatura for ativada, as faturas aparecerão aqui.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border/50">
                                        <th className="py-2 pr-4 font-bold">Número</th>
                                        <th className="py-2 pr-4 font-bold">Valor</th>
                                        <th className="py-2 pr-4 font-bold">Status</th>
                                        <th className="py-2 pr-4 font-bold">Vencimento</th>
                                        <th className="py-2 pr-4 font-bold">Pagamento</th>
                                        <th className="py-2 font-bold">Criada em</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((inv) => (
                                        <tr key={inv.id} className="border-b border-border/30 last:border-0">
                                            <td className="py-3 pr-4 font-mono text-xs text-slate-600">{inv.number}</td>
                                            <td className="py-3 pr-4">{formatMoney(inv.amountCents, inv.currency)}</td>
                                            <td className="py-3 pr-4">
                                                <Badge variant={STATUS_VARIANTS[inv.status] ?? "secondary"}>{STATUS_LABELS[inv.status] || inv.status}</Badge>
                                            </td>
                                            <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.dueAt)}</td>
                                            <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.paidAt)}</td>
                                            <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
