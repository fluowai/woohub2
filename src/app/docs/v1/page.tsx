import { getV1Spec } from "@/lib/v1/openapi";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code, ExternalLink, FileJson } from "lucide-react";

export const metadata = {
    title: "API pública v1 - Woohub",
    description: "Documentação interativa da API pública /api/v1 da Woohub.",
};

export default async function V1DocsPage() {
    const spec = getV1Spec();

    const tags = spec.tags ?? [];
    const paths: Record<string, Record<string, any>> = (spec as any).paths ?? {};

    const pathsByTag: Record<string, Record<string, Record<string, any>>> = {};
    for (const tag of tags) {
        pathsByTag[tag.name] = {};
    }

    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, detail] of Object.entries(methods)) {
            const tagList = (detail as any).tags ?? ["Info"];
            for (const tag of tagList) {
                if (!pathsByTag[tag]) pathsByTag[tag] = {};
                pathsByTag[tag][path] = { ...(pathsByTag[tag][path] ?? {}), [method]: detail };
            }
        }
    }

    const methodColors: Record<string, string> = {
        get: "bg-emerald-100 text-emerald-700 border-emerald-200",
        post: "bg-blue-100 text-blue-700 border-blue-200",
        patch: "bg-amber-100 text-amber-700 border-amber-200",
        delete: "bg-red-100 text-red-700 border-red-200",
        put: "bg-violet-100 text-violet-700 border-violet-200",
    };

    const summary = (detail: any) => detail?.summary ?? detail?.description ?? "";
    const description = (detail: any) => detail?.description ?? "";

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">API pública Woohub</h1>
                        <p className="mt-1 text-sm text-slate-500">Base path: <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">/api/v1</code> · Versão do spec: {spec.info.version}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2" asChild>
                            <Link href="/api/v1/openapi.json" target="_blank">
                                <FileJson className="h-4 w-4" /> OpenAPI JSON
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2" asChild>
                            <Link href="/swagger">
                                <ExternalLink className="h-4 w-4" /> Swagger UI
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="grid gap-6">
                    {tags.map((tag: any) => (
                        <Card key={tag.name} className="glass-panel border-border/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg">{tag.name}</CardTitle>
                                {tag.description && <CardDescription>{tag.description}</CardDescription>}
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {Object.entries(pathsByTag[tag.name] ?? {}).map(([path, methods]: [string, any]) => (
                                    <div key={path} className="rounded-xl border border-border/50 overflow-hidden">
                                        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50/60">
                                            {Object.entries(methods).map(([method, detail]: [string, any]) => (
                                                <span key={method} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${methodColors[method] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                                    {method}
                                                </span>
                                            ))}
                                            <code className="text-xs font-mono text-slate-700 ml-1">{path}</code>
                                        </div>
                                        <div className="px-3 py-2.5 text-sm text-slate-600 space-y-1">
                                            {Object.entries(methods).map(([method, detail]: [string, any]) => (
                                                <p key={method} className="text-xs">
                                                    <span className={`font-bold uppercase mr-1 ${methodColors[method]?.split(" ")[1] ?? "text-slate-600"}`}>{method}</span> {summary(detail)}
                                                </p>
                                            ))}
                                            {description(Object.values(methods)[0]) && (
                                                <p className="text-xs text-muted-foreground">{description(Object.values(methods)[0])}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card className="glass-panel border-border/50 shadow-sm mt-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Code className="h-4 w-4 text-primary" /> Autenticação e escopos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-600 space-y-3">
                        <p>Use <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Authorization: Bearer &lt;chave&gt;</code> ou <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">X-Api-Key: &lt;chave&gt;</code>. A chave é exibida uma única vez na criação.</p>
                        <div className="flex flex-wrap gap-2">
                            {(spec.components?.securitySchemes as any)?.apiKey && (
                                <Badge variant="secondary">API Key</Badge>
                            )}
                            {(spec.components?.securitySchemes as any)?.sessionCookie && (
                                <Badge variant="secondary">Sessão do painel</Badge>
                            )}
                        </div>
                        <div>
                            <p className="font-medium mb-1">Escopos:</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(spec as any)?.info?.description?.match(/`[a-z:]+`/g)?.map((s: string) => (
                                    <code key={s} className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{s}</code>
                                )) ?? <span>Consulte o endpoint de metadados ou o Swagger.</span>}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
