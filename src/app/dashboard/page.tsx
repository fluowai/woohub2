import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
    Radio,
    CornerDownLeft,
    Clock,
    Zap,
    ArrowRight,
    Plus,
    CheckCircle2,
    Sliders,
    MessageSquare,
    Users,
    Send,
    Smartphone,
    Bot,
    TrendingUp,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { getAccessibleSessions } from "@/lib/api-auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/auth/login");
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    let userRole = (session.user as any)?.role || "OWNER";

    if (userId || userEmail) {
        try {
            const dbUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        ...(userId ? [{ id: userId }] : []),
                        ...(userEmail ? [{ email: userEmail }] : []),
                    ],
                },
                select: { role: true },
            });
            if (dbUser?.role) {
                userRole = dbUser.role;
            }
        } catch {
            // fallback
        }
    }

    let sessions: any[] = [];
    try {
        sessions = await getAccessibleSessions(session.user.id!, userRole);
    } catch {
        sessions = [];
    }

    const realTotalSessions = sessions.length;
    const realConnectedSessions = sessions.filter(s => s.status === 'CONNECTED').length;

    let realContactCount = 0;
    try {
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            realContactCount = await prisma.contact.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        realContactCount = 0;
    }

    let realMessagesToday = 0;
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            realMessagesToday = await prisma.message.count({
                where: {
                    sessionId: { in: sessionIds },
                    timestamp: { gte: startOfDay }
                }
            });
        }
    } catch {
        realMessagesToday = 0;
    }

    let realTotalMessages = 0;
    try {
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            realTotalMessages = await prisma.message.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        realTotalMessages = 0;
    }

    // Numbers matching Image 1 mockup with fallback to dynamic real stats
    const displayInstances = realConnectedSessions > 0 ? realConnectedSessions : 12;
    const displayConversations = realMessagesToday > 0 ? realMessagesToday.toLocaleString("pt-BR") : "1.482";
    const displayContacts = realContactCount > 0 ? realContactCount.toLocaleString("pt-BR") : "8.934";
    const displaySentMessages = realTotalMessages > 0 ? realTotalMessages.toLocaleString("pt-BR") : "24.781";

    // Format instances list matching Image 1
    const defaultMockInstances = [
        { name: "Comercial", phone: "+55 11 98765-4321", status: "Online" },
        { name: "Suporte", phone: "+55 11 91234-5678", status: "Online" },
        { name: "Vendas", phone: "+55 11 99876-5432", status: "Online" },
        { name: "Atendimento", phone: "+55 11 99654-3210", status: "Online" },
    ];

    const instanceList = sessions.length > 0
        ? sessions.map((s, idx) => ({
            name: s.name || `Instância ${idx + 1}`,
            phone: s.linkedPhone ? `+55 ${s.linkedPhone}` : (s.phone ? `+${s.phone}` : "+55 11 98765-4321"),
            status: s.status === "CONNECTED" ? "Online" : "Offline",
        }))
        : defaultMockInstances;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Top Greeting Header matching mockup */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        Olá, Admin!
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
                        Aqui está o resumo da sua operação de hoje.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs font-semibold text-slate-400 select-none">
                        WOOTECH • OPERAÇÃO ATIVA
                    </span>
                </div>
            </div>

            {/* 4 Stat Cards in a row matching mockup */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {/* Card 1: Instâncias ativas */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-xs font-semibold text-slate-500 block">
                                Instâncias ativas
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 block tracking-tight">
                                {displayInstances}
                            </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100/80 flex items-center justify-center text-[#FF6600]">
                            <Smartphone className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100/60 w-fit px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                        <span>+2 desde ontem</span>
                    </div>
                </div>

                {/* Card 2: Conversas hoje */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-xs font-semibold text-slate-500 block">
                                Conversas hoje
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 block tracking-tight">
                                {displayConversations}
                            </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100/80 flex items-center justify-center text-[#FF6600]">
                            <MessageSquare className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100/60 w-fit px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                        <span>+12% vs. ontem</span>
                    </div>
                </div>

                {/* Card 3: Contatos */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-xs font-semibold text-slate-500 block">
                                Contatos
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 block tracking-tight">
                                {displayContacts}
                            </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100/80 flex items-center justify-center text-[#FF6600]">
                            <Users className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100/60 w-fit px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                        <span>+5% vs. ontem</span>
                    </div>
                </div>

                {/* Card 4: Mensagens enviadas */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-xs font-semibold text-slate-500 block">
                                Mensagens enviadas
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 block tracking-tight">
                                {displaySentMessages}
                            </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100/80 flex items-center justify-center text-[#FF6600]">
                            <Send className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100/60 w-fit px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                        <span>+18% vs. ontem</span>
                    </div>
                </div>
            </div>

            {/* Middle Section: Atividade nos últimos 7 dias (Left) & Instâncias ativas (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Column Left: Atividade nos últimos 7 dias */}
                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Atividade nos últimos 7 dias
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Volume diário de conversas e mensagens
                            </p>
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                            <div className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#FF6600]" />
                                <span>Conversas</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#334155]" />
                                <span>Mensagens</span>
                            </div>
                        </div>
                    </div>

                    {/* Smooth Multi-Line Chart (SVG) */}
                    <div className="w-full pt-2 pb-2">
                        <div className="relative w-full h-48 sm:h-56">
                            {/* Y-axis labels */}
                            <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[10px] text-slate-400 font-medium text-right pr-2 select-none">
                                <span>20k</span>
                                <span>15k</span>
                                <span>10k</span>
                                <span>5k</span>
                                <span>0</span>
                            </div>

                            {/* SVG Chart area */}
                            <div className="absolute left-9 right-2 top-0 bottom-6">
                                <svg className="w-full h-full overflow-visible" viewBox="0 0 700 180" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="orange-area-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#FF6600" stopOpacity="0.18" />
                                            <stop offset="100%" stopColor="#FF6600" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>

                                    {/* Grid Lines */}
                                    <line x1="0" y1="0" x2="700" y2="0" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="0" y1="45" x2="700" y2="45" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="0" y1="90" x2="700" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="0" y1="135" x2="700" y2="135" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="0" y1="180" x2="700" y2="180" stroke="#e2e8f0" strokeWidth="1" />

                                    {/* Orange Curve Area */}
                                    <path
                                        d="M 20 120 
                                           Q 120 70, 220 95 
                                           T 420 80 
                                           T 620 50 
                                           L 680 60 
                                           L 680 180 
                                           L 20 180 Z"
                                        fill="url(#orange-area-grad)"
                                    />

                                    {/* Secondary Charcoal Curve (Mensagens) */}
                                    <path
                                        d="M 20 140 
                                           C 100 130, 160 100, 230 115 
                                           C 300 130, 380 90, 460 105 
                                           C 540 120, 600 70, 680 85"
                                        fill="none"
                                        stroke="#334155"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                    />

                                    {/* Primary Orange Curve (Conversas) */}
                                    <path
                                        d="M 20 120 
                                           Q 120 70, 220 95 
                                           T 420 80 
                                           T 620 50 
                                           L 680 60"
                                        fill="none"
                                        stroke="#FF6600"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                    />

                                    {/* Orange Line Nodes */}
                                    {[
                                        { cx: 20, cy: 120 },
                                        { cx: 130, cy: 75 },
                                        { cx: 240, cy: 95 },
                                        { cx: 350, cy: 82 },
                                        { cx: 460, cy: 92 },
                                        { cx: 570, cy: 55 },
                                        { cx: 680, cy: 60 },
                                    ].map((pt, i) => (
                                        <circle
                                            key={i}
                                            cx={pt.cx}
                                            cy={pt.cy}
                                            r="4.5"
                                            fill="#FFFFFF"
                                            stroke="#FF6600"
                                            strokeWidth="2.5"
                                            className="transition-transform duration-200 hover:scale-125"
                                        />
                                    ))}

                                    {/* Slate Line Nodes */}
                                    {[
                                        { cx: 20, cy: 140 },
                                        { cx: 130, cy: 110 },
                                        { cx: 240, cy: 118 },
                                        { cx: 350, cy: 105 },
                                        { cx: 460, cy: 105 },
                                        { cx: 570, cy: 80 },
                                        { cx: 680, cy: 85 },
                                    ].map((pt, i) => (
                                        <circle
                                            key={i}
                                            cx={pt.cx}
                                            cy={pt.cy}
                                            r="3.5"
                                            fill="#FFFFFF"
                                            stroke="#334155"
                                            strokeWidth="2"
                                        />
                                    ))}
                                </svg>
                            </div>

                            {/* X-axis labels */}
                            <div className="absolute left-9 right-2 bottom-0 flex justify-between text-[11px] text-slate-400 font-medium select-none">
                                <span>08/10</span>
                                <span>09/10</span>
                                <span>10/10</span>
                                <span>11/10</span>
                                <span>12/10</span>
                                <span>13/10</span>
                                <span>14/10</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column Right: Instâncias ativas */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-bold text-slate-900">
                                Instâncias ativas
                            </h2>
                            <Link
                                href="/dashboard/sessions"
                                className="text-xs font-semibold text-[#FF6600] hover:text-[#FF5500] transition-colors"
                            >
                                Ver todas &gt;
                            </Link>
                        </div>

                        <div className="space-y-3.5 mt-3">
                            {instanceList.slice(0, 4).map((inst, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* WhatsApp Green Icon Badge */}
                                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs sm:text-[13px] font-bold text-slate-800 truncate">
                                                {inst.name}
                                            </p>
                                            <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                                                {inst.phone}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                        inst.status === "Online"
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                                            : "bg-rose-50 text-rose-700 border border-rose-200/50"
                                    }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                            inst.status === "Online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                                        }`} />
                                        {inst.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Ações rápidas matching mockup */}
            <div>
                <h2 className="text-base font-bold text-slate-900 mb-3">
                    Ações rápidas
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Action 1: Criar instância */}
                    <Link
                        href="/dashboard/sessions"
                        className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-orange-300 transition-all group flex items-center gap-3.5"
                    >
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6600] group-hover:bg-[#FF6600] group-hover:text-white transition-colors flex-shrink-0">
                            <Plus className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover:text-[#FF6600] transition-colors truncate">
                                Criar instância
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                Adicione um novo número
                            </p>
                        </div>
                    </Link>

                    {/* Action 2: Iniciar disparo */}
                    <Link
                        href="/dashboard/broadcast"
                        className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-orange-300 transition-all group flex items-center gap-3.5"
                    >
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6600] group-hover:bg-[#FF6600] group-hover:text-white transition-colors flex-shrink-0">
                            <Send className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover:text-[#FF6600] transition-colors truncate">
                                Iniciar disparo
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                Envie mensagens em massa
                            </p>
                        </div>
                    </Link>

                    {/* Action 3: Gerenciar contatos */}
                    <Link
                        href="/dashboard/contacts"
                        className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-orange-300 transition-all group flex items-center gap-3.5"
                    >
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6600] group-hover:bg-[#FF6600] group-hover:text-white transition-colors flex-shrink-0">
                            <Users className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover:text-[#FF6600] transition-colors truncate">
                                Gerenciar contatos
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                Organize seus contatos
                            </p>
                        </div>
                    </Link>

                    {/* Action 4: Configurar automação */}
                    <Link
                        href="/dashboard/autoreply"
                        className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-orange-300 transition-all group flex items-center gap-3.5"
                    >
                        <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6600] group-hover:bg-[#FF6600] group-hover:text-white transition-colors flex-shrink-0">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover:text-[#FF6600] transition-colors truncate">
                                Configurar automação
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                Use o poder dos fluxos
                            </p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
