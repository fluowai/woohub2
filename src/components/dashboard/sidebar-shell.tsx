"use client";

import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRoleTheme } from "./role-theme";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface SidebarShellProps {
    appName: string;
    userName?: string | null;
    userEmail?: string | null;
    version: string;
    userRole: string;
}

export function SidebarShell({ appName, userName, userEmail, version, userRole }: SidebarShellProps) {
    const { isCollapsed } = useSidebar();
    const { theme } = useRoleTheme();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const supportMode = pathname.startsWith("/dashboard/super-admin") && Boolean(searchParams.get("supportResellerId"));
    const effectiveRole = supportMode ? "SUPER_ADMIN" : userRole;
    const supportResellerId = searchParams.get("supportResellerId");
    const [effectiveAppName, setEffectiveAppName] = useState(appName);

    useEffect(() => {
        let active = true;
        if (!supportMode || !supportResellerId) {
            setEffectiveAppName(appName);
            return () => { active = false; };
        }
        fetch(`/api/mega-admin/resellers/${encodeURIComponent(supportResellerId)}`)
            .then((response) => response.json())
            .then((payload) => {
                const brandingName = payload?.data?.branding?.name || payload?.data?.name;
                if (active && brandingName) setEffectiveAppName(brandingName);
            })
            .catch(() => undefined);
        return () => { active = false; };
    }, [appName, supportMode, supportResellerId]);

    const isResellerRole = effectiveRole === "SUPER_ADMIN" || effectiveRole === "SUPERADMIN";

    return (
        <aside
            className={`
                bg-white border-r border-slate-200
                hidden md:flex flex-col h-full sticky left-0 top-0 z-20
                shadow-xs
                transition-all duration-300 ease-in-out
                ${isCollapsed ? "w-[72px]" : "w-[260px]"}
            `}
        >
            {/* Logo / Brand matching mockup */}
            <div className={`relative border-b border-slate-100 transition-all duration-300 ${isCollapsed ? "px-2 py-4" : "px-5 py-4"}`}>
                {isCollapsed ? (
                    <div className="flex justify-center" title="WooHub">
                        <svg className="w-8 h-8" viewBox="0 0 48 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="woohub-blue-grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#1d4ed8" />
                                    <stop offset="100%" stopColor="#0284c7" />
                                </linearGradient>
                                <linearGradient id="woohub-cyan-grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#38bdf8" />
                                    <stop offset="100%" stopColor="#0284c7" />
                                </linearGradient>
                            </defs>
                            <path d="M4 10 L16 34 L23 18 L16 10 Z" fill="url(#woohub-blue-grad)" />
                            <path d="M21 18 L28 34 L44 8 L35 8 L27 24 Z" fill="url(#woohub-cyan-grad)" />
                        </svg>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center gap-3">
                            <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 48 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <linearGradient id="woohub-blue-grad-full" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#1d4ed8" />
                                        <stop offset="100%" stopColor="#0284c7" />
                                    </linearGradient>
                                    <linearGradient id="woohub-cyan-grad-full" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#38bdf8" />
                                        <stop offset="100%" stopColor="#0284c7" />
                                    </linearGradient>
                                </defs>
                                <path d="M4 10 L16 34 L23 18 L16 10 Z" fill="url(#woohub-blue-grad-full)" />
                                <path d="M21 18 L28 34 L44 8 L35 8 L27 24 Z" fill="url(#woohub-cyan-grad-full)" />
                            </svg>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                    <span className="text-xl font-black tracking-tight text-slate-900 leading-none">
                                        WooHub
                                    </span>
                                    <span className="text-[9px] font-semibold text-slate-400">®</span>
                                </div>
                                <p className="text-[7.5px] font-bold tracking-wider text-slate-500 uppercase mt-0.5 leading-tight truncate">
                                    API DE COMUNICAÇÃO PARA NEGÓCIOS
                                </p>
                            </div>
                        </div>
                        <p className="text-[6.5px] font-medium tracking-wide text-slate-400 uppercase mt-1 leading-tight text-center">
                            WHATSAPP · INTEGRAÇÕES · AUTOMAÇÃO · ATENDIMENTO
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                                CENTRAL DE OPERAÇÕES
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Operação online" />
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <SidebarNav userRole={effectiveRole} />

            {/* User Footer */}
            <div 
                suppressHydrationWarning={true}
                className={`relative border-t border-slate-200 bg-white transition-all duration-300 ${isCollapsed ? "p-2" : "p-3"}`}
            >
                {isCollapsed ? (
                    <div suppressHydrationWarning={true} className="flex flex-col items-center gap-2">
                        <div suppressHydrationWarning={true} className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold bg-sky-50 text-sky-700 border border-sky-100">
                            {userName?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: "/auth/login" })}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Sair"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div suppressHydrationWarning={true} className="flex items-center gap-2.5 mb-2.5">
                            <div 
                                suppressHydrationWarning={true}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold bg-sky-50 text-sky-700 border border-sky-100 flex-shrink-0"
                            >
                                {userName?.charAt(0)?.toUpperCase() || "PA"}
                            </div>
                            <div suppressHydrationWarning={true} className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-slate-900">{userName || "Paulo Adriano"}</p>
                                <p className="text-[11px] text-slate-500 truncate">{userEmail || "Comercial"}</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full flex items-center justify-center gap-2 text-xs h-8 rounded-lg border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                            onClick={() => signOut({ callbackUrl: "/auth/login" })}
                        >
                            <LogOut size={14} /> Sair
                        </Button>
                        <div className="mt-2 text-center">
                            <p className="text-[9px] text-slate-400 font-medium leading-tight">WooHub · Comunicação e automação</p>
                            <p className="text-[9px] text-slate-400 font-medium leading-tight">Protótipo navegável · PT-BR</p>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}
