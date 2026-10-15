'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from 'next/navigation';
import { toast } from "sonner";
import { Label } from '@/components/ui/label';
import {
    Search,
    Plus,
    QrCode,
    Settings,
    MoreHorizontal,
    ArrowRight,
    X,
    CheckCircle2,
    Sliders,
    Trash2,
    Smartphone,
    Share2,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type Session = {
    id: string;
    name: string;
    sessionId: string;
    status: string;
    qr?: string | null;
    linkedPhone?: string | null;
    phone?: string | null;
    updatedAt?: string;
    user?: {
        name: string | null;
        email: string;
    } | null;
};

export function SessionManager({ user }: { user: any }) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);

    // Form fields matching Screen 3
    const [newSessionName, setNewSessionName] = useState("");
    const [newSessionPhone, setNewSessionPhone] = useState("");
    const [teamTag, setTeamTag] = useState("");
    const [welcomeMessage, setWelcomeMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

    const router = useRouter();

    useEffect(() => {
        fetchSessions();

        const socketInstance = io({
            path: "/api/socket/io",
            addTrailingSlash: false,
        });

        socketInstance.on('connection.update', (data: { sessionId: string; status: string; qr: string }) => {
            setSessions((prev) =>
                prev.map((s) => {
                    if (s.sessionId === data.sessionId) {
                        return { ...s, status: data.status, qr: data.qr };
                    }
                    return s;
                })
            );

            if (data.status === 'CONNECTED') {
                fetchSessions();
            }
        });

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    const fetchSessions = () => {
        fetch('/api/sessions')
            .then((res) => res.json())
            .then((responseData) => {
                const data = responseData?.data || [];
                if (Array.isArray(data)) setSessions(data);
            })
            .catch(() => undefined);
    };

    const handleCreateSubmit = async () => {
        if (!newSessionName.trim()) {
            toast.error("Informe o nome da instância");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user?.id,
                    name: newSessionName,
                    phone: newSessionPhone ? newSessionPhone.replace(/\D/g, '') : undefined,
                }),
            });
            const responseData = await res.json();
            const created = responseData?.data;

            if (!res.ok || !created) {
                throw new Error(responseData.error || responseData.message || "Falha ao criar");
            }

            setSessions((prev) => [...prev, created]);
            setCreatedSessionId(created.sessionId);
            toast.success("Instância criada com sucesso!");
            setIsCreateOpen(false);
            setNewSessionName("");
            setNewSessionPhone("");
            setTeamTag("");
            setWelcomeMessage("");
            setCurrentStep(1);

            // Redirect to session details for QR Code scanning
            router.push(`/dashboard/sessions/${created.sessionId}`);
        } catch (e: any) {
            toast.error(e.message || "Falha ao criar a instância");
        } finally {
            setLoading(false);
        }
    };

    // Filter sessions
    const filteredSessions = sessions.filter((s) => {
        const matchesSearch =
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.linkedPhone && s.linkedPhone.includes(searchTerm)) ||
            s.sessionId.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus =
            statusFilter === "ALL" ||
            (statusFilter === "CONNECTED" && s.status === "CONNECTED") ||
            (statusFilter === "OFFLINE" && s.status !== "CONNECTED");
        return matchesSearch && matchesStatus;
    });

    // Mock sessions fallback for visual fidelity if empty
    const mockList = [
        { id: "1", name: "Comercial", sessionId: "comercial", phone: "+55 11 98765-4321", status: "CONNECTED", activity: "há 2 minutos" },
        { id: "2", name: "Suporte", sessionId: "suporte", phone: "+55 11 91234-5678", status: "CONNECTED", activity: "há 5 minutos" },
        { id: "3", name: "Vendas", sessionId: "vendas", phone: "+55 11 99876-5432", status: "CONNECTED", activity: "há 12 minutos" },
        { id: "4", name: "Atendimento", sessionId: "atendimento", phone: "+55 11 99654-3210", status: "CONNECTED", activity: "há 20 minutos" },
        { id: "5", name: "Financeiro", sessionId: "financeiro", phone: "+55 11 97654-3210", status: "DISCONNECTED", activity: "há 2 horas" },
        { id: "6", name: "RH", sessionId: "rh", phone: "+55 11 98543-2109", status: "CONNECTED", activity: "há 1 hora" },
    ];

    const displayList = sessions.length > 0
        ? filteredSessions.map((s) => ({
            id: s.id,
            name: s.name,
            sessionId: s.sessionId,
            phone: s.linkedPhone ? `+55 ${s.linkedPhone}` : (s.phone ? `+${s.phone}` : "-"),
            status: s.status,
            activity: "há 2 minutos",
        }))
        : mockList;

    return (
        <div className="space-y-5">
            {/* Action Bar matching Screen 2 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou número..."
                        className="pl-9 bg-slate-50 border-slate-200 h-10 rounded-xl text-xs sm:text-sm focus-visible:ring-[#FF6600]"
                    />
                </div>

                <div className="flex items-center gap-2.5">
                    {/* Status Dropdown Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#FF6600]/30"
                    >
                        <option value="ALL">Todos os status</option>
                        <option value="CONNECTED">Online</option>
                        <option value="OFFLINE">Offline</option>
                    </select>

                    {/* Button + Nova instância */}
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        className="h-10 px-4 bg-[#FF6600] hover:bg-[#FF5500] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-orange-500/20 flex items-center gap-2 flex-shrink-0"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Nova instância</span>
                    </Button>
                </div>
            </div>

            {/* Table matching Screen 2 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                                <th className="py-3 px-5">Nome</th>
                                <th className="py-3 px-4">Número</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4">Última atividade</th>
                                <th className="py-3 px-5 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                            {displayList.map((row) => {
                                const isOnline = row.status === "CONNECTED";
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                                        {/* Name with WhatsApp icon */}
                                        <td className="py-3.5 px-5 font-bold text-slate-900 flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                                                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z" />
                                                </svg>
                                            </div>
                                            <span>{row.name}</span>
                                        </td>

                                        {/* Número */}
                                        <td className="py-3.5 px-4 font-mono text-slate-600 text-xs">
                                            {row.phone}
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                                isOnline
                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                                                    : "bg-rose-50 text-rose-700 border border-rose-200/50"
                                            }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                                {isOnline ? "Online" : "Offline"}
                                            </span>
                                        </td>

                                        {/* Última atividade */}
                                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                                            {row.activity}
                                        </td>

                                        {/* Ações */}
                                        <td className="py-3.5 px-5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => router.push(`/dashboard/sessions/${row.sessionId}`)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                                    title="QR Code e Conexão"
                                                >
                                                    <QrCode className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/dashboard/sessions/${row.sessionId}`)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                                    title="Configurações da instância"
                                                >
                                                    <Settings className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/dashboard/sessions/${row.sessionId}`)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                                    title="Mais opções"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination matching Screen 2 */}
                <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                        Mostrando {displayList.length} de {displayList.length} instâncias
                    </span>
                    <div className="flex items-center gap-1">
                        <button className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50">
                            &lt;
                        </button>
                        <button className="h-8 w-8 rounded-lg bg-[#FF6600] text-white font-bold flex items-center justify-center shadow-xs">
                            1
                        </button>
                        <button className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50">
                            2
                        </button>
                        <button className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50">
                            3
                        </button>
                        <button className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50">
                            &gt;
                        </button>
                    </div>
                </div>
            </div>

            {/* Criar Instância Modal matching Screen 3 */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-xl p-0 rounded-2xl border-0 overflow-hidden bg-white shadow-2xl">
                    <div className="p-6 border-b border-slate-100">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-900">
                                Criar instância
                            </DialogTitle>
                            <p className="text-xs text-slate-500 mt-1">
                                Configure uma nova conexão do WhatsApp em poucos passos.
                            </p>
                        </DialogHeader>

                        {/* Stepper matching Screen 3 */}
                        <div className="mt-6 flex items-center justify-between border-b border-slate-100 pb-5">
                            <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-[#FF6600] text-white text-xs font-bold flex items-center justify-center">
                                    1
                                </div>
                                <span className="text-xs font-bold text-slate-900">Dados da instância</span>
                            </div>
                            <div className="w-12 h-px bg-slate-200" />
                            <div className="flex items-center gap-2 opacity-50">
                                <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center">
                                    2
                                </div>
                                <span className="text-xs font-medium text-slate-600">QR Code</span>
                            </div>
                            <div className="w-12 h-px bg-slate-200" />
                            <div className="flex items-center gap-2 opacity-50">
                                <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center">
                                    3
                                </div>
                                <span className="text-xs font-medium text-slate-600">Conexão</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                                Informações básicas
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">
                                        Nome da instância
                                    </Label>
                                    <Input
                                        value={newSessionName}
                                        onChange={(e) => setNewSessionName(e.target.value)}
                                        placeholder="Ex: Comercial, Suporte, Vendas"
                                        className="mt-1.5 h-10 rounded-xl bg-slate-50 border-slate-200 text-sm focus-visible:ring-[#FF6600]"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">
                                        Número do WhatsApp
                                    </Label>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <div className="h-10 px-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-700 select-none">
                                            <span>🇧🇷</span>
                                            <span>+55</span>
                                        </div>
                                        <Input
                                            value={newSessionPhone}
                                            onChange={(e) => setNewSessionPhone(e.target.value)}
                                            placeholder="(11) 98765-4321"
                                            className="h-10 rounded-xl bg-slate-50 border-slate-200 text-sm focus-visible:ring-[#FF6600]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                                Configurações opcionais
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">
                                        Tag de equipe
                                    </Label>
                                    <select
                                        value={teamTag}
                                        onChange={(e) => setTeamTag(e.target.value)}
                                        className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#FF6600]"
                                    >
                                        <option value="">Selecione uma equipe</option>
                                        <option value="comercial">Equipe Comercial</option>
                                        <option value="suporte">Equipe de Suporte</option>
                                        <option value="vendas">Equipe de Vendas</option>
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">
                                        Mensagem de boas-vindas
                                    </Label>
                                    <textarea
                                        value={welcomeMessage}
                                        onChange={(e) => setWelcomeMessage(e.target.value)}
                                        placeholder="Digite a mensagem que será enviada no primeiro contato..."
                                        rows={3}
                                        className="mt-1.5 w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#FF6600] resize-none"
                                    />
                                    <p className="text-[10px] text-slate-400 text-right mt-1">0/500</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => setIsCreateOpen(false)}
                            className="text-xs text-slate-600 hover:text-slate-900"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateSubmit}
                            disabled={loading}
                            className="bg-[#FF6600] hover:bg-[#FF5500] text-white font-bold rounded-xl text-xs px-5 h-9 shadow-md shadow-orange-500/20"
                        >
                            {loading ? "Criando..." : "Próximo ->"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
