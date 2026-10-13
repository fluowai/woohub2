"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
    Home,
    Users,
    UserCheck,
    Database,
    CreditCard,
    Globe,
    Activity,
    FileText,
    Shield,
    Package,
    Palette,
    Crown,
    LayoutDashboard,
    QrCode,
    MessageSquare,
    Contact,
    Bot,
    CalendarClock,
    KeyRound,
    Webhook,
    PanelLeftClose,
    PanelLeft,
    ChevronDown,
} from "lucide-react";
import { useSidebar } from "./sidebar-context";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: string;
    external?: boolean;
}

interface NavGroup {
    id: string;
    label?: string;
    items: NavItem[];
}

interface SidebarNavProps {
    userRole?: string;
}

export function SidebarNav({ userRole: propUserRole }: SidebarNavProps = {}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const supportResellerId = searchParams.get("supportResellerId");
    const supportQuery = supportResellerId ? `?supportResellerId=${encodeURIComponent(supportResellerId)}` : "";
    const { data: session } = useSession();
    const { isCollapsed, toggleCollapse } = useSidebar();
    // @ts-ignore
    const sessionRole = session?.user?.role;
    let userRole = propUserRole || sessionRole || "USER";

    // Pathname fallback: on mega-admin or super-admin routes, always show respective navigation
    if (pathname.startsWith("/dashboard/mega-admin")) {
        userRole = "MEGA_ADMIN";
    } else if (pathname.startsWith("/dashboard/super-admin")) {
        userRole = "SUPER_ADMIN";
    }

    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (id: string) => {
        setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        if (href === "/dashboard/mega-admin") return pathname === "/dashboard/mega-admin" || pathname === "/dashboard";
        if (href === "/dashboard/super-admin") return pathname === "/dashboard/super-admin" || pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    // 1. MEGA ADMIN — núcleo operacional da central
    const megaAdminGroups: NavGroup[] = [
        {
            id: "mega-main",
            items: [
                { href: "/dashboard/mega-admin", label: "Visão geral", icon: Home },
                { href: "/dashboard/mega-admin/stacks", label: "Stacks e instalações", icon: Database },
                { href: "/dashboard/mega-admin/support", label: "Suporte", icon: Users },
                { href: "/dashboard/plans", label: "Planos e cobrança", icon: CreditCard },
                { href: "/dashboard/mega-admin/licenses", label: "Licenças", icon: Shield },
                { href: "/dashboard/mega-admin/library", label: "Biblioteca e documentação", icon: FileText },
            ],
        },
    ];

    // 2. SUPER ADMIN NAVIGATION - Exactly 8 items matching mockup
    const superAdminGroups: NavGroup[] = [
        {
            id: "super-main",
            items: [
                { href: `/dashboard/super-admin${supportQuery}`, label: "Visão geral", icon: Home },
                { href: `/dashboard/super-admin/clients${supportQuery}`, label: "Meus clientes", icon: Users },
                { href: `/dashboard/super-admin/instances${supportQuery}`, label: "Instâncias", icon: Database },
                { href: `/dashboard/super-admin/plans${supportQuery}`, label: "Planos de revenda", icon: Package },
                { href: `/dashboard/super-admin/billing${supportQuery}`, label: "Cobrança", icon: CreditCard },
                { href: `/dashboard/super-admin/branding${supportQuery}`, label: "Minha marca", icon: Palette },
                { href: `/dashboard/super-admin/domain${supportQuery}`, label: "Meu domínio", icon: Globe },
                { href: `/dashboard/super-admin/my-subscription${supportQuery}`, label: "Minha assinatura", icon: Crown },
            ],
        },
    ];

    // 3. ADMIN NAVIGATION (CLIENT ADMIN / OWNER)
    const adminGroups: NavGroup[] = [
        {
            id: "admin-main",
            label: "Empresa",
            items: [
                { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
                { href: "/dashboard/sessions", label: "Minhas instâncias", icon: QrCode },
                { href: "/dashboard/chat", label: "Atendimento", icon: MessageSquare },
                { href: "/dashboard/contacts", label: "Contatos e grupos", icon: Contact },
                { href: "/dashboard/autoreply", label: "Automações e respostas", icon: Bot },
                { href: "/dashboard/scheduler", label: "Agendamentos", icon: CalendarClock },
                { href: "/dashboard/api-keys", label: "Chaves de API", icon: KeyRound },
                { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
                { href: "/dashboard/team", label: "Equipe", icon: Users },
                { href: "/dashboard/billing", label: "Consumo e assinatura", icon: CreditCard },
                { href: "/docs", label: "Documentação", icon: FileText, external: true },
            ],
        },
    ];

    // 4. USER NAVIGATION (OPERATIONAL USER - NO CREATION / NO ADMIN)
    const userGroups: NavGroup[] = [
        {
            id: "user-main",
            label: "Operação",
            items: [
                { href: "/dashboard/chat", label: "Atendimento", icon: MessageSquare },
                { href: "/dashboard/sessions", label: "Instâncias (Consulta)", icon: QrCode },
                { href: "/dashboard/contacts", label: "Contatos e histórico", icon: Contact },
            ],
        },
    ];

    let activeGroups = adminGroups;
    if (userRole === "MEGA_ADMIN") {
        activeGroups = megaAdminGroups;
    } else if (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN") {
        activeGroups = superAdminGroups;
    } else if (userRole === "USER") {
        activeGroups = userGroups;
    }

    return (
        <TooltipProvider delayDuration={0}>
            <nav className="flex-1 px-3 py-4 overflow-y-auto overflow-x-hidden space-y-1 styled-scrollbar">
                {activeGroups.map((group) => {
                    const isGroupCollapsed = collapsedGroups[group.id] ?? false;

                    return (
                        <div key={group.id} className="mb-2">
                            {!isCollapsed && group.label && (
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <span>{group.label}</span>
                                    <ChevronDown
                                        size={12}
                                        className={`transition-transform duration-200 ${isGroupCollapsed ? "-rotate-90" : ""}`}
                                    />
                                </button>
                            )}

                            {(!isGroupCollapsed || isCollapsed) && (
                                <div className="space-y-1">
                                    {group.items.map((item) => (
                                        <NavLink
                                            key={item.href}
                                            item={item}
                                            active={isActive(item.href)}
                                            isCollapsed={isCollapsed}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Collapse Toggle */}
            <div className="px-3 py-2 border-t border-slate-100">
                <button
                    onClick={toggleCollapse}
                    className="flex items-center justify-center w-full gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
                >
                    {isCollapsed ? (
                        <PanelLeft size={18} />
                    ) : (
                        <>
                            <PanelLeftClose size={16} />
                            <span>Recolher menu</span>
                        </>
                    )}
                </button>
            </div>
        </TooltipProvider>
    );
}

function NavLink({ item, active, isCollapsed }: { item: NavItem; active: boolean; isCollapsed: boolean }) {
    const Icon = item.icon;

    const linkContent = (
        <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            className={`
                flex items-center rounded-xl text-[13px] font-medium
                transition-all duration-150 group relative
                ${isCollapsed ? "justify-center px-2 py-2.5 mx-1" : "gap-3 px-3.5 py-2.5"}
                ${active
                    ? "text-[#ff5a00] bg-[#fff4ed] font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }
            `}
        >
            <Icon
                size={isCollapsed ? 20 : 18}
                className={`flex-shrink-0 transition-colors duration-150 ${active ? "text-[#ff5a00]" : "text-slate-500 group-hover:text-slate-800"}`}
            />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
        </Link>
    );

    if (isCollapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                    <p className="text-xs font-medium">{item.label}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    return linkContent;
}
