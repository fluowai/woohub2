"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";

export type UserRole = "MEGA_ADMIN" | "SUPERADMIN" | "OWNER" | "ADMIN" | "STAFF" | "BILLING" | "USER" | string;

export interface RoleTheme {
    role: UserRole;
    label: string;
    shortLabel: string;
    icon: string;
    gradient: string;
    gradientSoft: string;
    sidebarBg: string;
    sidebarBorder: string;
    headerBg: string;
    headerBorder: string;
    brandGradient: string;
    badgeBg: string;
    badgeText: string;
    accentColor: string;
    accentHover: string;
    glowColor: string;
    isDark: boolean;
}

const ROLE_THEMES: Record<UserRole, RoleTheme> = {
    MEGA_ADMIN: {
        role: "MEGA_ADMIN",
        label: "Mega Admin",
        shortLabel: "MGA",
        icon: "🛡️",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    SUPERADMIN: {
        role: "SUPERADMIN",
        label: "Super Admin",
        shortLabel: "SA",
        icon: "👑",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    OWNER: {
        role: "OWNER",
        label: "Proprietário",
        shortLabel: "OWN",
        icon: "🔑",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    ADMIN: {
        role: "ADMIN",
        label: "Administrador",
        shortLabel: "ADM",
        icon: "⚙️",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    STAFF: {
        role: "STAFF",
        label: "Equipe",
        shortLabel: "STF",
        icon: "👤",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    BILLING: {
        role: "BILLING",
        label: "Financeiro",
        shortLabel: "BILL",
        icon: "💰",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
    USER: {
        role: "USER",
        label: "Usuário",
        shortLabel: "USR",
        icon: "👤",
        gradient: "from-[#FF7A1A] to-[#FF5500]",
        gradientSoft: "from-[#FF7A1A]/10 to-[#FF5500]/10",
        sidebarBg: "bg-[#0B111E]",
        sidebarBorder: "border-slate-800",
        headerBg: "bg-white",
        headerBorder: "border-slate-200",
        brandGradient: "from-[#FF7A1A] to-[#FF5500]",
        badgeBg: "bg-orange-50",
        badgeText: "text-orange-700",
        accentColor: "text-[#FF6600]",
        accentHover: "hover:bg-orange-50 hover:text-orange-700",
        glowColor: "shadow-orange-500/10",
        isDark: false,
    },
};

const DEFAULT_THEME: RoleTheme = ROLE_THEMES.USER;

function getThemeForRole(role: UserRole): RoleTheme {
    return ROLE_THEMES[role] || DEFAULT_THEME;
}

interface RoleThemeContextValue {
    theme: RoleTheme;
    role: UserRole;
}

const RoleThemeContext = createContext<RoleThemeContextValue | null>(null);

interface RoleThemeProviderProps {
    children: ReactNode;
    userRole: UserRole;
}

export function RoleThemeProvider({ children, userRole }: RoleThemeProviderProps) {
    const theme = useMemo(() => getThemeForRole(userRole), [userRole]);

    return (
        <RoleThemeContext.Provider value={{ theme, role: userRole }}>
            {children}
        </RoleThemeContext.Provider>
    );
}

export function useRoleTheme(): RoleThemeContextValue {
    const context = useContext(RoleThemeContext);
    if (!context) {
        return { theme: DEFAULT_THEME, role: "USER" };
    }
    return context;
}

export function getRoleTheme(role: UserRole): RoleTheme {
    return getThemeForRole(role);
}