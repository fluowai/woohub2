"use client";

import { useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";

interface RoleBannerProps {
    userRole?: string;
}

export function RoleBanner({ userRole }: RoleBannerProps = {}) {
    const { data: session } = useSession();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    // @ts-ignore
    const role = userRole || session?.user?.role;

    const supportMode = pathname.startsWith("/dashboard/super-admin") && Boolean(searchParams.get("supportResellerId"));
    const isMega = !supportMode && (role === "MEGA_ADMIN" || pathname.includes("/mega-admin"));
    const isSuper = supportMode || role === "SUPER_ADMIN" || role === "SUPERADMIN" || pathname.includes("/super-admin");

    if (!isMega && !isSuper) {
        return null;
    }

    return (
        <div className="w-full bg-[#f8fafc] border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs select-none z-30">
            <div className="flex items-center gap-3">
                <span className="bg-[#ff5a00] text-white font-bold px-3 py-1 rounded-md text-[11px] tracking-wide uppercase shadow-xs">
                    {isMega ? "MEGA ADMIN • Dono da API" : "SUPER ADMIN • Revenda white label"}
                </span>
                <span className="text-slate-600 font-normal text-xs hidden sm:inline">
                    {isMega
                        ? "Controle total da plataforma, revendedores, clientes e domínios."
                        : "Gerencia os clientes, instâncias e a marca desta operação de revenda."}
                </span>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                    DADOS REAIS DO BANCO
                </div>
            </div>
        </div>
    );
}

