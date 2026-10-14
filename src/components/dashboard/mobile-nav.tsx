"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, ChevronDown } from "lucide-react";
import Link from "next/link";
import {
    LayoutDashboard,
    MessageSquare,
    Users,
    Settings,
    LogOut,
    QrCode,
    ImageIcon,
    Webhook,
    CalendarClock,
    Bot,
    Bell,
    FileText,
    Code,
    UserCheck,
    Megaphone,
    HardDrive,
    Activity,
    UserCircle,
    Tag,
    MessageCircleReply,
    UserPlus,
    CreditCard,
    KeyRound,
    User,
    ListTodo,
    Building2,
    Link2,
    ScrollText,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import pkg from "../../../package.json";

import { useRoleTheme } from "./role-theme";

interface NavGroup {
    label: string;
    items: {
        href: string;
        label: string;
        icon: React.ElementType;
        external?: boolean;
        superadminOnly?: boolean;
        megaAdminOnly?: boolean;
        allowedRoles?: string[];
    }[];
}

// Keep in sync with sidebar-nav.tsx
const megaAdminMobileGroups: NavGroup[] = [
    {
        label: "Administração Global",
        items: [
            { href: "/dashboard/mega-admin", label: "Visão geral", icon: LayoutDashboard },
            { href: "/dashboard/mega-admin/resellers", label: "Revendedores", icon: Users },
            { href: "/dashboard/mega-admin/direct-clients", label: "Clientes diretos", icon: UserCheck },
            { href: "/dashboard/mega-admin/instances", label: "Instâncias", icon: HardDrive },
            { href: "/dashboard/plans", label: "Planos e cobrança", icon: CreditCard },
            { href: "/dashboard/mega-admin/domains", label: "Domínios", icon: Link2 },
            { href: "/dashboard/system-monitor", label: "Saúde da API", icon: Activity },
            { href: "/dashboard/mega-admin/audit", label: "Auditoria", icon: ScrollText },
        ],
    },
];

const superAdminMobileGroups: NavGroup[] = [
    {
        label: "Revenda White Label",
        items: [
            { href: "/dashboard/super-admin", label: "Visão geral", icon: LayoutDashboard },
            { href: "/dashboard/super-admin/clients", label: "Meus clientes", icon: Users },
            { href: "/dashboard/super-admin/instances", label: "Instâncias", icon: HardDrive },
            { href: "/dashboard/super-admin/plans", label: "Planos de revenda", icon: CreditCard },
            { href: "/dashboard/super-admin/billing", label: "Cobrança", icon: CreditCard },
            { href: "/dashboard/super-admin/branding", label: "Minha marca", icon: Settings },
            { href: "/dashboard/super-admin/domain", label: "Meu domínio", icon: Link2 },
            { href: "/dashboard/super-admin/my-subscription", label: "Minha assinatura", icon: Tag },
        ],
    },
];

const navGroups: NavGroup[] = [
    {
        label: "OPERAÇÃO",
        items: [
            { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
            { href: "/dashboard/sessions", label: "Sessões / QR", icon: QrCode },
        ],
    },
    {
        label: "MENSAGENS",
        items: [
            { href: "/dashboard/chat", label: "Conversas", icon: MessageSquare },
            { href: "/dashboard/broadcast", label: "Disparos", icon: Megaphone },
            { href: "/dashboard/sticker", label: "Criador de stickers", icon: ImageIcon },
        ],
    },
    {
        label: "CONTATOS",
        items: [
            { href: "/dashboard/contacts", label: "Contatos", icon: UserCheck },
            { href: "/dashboard/groups", label: "Grupos", icon: Users },
            { href: "/dashboard/labels", label: "Etiquetas", icon: Tag },
        ],
    },
    {
        label: "AUTOMAÇÃO",
        items: [
            { href: "/dashboard/bot-settings", label: "Configurar bot", icon: Bot },
            { href: "/dashboard/autoreply", label: "Respostas automáticas", icon: MessageCircleReply },
            { href: "/dashboard/profile", label: "Perfil do WhatsApp", icon: UserCircle },
            { href: "/dashboard/scheduler", label: "Agendamentos", icon: CalendarClock },
            { href: "/dashboard/webhooks", label: "Webhooks & API", icon: Webhook },
        ],
    },
    {
        label: "ADMINISTRAÇÃO",
        items: [
            { href: "/dashboard/team", label: "Equipe", icon: UserCheck, allowedRoles: ["SUPERADMIN", "OWNER", "MEGA_ADMIN"] },
            { href: "/dashboard/api-keys", label: "Chaves de API", icon: KeyRound, allowedRoles: ["SUPERADMIN", "OWNER", "MEGA_ADMIN"] },
            { href: "/dashboard/billing", label: "Planos e uso", icon: CreditCard },
            { href: "/docs", label: "Documentação", icon: FileText, external: true },
        ],
    },
];

export function MobileNav({ appName = "Woohub", theme, userRole: propUserRole }: { appName?: string; theme?: any; userRole?: string }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const { data: session } = useSession();
    // @ts-ignore
    const sessionRole = session?.user?.role;
    let userRole = propUserRole || sessionRole;

    if (pathname.startsWith("/dashboard/mega-admin")) {
        userRole = "MEGA_ADMIN";
    } else if (pathname.startsWith("/dashboard/super-admin")) {
        userRole = "SUPER_ADMIN";
    }

    const currentTheme = theme || useRoleTheme().theme;

    const activeNavGroups =
        userRole === "MEGA_ADMIN" ? megaAdminMobileGroups :
        (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN") ? superAdminMobileGroups :
        navGroups;

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        if (href === "/dashboard/mega-admin") return pathname === "/dashboard/mega-admin" || pathname === "/dashboard";
        if (href === "/dashboard/super-admin") return pathname === "/dashboard/super-admin" || pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className={`w-[85vw] sm:w-[320px] p-0 flex flex-col ${currentTheme.sidebarBg} ${currentTheme.sidebarBorder}`}>
                <SheetHeader className={`px-5 py-4 text-left border-b ${currentTheme.sidebarBorder}`}>
                    <SheetTitle className={`text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${currentTheme.brandGradient}`}>
                        {appName}
                    </SheetTitle>
                    <SheetDescription className={`text-[11px] text-muted-foreground -mt-1 ${currentTheme.accentColor}`}>API de WhatsApp</SheetDescription>
                </SheetHeader>

                <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
                    {activeNavGroups.map((group) => {
                        const visibleItems = group.items.filter((item) => {
                            if (item.superadminOnly && userRole !== "SUPERADMIN" && userRole !== "MEGA_ADMIN") return false;
                            if (item.megaAdminOnly && userRole !== "MEGA_ADMIN") return false;
                            if (item.allowedRoles && (!userRole || !item.allowedRoles.includes(userRole))) return false;
                            return true;
                        });
                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={group.label} className="mb-1">
                                {group.label !== "Principal" && (
                                    <p className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${currentTheme.accentColor}`}>
                                        {group.label}
                                    </p>
                                )}
                                <div className="space-y-0.5">
                                    {visibleItems.map(({ href, label, icon: Icon, external }) => (
                                        <Link
                                            key={href}
                                            href={href}
                                            target={external ? "_blank" : undefined}
                                            onClick={() => setOpen(false)}
                                            className={`
                                                flex items-center rounded-xl text-sm font-medium
                                                transition-all duration-200 group relative
                                                gap-3 px-3.5 py-2.5
                                                ${isActive(href)
                                                    ? "text-[#0284c7] bg-[#e0f2fe] font-semibold"
                                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                }
                                            `}
                                        >
                                            <Icon
                                                size={18}
                                                className={`flex-shrink-0 transition-colors duration-200 ${isActive(href) ? "text-[#0284c7]" : "text-slate-400 group-hover:text-slate-700"}`}
                                            />
                                            <span className="truncate">{label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </nav>

                <div className={`p-4 border-t ${currentTheme.sidebarBorder} ${currentTheme.sidebarBg}/50`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${currentTheme.badgeBg} ${currentTheme.badgeText}`}>
                            {session?.user?.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${currentTheme.isDark ? "text-white" : "text-gray-900"}`}>{session?.user?.name || "Usuário"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className={`w-full flex items-center justify-center gap-2 text-xs h-8 ${currentTheme.sidebarBorder} hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors`}
                        onClick={async () => {
                            setOpen(false);
                            await signOut({ callbackUrl: "/auth/login" });
                        }}
                    >
                        <LogOut size={14} /> Sair
                    </Button>
                    <p className={`text-[10px] text-muted-foreground/50 text-center mt-2 font-mono ${currentTheme.isDark ? "text-gray-400" : "text-gray-500"}`}>v{pkg.version}</p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
