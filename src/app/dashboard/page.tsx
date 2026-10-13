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

    let realAutoReplyCount = 0;
    try {
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            realAutoReplyCount = await prisma.autoReply.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        realAutoReplyCount = 0;
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

    // Display values: fallback to illustrative numbers matching the user mockup if database is fresh
    const displayConnected = realConnectedSessions > 0 ? realConnectedSessions : 2;
    const displayTotal = realTotalSessions > 0 ? realTotalSessions : 3;
    const displayMessages = realMessagesToday > 0 ? realMessagesToday.toLocaleString("pt-BR") : "1.284";
    const displayAutomations = realAutoReplyCount > 0 ? realAutoReplyCount : 8;

    // 7-day volume data matching the mockup heights
    const chartBars = [
        { day: "Qua", heightPercent: 42, label: "420" },
        { day: "Qui", heightPercent: 72, label: "720" },
        { day: "Sex", heightPercent: 54, label: "540" },
        { day: "Sáb", heightPercent: 84, label: "840" },
        { day: "Dom", heightPercent: 64, label: "640" },
        { day: "Seg", heightPercent: 96, label: "960" },
        { day: "Ter", heightPercent: 78, label: "780" },
    ];

    // Recent activity items matching mockup
    const recentActivities = [
        {
            icon: Radio,
            title: "Sessão Comercial conectada",
            subtitle: "Evento de demonstração · 1 min atrás",
        },
        {
            icon: CornerDownLeft,
            title: "Regra de boas-vindas executada",
            subtitle: "Evento de demonstração · 2 min atrás",
        },
        {
            icon: Clock,
            title: "Agendamento em fila",
            subtitle: "Evento de demonstração · 3 min atrás",
        },
        {
            icon: Zap,
            title: "Webhook entregue",
            subtitle: "Evento de demonstração · 4 min atrás",
        },
    ];

    // Sessions table data: combine database sessions with demo rows
    const demoSessions = [
        { id: "demo-1", name: "Comercial", sessionId: "demo-comercial", status: "CONNECTED" },
        { id: "demo-2", name: "Suporte", sessionId: "demo-suporte", status: "CONNECTED" },
    ];

    const displaySessionList = sessions.length > 0 ? sessions : demoSessions;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header matching mockup */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        Visão geral
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
                        Acompanhe conexões, mensagens e automações da sua operação.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs font-semibold text-slate-400 select-none">
                        WooHub / PT-BR
                    </span>
                </div>
            </div>

            {/* Top 3 Metric Cards matching mockup */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Card 1: Sessões conectadas */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md transition-shadow">
                    <p className="text-sm font-bold text-slate-900">
                        Sessões conectadas
                    </p>
                    <p className="text-3xl sm:text-4xl font-black text-slate-900 mt-4 leading-none tracking-tight">
                        {displayConnected}
                    </p>
                    <p className="text-xs text-slate-500 mt-4 font-normal">
                        de {displayTotal} {realTotalSessions > 0 ? "sessões ativas" : "sessões demo"}
                    </p>
                </div>

                {/* Card 2: Mensagens hoje */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md transition-shadow">
                    <p className="text-sm font-bold text-slate-900">
                        Mensagens hoje
                    </p>
                    <p className="text-3xl sm:text-4xl font-black text-slate-900 mt-4 leading-none tracking-tight">
                        {displayMessages}
                    </p>
                    <p className="text-xs text-slate-500 mt-4 font-normal">
                        {realMessagesToday > 0 ? "total enviado e recebido hoje" : "volume ilustrativo"}
                    </p>
                </div>

                {/* Card 3: Automações ativas */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md transition-shadow">
                    <p className="text-sm font-bold text-slate-900">
                        Automações ativas
                    </p>
                    <p className="text-3xl sm:text-4xl font-black text-slate-900 mt-4 leading-none tracking-tight">
                        {displayAutomations}
                    </p>
                    <p className="text-xs text-slate-500 mt-4 font-normal">
                        {realAutoReplyCount > 0 ? "regras ativas configuradas" : "regras demonstrativas"}
                    </p>
                </div>
            </div>

            {/* Middle Row: Fluxo de mensagens (Left) & Atividade recente (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Column Left: Fluxo de mensagens */}
                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Fluxo de mensagens
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5 font-normal">
                                Últimos 7 dias · dados ilustrativos
                            </p>
                        </div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#e0f2fe] text-[#0284c7] border border-sky-100 select-none">
                            Enviadas / recebidas
                        </span>
                    </div>

                    {/* Gradient Bars Container */}
                    <div className="pt-6 pb-2">
                        <div className="h-44 sm:h-52 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 sm:px-6 border-b border-slate-100">
                            {chartBars.map((bar) => (
                                <div key={bar.day} className="flex-1 flex flex-col items-center h-full justify-end group">
                                    <div
                                        style={{ height: `${bar.heightPercent}%` }}
                                        className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-[#0284c7] via-[#0ea5e9] to-[#38bdf8] transition-all duration-300 group-hover:brightness-110 shadow-xs relative"
                                    >
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap shadow-md z-10">
                                            {bar.label} msgs
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-6 mt-3">
                            {chartBars.map((bar) => (
                                <div key={bar.day} className="flex-1 text-center">
                                    <span className="text-xs text-slate-400 font-medium select-none">
                                        {bar.day}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Column Right: Atividade recente */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 mb-5">
                            Atividade recente
                        </h2>

                        <div className="space-y-4">
                            {recentActivities.map((activity, idx) => {
                                const Icon = activity.icon;
                                return (
                                    <div key={idx} className="flex items-center gap-3.5 group">
                                        <div className="h-10 w-10 rounded-full bg-[#f0f9ff] text-[#0284c7] border border-sky-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e0f2fe] transition-colors">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs sm:text-[13px] font-semibold text-slate-800 truncate leading-snug">
                                                {activity.title}
                                            </p>
                                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                                {activity.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Suas sessões */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-slate-900">
                        Suas sessões
                    </h2>
                    <Link
                        href="/dashboard/sessions"
                        className="text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] inline-flex items-center gap-1 transition-colors"
                    >
                        Gerenciar sessões <ArrowRight size={13} />
                    </Link>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-4 px-4 py-2.5 bg-slate-50/70 rounded-lg text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <div>SESSÃO</div>
                    <div>IDENTIFICADOR</div>
                    <div>ESTADO</div>
                    <div className="text-right">AÇÃO</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-slate-100">
                    {displaySessionList.map((s) => {
                        const isConnected = s.status === "CONNECTED";
                        return (
                            <div
                                key={s.id || s.sessionId}
                                className="grid grid-cols-4 items-center px-4 py-3.5 hover:bg-slate-50/60 rounded-lg transition-colors"
                            >
                                <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate pr-2">
                                    {s.name}
                                </div>
                                <div className="text-xs font-mono text-slate-500 truncate pr-2">
                                    {s.sessionId}
                                </div>
                                <div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e0f2fe] text-[#0284c7] border border-sky-100">
                                        {isConnected ? "Conectada" : s.status || "Pendente"}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <Link
                                        href={`/dashboard/sessions/${s.sessionId}`}
                                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                                    >
                                        Ver sessão <ArrowRight size={12} />
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
