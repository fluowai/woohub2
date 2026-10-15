"use client";

import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRoleTheme } from "./role-theme";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { WooTechLogo } from "@/components/ui/wootech-logo";

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

    // Format initials and display name matching mockup "WooTech Admin" / "admin@wootech.com.br"
    const displayName = userName || "WooTech Admin";
    const displayEmail = userEmail || "admin@wootech.com.br";
    const displayInitials = displayName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "WA";

    return (
        <aside
            className={`
                bg-[#0B111E] border-r border-slate-800/80 text-slate-300
                hidden md:flex flex-col h-full sticky left-0 top-0 z-20
                shadow-xl
                transition-all duration-300 ease-in-out
                ${isCollapsed ? "w-[72px]" : "w-[260px]"}
            `}
        >
            {/* Logo / Brand matching mockup */}
            <div className={`relative border-b border-slate-800/60 transition-all duration-300 ${isCollapsed ? "px-2 py-4 flex justify-center" : "px-5 py-5"}`}>
                {isCollapsed ? (
                    <div className="flex justify-center" title="WOOTECH">
                        <WooTechLogo variant="icon" iconSize={30} />
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center justify-between">
                            <WooTechLogo variant="sidebar" iconSize={36} colorMode="dark" />
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                            <span>PAINEL PRINCIPAL</span>
                            <span className="flex items-center gap-1.5 text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                ONLINE
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <SidebarNav userRole={effectiveRole} />

            {/* User Footer matching mockup card */}
            <div 
                suppressHydrationWarning={true}
                className={`relative border-t border-slate-800/80 bg-[#070B14] transition-all duration-300 ${isCollapsed ? "p-2" : "p-3.5"}`}
            >
                {isCollapsed ? (
                    <div suppressHydrationWarning={true} className="flex flex-col items-center gap-2">
                        <div suppressHydrationWarning={true} className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-[#FF7A1A] to-[#FF5500] text-white shadow-xs">
                            {displayInitials}
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: "/auth/login" })}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800/60 transition-colors"
                            title="Sair"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div suppressHydrationWarning={true} className="flex items-center gap-3 mb-3">
                            <div 
                                suppressHydrationWarning={true}
                                className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-extrabold bg-gradient-to-br from-[#FF7A1A] to-[#FF5500] text-white shadow-md flex-shrink-0"
                            >
                                {displayInitials}
                            </div>
                            <div suppressHydrationWarning={true} className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate text-white">{displayName}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{displayEmail}</p>
                                <p className="text-[9px] font-semibold text-[#FF7A1A] uppercase tracking-wider mt-0.5">
                                    {effectiveRole === "MEGA_ADMIN" ? "Mega Admin" : effectiveRole === "SUPER_ADMIN" ? "Super Admin" : "Administrador"}
                                </p>
                            </div>
                            <button
                                onClick={() => signOut({ callbackUrl: "/auth/login" })}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition-colors"
                                title="Encerrar sessão"
                            >
                                <LogOut size={15} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}
