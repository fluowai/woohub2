"use client";

import { useState, useEffect } from "react";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SessionSelector } from "@/components/dashboard/session-selector";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Inbox, Trash2, Search, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import { useRoleTheme } from "./role-theme";

interface NavbarProps {
    appName?: string;
    userRole: string;
}

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    href?: string;
    createdAt: string;
}

export function Navbar({ appName, userRole }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const { theme } = useRoleTheme();
    const supportMode = pathname.startsWith("/dashboard/super-admin") && Boolean(searchParams.get("supportResellerId"));
    const effectiveRole = supportMode ? "SUPER_ADMIN" : userRole;

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const responseData = await res.json();
                const items = responseData?.data || [];
                setNotifications(items);
                setUnreadCount(items.filter((n: Notification) => !n.read).length);
            }
        } catch (e) {
            console.error("Failed to fetch notifications");
        }
    };

    useEffect(() => {
        fetchNotifications();

        if (session?.user?.id) {
            const socketInstance = io({
                path: "/api/socket/io",
            });

            socketInstance.on("connect", () => {
                socketInstance.emit("join-user-room", session.user.id);
            });

            socketInstance.on("notification:new", (notification: Notification) => {
                setNotifications((prev) => [notification, ...prev]);
                setUnreadCount((prev) => prev + 1);

                toast.info(notification.title, {
                    description: notification.message,
                    action: notification.href
                        ? {
                              label: "Ver",
                              onClick: () => router.push(notification.href!),
                          }
                        : undefined,
                });
            });

            setSocket(socketInstance);

            return () => {
                socketInstance.disconnect();
            };
        }
    }, [session?.user?.id]);

    const markAsRead = async (id?: string) => {
        try {
            const ids = id ? [id] : [];
            const res = await fetch("/api/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });
            if (res.ok) {
                if (id) {
                    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
                    setUnreadCount((prev) => Math.max(0, prev - 1));
                } else {
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                    setUnreadCount(0);
                }
            }
        } catch (e) {
            console.error("Failed to mark read");
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            const res = await fetch(`/api/notifications/delete?id=${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setNotifications((prev) => prev.filter((n) => n.id !== id));
                setUnreadCount((prev) => {
                    const notification = notifications.find((n) => n.id === id);
                    return notification && !notification.read ? Math.max(0, prev - 1) : prev;
                });
                toast.success("Notificação excluída");
            }
        } catch (e) {
            console.error("Failed to delete notification");
            toast.error("Falha ao excluir");
        }
    };

    const handleNotificationClick = (n: Notification) => {
        if (!n.read) markAsRead(n.id);
        if (n.href) router.push(n.href);
        setIsOpen(false);
    };

    let searchPlaceholder = "Buscar conversas, contatos...";
    if (effectiveRole === "MEGA_ADMIN") {
        searchPlaceholder = "Buscar revendedores, clientes, domínios...";
    } else if (effectiveRole === "SUPER_ADMIN" || effectiveRole === "SUPERADMIN") {
        searchPlaceholder = "Buscar clientes, instâncias...";
    }

    const userName = session?.user?.name || "Usuário";
    const userInitials = userName
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
    const isMega = effectiveRole === "MEGA_ADMIN";
    const isSuper = effectiveRole === "SUPER_ADMIN" || effectiveRole === "SUPERADMIN";

    const displayName = session?.user?.name || (isMega ? "Administrador" : isSuper ? "João Silva" : "Usuário");
    const displayRole = isMega ? "Mega Admin" : isSuper ? "Super Admin" : theme.label;
    const displayInitials = isMega && displayName === "Administrador" ? "AD" : isSuper && displayName === "João Silva" ? "JS" : userInitials;

    const breadcrumbLabel = 
        pathname === "/dashboard" ? "Visão geral" :
        pathname.startsWith("/dashboard/sessions") ? "Sessões / QR" :
        pathname.startsWith("/dashboard/chat") ? "Conversas" :
        pathname.startsWith("/dashboard/broadcast") ? "Disparos" :
        pathname.startsWith("/dashboard/sticker") ? "Criador de stickers" :
        pathname.startsWith("/dashboard/contacts") ? "Contatos" :
        pathname.startsWith("/dashboard/groups") ? "Grupos" :
        pathname.startsWith("/dashboard/labels") ? "Etiquetas" :
        pathname.startsWith("/dashboard/bot-settings") ? "Configurar bot" :
        pathname.startsWith("/dashboard/autoreply") ? "Respostas automáticas" :
        pathname.startsWith("/dashboard/profile") ? "Perfil do WhatsApp" :
        pathname.startsWith("/dashboard/scheduler") ? "Agendamentos" :
        pathname.startsWith("/dashboard/webhooks") ? "Webhooks & API" :
        pathname.startsWith("/dashboard/mega-admin") ? "Mega Admin" :
        pathname.startsWith("/dashboard/super-admin") ? "Super Admin" : "Painel";

    return (
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 w-full shadow-xs">
            <div className="flex items-center gap-4 flex-1">
                <MobileNav appName={appName} theme={theme} userRole={effectiveRole} />

                {/* Breadcrumbs matching mockup */}
                <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="text-slate-400">Workspace</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-700 font-semibold">{breadcrumbLabel}</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* Modo demonstração pill matching mockup */}
                <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#e0f2fe] text-[#0284c7] border border-sky-100">
                    Modo demonstração
                </span>

                {/* Instance selector for client/admin */}
                <SessionSelector theme={theme} />

                {/* Notifications Popover */}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <button
                            className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-full transition-colors"
                            aria-label="Notificações"
                        >
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#0284c7] rounded-full ring-2 ring-white" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-80 p-0 rounded-xl border border-slate-200 shadow-xl bg-white"
                        align="end"
                    >
                        <div className="p-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h4 className="font-semibold text-sm text-slate-900 leading-none">Notificações</h4>
                                <p className="text-xs text-slate-500 mt-1">
                                    {unreadCount > 0 ? `${unreadCount} não lidas` : "Tudo atualizado"}
                                </p>
                            </div>
                            {unreadCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => markAsRead()}
                                    className="h-auto py-1 px-2 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                                >
                                    Ler todas
                                </Button>
                            )}
                        </div>
                        <div className="max-h-[280px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="min-h-[130px] flex flex-col items-center justify-center text-center p-4">
                                    <div className="bg-slate-100 p-2.5 rounded-full mb-2">
                                        <Inbox className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <p className="text-xs font-medium text-slate-700">Sem notificações</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            className={`p-3 hover:bg-slate-50 transition-colors ${!n.read ? "bg-sky-50/40" : ""}`}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div
                                                    className="flex-1 cursor-pointer"
                                                    onClick={() => handleNotificationClick(n)}
                                                >
                                                    <p className={`text-xs font-semibold ${!n.read ? "text-[#0284c7]" : "text-slate-800"}`}>
                                                        {n.title}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                                        {n.message}
                                                    </p>
                                                    <p className="text-[9px] text-slate-400 mt-1 font-mono">
                                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-slate-400 hover:text-red-500"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteNotification(n.id);
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* User Profile Avatar matching mockup ("PA" in blue) */}
                <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity">
                    <div className="h-8 w-8 rounded-full bg-[#e0f2fe] border border-sky-200 flex items-center justify-center text-xs font-bold text-[#0284c7] select-none shadow-xs">
                        {displayInitials || "PA"}
                    </div>
                </div>
            </div>
        </header>
    );
}
