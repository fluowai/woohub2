"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "./session-provider";
import { useRoleTheme } from "./role-theme";

export function SessionSelector({ theme }: { theme?: any }) {
    const { sessions, sessionId, setSessionId, loading, refreshSessions } = useSession();
    const selectedSession = sessions.find(s => s.sessionId === sessionId);
    const currentTheme = theme || useRoleTheme().theme;

    return (
        <div className="flex items-center gap-1">
            <div className="w-[160px] sm:w-[190px]">
                <Select value={sessionId} onValueChange={setSessionId} disabled={loading && sessions.length === 0}>
                    <SelectTrigger className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 transition-colors rounded-lg text-xs font-medium text-slate-700 shadow-xs focus:ring-1 focus:ring-[#0284c7]">
                        <SelectValue placeholder="Comercial · sessão demo">
                            {selectedSession ? (
                                <div className="flex items-center gap-1.5 text-left truncate">
                                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${selectedSession.status === "CONNECTED" ? "bg-emerald-500" : "bg-slate-300"}`} />
                                    <span className="truncate font-medium text-xs text-slate-800">{selectedSession.name}</span>
                                </div>
                            ) : (
                                <span className="text-xs text-slate-700 font-medium">Comercial · sessão demo</span>
                            )}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className={`rounded-xl border ${currentTheme.sidebarBorder} shadow-lg p-1 ${currentTheme.sidebarBg} ${currentTheme.glowColor}`}>
                        {sessions.map((s) => (
                            <SelectItem key={s.sessionId} value={s.sessionId} className="rounded-lg py-2 focus:bg-muted/50 cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2 flex-shrink-0">
                                        {s.status === "CONNECTED" && (
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        )}
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${s.status === "CONNECTED" ? "bg-emerald-500" : "bg-destructive"}`}></span>
                                    </span>
                                    <div className="flex flex-col">
                                        <span className={`font-medium text-sm ${currentTheme.isDark ? "text-white" : "text-foreground"}`}>{s.name}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">{s.sessionId}</span>
                                    </div>
                                </div>
                            </SelectItem>
                        ))}
                        {sessions.length === 0 && !loading && (
                            <div className="py-6 px-2 text-xs text-muted-foreground text-center">
                                Nenhuma instância encontrada.
                            </div>
                        )}
                    </SelectContent>
                </Select>
            </div>
            <Button variant="ghost" size="icon" className={`h-9 w-9 hover:bg-muted/50 rounded-xl ${currentTheme.accentHover}`} onClick={refreshSessions} title="Atualizar instâncias" disabled={loading}>
                <RefreshCw className={`h-4 w-4 text-muted-foreground hover:text-foreground ${loading ? 'animate-spin' : ''} ${currentTheme.accentColor}`} />
            </Button>
        </div>
    );
}
