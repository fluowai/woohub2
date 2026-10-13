"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Server, ShieldCheck, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Plan = { id: string; code: string; name: string; description?: string | null; priceCents: number; maxInstances: number; maxUsers: number; status?: string };
type Check = { label: string; configured: boolean; reachable: boolean; status: number | null; message: string };

export default function OnboardingPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [customerType, setCustomerType] = useState<"DIRECT" | "RESELLER">("DIRECT");
    const [planCode, setPlanCode] = useState("");
    const [domain, setDomain] = useState("");
    const [supabaseUrl, setSupabaseUrl] = useState("");
    const [minioUrl, setMinioUrl] = useState("");
    const [checks, setChecks] = useState<Check[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingPlans, setLoadingPlans] = useState(true);

    useEffect(() => {
        fetch("/api/plans").then((r) => r.json()).then((body) => {
            const available = (body.data ?? []).filter((p: Plan) => p.status === "ACTIVE");
            setPlans(available);
            if (available[0]) setPlanCode(available[0].code);
        }).catch(() => toast.error("Não foi possível carregar os planos")).finally(() => setLoadingPlans(false));
    }, []);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setChecks([]);
        try {
            const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerType, planCode, domain, supabaseUrl, minioUrl }) });
            const body = await response.json();
            if (body.data?.checks) setChecks(body.data.checks);
            if (!response.ok) throw new Error(body.message || "Não foi possível concluir o onboarding");
            toast.success("Conta configurada com sucesso");
            setTimeout(() => router.push("/dashboard"), 700);
        } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao configurar a conta"); }
        finally { setLoading(false); }
    }

    return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><div className="mx-auto max-w-4xl">
        <div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Woohub</p><h1 className="mt-2 text-3xl font-bold">Configure sua conta</h1><p className="mt-2 text-slate-600">Escolha o modelo comercial, seu plano e valide os serviços que a sua stack vai usar.</p></div>
        <form onSubmit={submit} className="space-y-6">
            <Card><CardHeader><CardTitle>1. Tipo de operação</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
                {[{ value: "DIRECT", title: "Cliente normal", text: "Use a Woohub para operar suas próprias instâncias." }, { value: "RESELLER", title: "Cliente revenda", text: "Prepare uma operação white label para seus próprios clientes." }].map((item) => <button type="button" key={item.value} onClick={() => setCustomerType(item.value as "DIRECT" | "RESELLER")} className={`rounded-xl border p-5 text-left transition ${customerType === item.value ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200" : "border-slate-200 bg-white hover:border-orange-300"}`}><div className="flex items-center gap-3"><ShieldCheck className="text-orange-600" size={20} /><strong>{item.title}</strong></div><p className="mt-2 text-sm text-slate-600">{item.text}</p></button>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>2. Plano inicial</CardTitle></CardHeader><CardContent>{loadingPlans ? <p className="text-sm text-slate-500">Carregando planos...</p> : <div className="grid gap-3 md:grid-cols-3">{plans.map((plan) => <button type="button" key={plan.id} onClick={() => setPlanCode(plan.code)} className={`rounded-xl border p-4 text-left ${planCode === plan.code ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}><strong>{plan.name}</strong><p className="mt-1 text-xs text-slate-500">{plan.maxInstances} instância(s) · {plan.maxUsers} usuário(s)</p><p className="mt-3 font-bold text-orange-600">R$ {(plan.priceCents / 100).toFixed(2).replace(".", ",")}</p></button>)}</div>}</CardContent></Card>
            <Card><CardHeader><CardTitle>3. Domínio e serviços da stack</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">Domínio da operação<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.suaempresa.com.br" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" /></label>
                <label className="text-sm font-medium">URL do Supabase<input value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://seu-projeto.supabase.co" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" /></label>
                <label className="text-sm font-medium">URL do MinIO<input value={minioUrl} onChange={(e) => setMinioUrl(e.target.value)} placeholder="https://storage.suaempresa.com.br" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" /></label>
                <div className="rounded-lg bg-slate-100 p-4 text-xs text-slate-600"><div className="flex gap-2"><Server size={16} /><span>As URLs serão testadas no servidor Woohub. O sistema aceita somente HTTP/HTTPS seguro e bloqueia endereços internos.</span></div></div>
            </CardContent></Card>
            {checks.length > 0 && <Card><CardHeader><CardTitle>Resultado da validação</CardTitle></CardHeader><CardContent className="space-y-2">{checks.map((check) => <div key={check.label} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><span className="flex items-center gap-2">{check.label === "Supabase" ? <Cloud size={16} /> : <Server size={16} />} {check.label}</span><span className={check.reachable || !check.configured ? "text-emerald-700" : "text-red-700"}>{check.message}{check.status ? ` (${check.status})` : ""}</span></div>)}</CardContent></Card>}
            <Button disabled={loading || loadingPlans || !planCode} type="submit" size="lg" className="w-full md:w-auto">{loading ? <><Loader2 className="mr-2 animate-spin" size={18} /> Validando e configurando...</> : <>Concluir configuração <ArrowRight className="ml-2" size={18} /></>}</Button>
        </form>
    </div></main>;
}
