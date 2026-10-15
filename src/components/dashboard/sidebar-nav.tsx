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
    Send,
    Sparkles,
    Tag,
    MessageSquareReply,
    UserCircle,
    Sliders,
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
        if (href === "/dashboard/mega-admin") return pathname === "/dashboard/mega-admin";
        if (href === "/dashboard/super-admin") return pathname === "/dashboard/super-admin";
        return pathname.startsWith(href);
    };

    // Standard Workspace Groups matching Mockup 100%
    const operationalGroups: NavGroup[] = [
        {
            id: "principal",
            items: [
                { href: "/dashboard", label: "Início", icon: Home },
                { href: "/dashboard/sessions", label: "Instâncias", icon: QrCode },
                { href: "/dashboard/chat", label: "Conversas", icon: MessageSquare },
                { href: "/dashboard/broadcast", label: "Campanhas", icon: Send },
                { href: "/dashboard/contacts", label: "Contatos", icon: Contact },
                { href: "/dashboard/labels", label: "Etiquetas", icon: Tag },
                { href: "/dashboard/autoreply", label: "Automações", icon: Bot },
                { href: "/dashboard/system-monitor", label: "Relatórios", icon: Activity },
                { href: "/dashboard/settings", label: "Configurações", icon: Sliders },
            ],
        },
        {
            id: "recursos",
            label: "RECURSOS EXTRAS",
            items: [
                { href: "/dashboard/groups", label: "Grupos WhatsApp", icon: Users },
                { href: "/dashboard/scheduler", label: "Agendamentos", icon: CalendarClock },
                { href: "/dashboard/webhooks", label: "Webhooks & API", icon: Webhook },
                { href: "/dashboard/sticker", label: "Criador de stickers", icon: Sparkles },
                { href: "/dashboard/profile", label: "Perfil comercial", icon: UserCircle },
            ],
        },
    ];

    // MEGA ADMIN administrative section
    const megaAdminGroup: NavGroup = {
        id: "mega-admin",
        label: "ADMINISTRAÇÃO",
        items: [
            { href: "/dashboard/mega-admin", label: "Painel Mega Admin", icon: Shield },
            { href: "/dashboard/mega-admin/stacks", label: "Stacks e instalações", icon: Database },
            { href: "/dashboard/plans", label: "Planos e cobrança", icon: CreditCard },
            { href: "/dashboard/mega-admin/licenses", label: "Licenças", icon: KeyRound },
        ],
    };

    // SUPER ADMIN administrative section
    const superAdminGroup: NavGroup = {
        id: "super-admin",
        label: "REVENDA WHITE LABEL",
        items: [
            { href: `/dashboard/super-admin${supportQuery}`, label: "Painel Super Admin", icon: Crown },
            { href: `/dashboard/super-admin/clients${supportQuery}`, label: "Meus clientes", icon: Users },
            { href: `/dashboard/super-admin/plans${supportQuery}`, label: "Planos de revenda", icon: Package },
            { href: `/dashboard/super-admin/branding${supportQuery}`, label: "Minha marca", icon: Palette },
        ],
    };

    let activeGroups = [...operationalGroups];
    if (userRole === "MEGA_ADMIN") {
        activeGroups.push(megaAdminGroup);
    } else if (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN") {
        activeGroups.push(superAdminGroup);
    }

    return (
        <TooltipProvider delayDuration={0}>
            <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden space-y-2 styled-scrollbar">
                {activeGroups.map((group) => {
                    const isGroupCollapsed = collapsedGroups[group.id] ?? false;

                    return (
                        <div key={group.id} className="mb-2">
                            {!isCollapsed && group.label && (
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
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
                                            key={`${group.id}-${item.label}-${item.href}`}
                                            item={item}
                                            active={isActive(item.href) && (item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href))}
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
            <div className="px-3 py-2 border-t border-slate-800/60">
                <button
                    onClick={toggleCollapse}
                    className="flex items-center justify-center w-full gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all duration-200"
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
                    ? "text-white bg-[#FF6600] font-bold shadow-md shadow-orange-600/30"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                }
            `}
        >
            <Icon
                size={isCollapsed ? 20 : 18}
                className={`flex-shrink-0 transition-colors duration-150 ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`}
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
