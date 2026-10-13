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
            id: "operacao",
            label: "OPERAÇÃO",
            items: [
                { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
                { href: "/dashboard/sessions", label: "Sessões / QR", icon: QrCode },
                { href: "/dashboard/sessions", label: "Detalhes da sessão", icon: Sliders },
            ],
        },
        {
            id: "mensagens",
            label: "MENSAGENS",
            items: [
                { href: "/dashboard/chat", label: "Conversas", icon: MessageSquare },
                { href: "/dashboard/broadcast", label: "Disparos", icon: Send },
                { href: "/dashboard/sticker", label: "Criador de stickers", icon: Sparkles },
            ],
        },
        {
            id: "contatos",
            label: "CONTATOS",
            items: [
                { href: "/dashboard/contacts", label: "Contatos", icon: Contact },
                { href: "/dashboard/groups", label: "Grupos", icon: Users },
                { href: "/dashboard/labels", label: "Etiquetas", icon: Tag },
            ],
        },
        {
            id: "automacao",
            label: "AUTOMAÇÃO",
            items: [
                { href: "/dashboard/bot-settings", label: "Configurar bot", icon: Bot },
                { href: "/dashboard/autoreply", label: "Respostas automáticas", icon: MessageSquareReply },
                { href: "/dashboard/profile", label: "Perfil do WhatsApp", icon: UserCircle },
                { href: "/dashboard/scheduler", label: "Agendamentos", icon: CalendarClock },
                { href: "/dashboard/webhooks", label: "Webhooks & API", icon: Webhook },
            ],
        },
    ];

    // MEGA ADMIN administrative section
    const megaAdminGroup: NavGroup = {
        id: "mega-admin",
        label: "ADMINISTRAÇÃO MEGA",
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
            <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden space-y-1 styled-scrollbar">
                {activeGroups.map((group) => {
                    const isGroupCollapsed = collapsedGroups[group.id] ?? false;

                    return (
                        <div key={group.id} className="mb-2">
                            {!isCollapsed && group.label && (
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <span>{group.label}</span>
                                    <ChevronDown
                                        size={12}
                                        className={`transition-transform duration-200 ${isGroupCollapsed ? "-rotate-90" : ""}`}
                                    />
                                </button>
                            )}

                            {(!isGroupCollapsed || isCollapsed) && (
                                <div className="space-y-0.5">
                                    {group.items.map((item) => (
                                        <NavLink
                                            key={`${group.id}-${item.label}-${item.href}`}
                                            item={item}
                                            active={isActive(item.href) && (group.id !== "operacao" || item.href === "/dashboard" ? isActive(item.href) : pathname === item.href)}
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
                ${isCollapsed ? "justify-center px-2 py-2.5 mx-1" : "gap-3 px-3 py-2"}
                ${active
                    ? "text-[#0284c7] bg-[#e0f2fe] font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }
            `}
        >
            <Icon
                size={isCollapsed ? 20 : 18}
                className={`flex-shrink-0 transition-colors duration-150 ${active ? "text-[#0284c7]" : "text-slate-400 group-hover:text-slate-700"}`}
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
