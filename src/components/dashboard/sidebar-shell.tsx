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
            <div className={`relative border-b border-slate-100 transition-all duration-300 ${isCollapsed ? "px-3 py-4" : "px-6 py-5"}`}>
                {isCollapsed ? (
                    <div className="flex justify-center">
                        {isResellerRole ? (
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-[#ff5a00] font-black text-lg">
                                ▲
                            </div>
                        ) : (
                            <svg className="w-7 h-7 text-[#ff5a00]" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="7" cy="12" r="5" fill="#ff5a00" />
                                <circle cx="16" cy="12" r="6" stroke="#ff5a00" strokeWidth="3" fill="none" />
                            </svg>
                        )}
                    </div>
                ) : (
                    <div>
                        {isResellerRole ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[#ff5a00] text-xl font-black leading-none">▲</span>
                                <h1 className="text-lg font-bold tracking-tight text-slate-900 truncate">
                                    {effectiveAppName || "Woohub"}
                                </h1>
                                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-50 text-slate-500 border border-slate-200 whitespace-nowrap ml-1">
                                    White label
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <svg className="w-6 h-6 text-[#ff5a00] flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                    <circle cx="8" cy="12" r="4.5" fill="#ff5a00" />
                                    <circle cx="15.5" cy="12" r="5" stroke="#ff5a00" strokeWidth="3" />
                                </svg>
                                <span className="text-2xl font-bold tracking-tight text-slate-900">
                                    woohub
                                </span>
                            </div>
                        )}
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
                        <div suppressHydrationWarning={true} className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
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
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 flex-shrink-0"
                            >
                                {userName?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <div suppressHydrationWarning={true} className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-slate-900">{userName || "Usuário"}</p>
                                <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
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
                        <p className="text-[10px] text-slate-400 text-center mt-2 font-mono">v{version}</p>
                    </>
                )}
            </div>
        </aside>
    );
}
