"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Play, Square, RotateCcw, LogOut, Power, Trash2, QrCode, Activity, HardDrive, Wifi, MemoryStick, Copy, Check, AlertTriangle, Phone } from "lucide-react";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SessionDetail = {
    id: string;
    name: string;
    sessionId: string;
    status: string;
    userId: string;
    uptime: number; // in seconds
    qr?: string | null;
    qrGeneratedAt?: number | null;
    me?: {
        id: string;
        name: string;
    };
    hasInstance: boolean;
    linkedPhone?: string | null;
    mismatchPhone?: string | null;
};

const SUPPORT_EMAIL = "suporte@woohub.app";

const STATUS_LABELS: Record<string, string> = {
    CONNECTED: "Conectada",
    SCAN_QR: "Aguardando leitura do QR Code",
    STOPPED: "Parada",
    DISCONNECTED: "Desconectada",
    STARTING: "Iniciando",
    NUMBER_MISMATCH: "Número divergente",
};

export default function SessionDetailPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;

    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [uptime, setUptime] = useState(0);
    const [systemMetrics, setSystemMetrics] = useState<any>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [isPairing, setIsPairing] = useState(false);
    const [reconnectPhone, setReconnectPhone] = useState("");
    const [mismatchLocal, setMismatchLocal] = useState<string | null>(null);

    const fetchSession = async () => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}`);
            if (!res.ok) {
                if (res.status === 404) {
                    toast.error("Instância não encontrada");
                    router.push("/dashboard/sessions");
                    return;
                }
                throw new Error("Falha ao carregar");
            }
            const responseData = await res.json();
            const data = responseData?.data;
            if (!data) throw new Error("Nenhum dado retornado");
            setSession(data);
            setQrCode(data.qr || null);
            setPairingCode(data.pairingCode || null);
            setUptime(data.uptime || 0);
            setReconnectPhone(prev => prev || data.linkedPhone || "");
            if (data.status !== "NUMBER_MISMATCH") setMismatchLocal(null);
        } catch (error) {
            console.error(error);
            toast.error("Falha ao carregar os detalhes da instância");
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = async () => {
        try {
            const res = await fetch(`/api/system/monitor/${sessionId}`);
            const result = await res.json();
            if (result.status) {
                setSystemMetrics(result.data);
            }
        } catch (e) {
            // silent ignore
        }
    };

    useEffect(() => {
        fetchSession();

        const socketInstance = io({
            path: "/api/socket/io",
            addTrailingSlash: false,
        });

        socketInstance.on("connect", () => {
            console.log("Connected to socket");
            socketInstance.emit("join-session", sessionId);
        });

        socketInstance.on("connection.update", (data: { status: string, qr: string, pairingCode?: string, linkedPhone?: string, mismatchPhone?: string }) => {
            console.log("Socket update:", data);
            setSession(prev => prev ? { ...prev, status: data.status } : null);
            // Only drop the current QR when the event explicitly invalidates it;
            // status-only events (e.g. pairing code) must not hide it.
            if (data.qr) {
                setQrCode(data.qr);
            } else if (data.status !== "SCAN_QR") {
                setQrCode(null);
            }
            if (data.pairingCode) setPairingCode(data.pairingCode);
            if (data.status === "NUMBER_MISMATCH") setMismatchLocal(data.mismatchPhone || null);

            // Re-fetch full details on major status change (like connection) to get 'me' info
            if (data.status === 'CONNECTED') {
                setPairingCode(null);
                fetchSession();
            }
            if (data.status === 'NUMBER_MISMATCH') {
                fetchSession();
            }
        });

        setSocket(socketInstance);

        // Uptime counter
        const interval = setInterval(() => {
            setUptime(prev => prev + 1);
        }, 1000);

        // Fetch metrics periodically
        fetchMetrics();
        const metricsInterval = setInterval(fetchMetrics, 3000);

        return () => {
            socketInstance.disconnect();
            clearInterval(interval);
            clearInterval(metricsInterval);
        };
    }, [sessionId]);

    // Fallback for the QR: the socket event is fire-and-forget, so poll the QR
    // endpoint while an instance is pairing. This also picks up the rotation
    // Baileys performs every ~20s (a code older than that can never be scanned).
    const shouldPollQr =
        !!session && session.hasInstance && session.status !== "CONNECTED" &&
        session.status !== "NUMBER_MISMATCH" &&
        (session.status === "SCAN_QR" || !qrCode);

    useEffect(() => {
        if (!shouldPollQr) return;
        let cancelled = false;

        const tick = async () => {
            try {
                const res = await fetch(`/api/sessions/${sessionId}/qr`);
                if (cancelled) return;
                if (res.status === 400) {
                    setQrCode(null);
                    setSession(prev => (prev ? { ...prev, status: "CONNECTED" } : prev));
                    return;
                }
                if (res.status !== 200) return;
                const data = await res.json();
                if (!cancelled && data.qr) setQrCode(data.qr);
            } catch {
                // network hiccup: keep polling
            }
        };

        tick();
        const id = setInterval(tick, 2000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [sessionId, shouldPollQr]);

    const ACTION_LABELS: Record<string, string> = {
        start: "iniciar",
        restart: "reiniciar",
        stop: "parar",
        logout: "desconectar",
        pair: "vincular",
        qr: "gerar QR Code",
    };

    const performAction = async (action: string, payload: any = {}) => {
        const loadingToast = toast.loading(`Executando: ${ACTION_LABELS[action] || action}...`);
        try {
            // /qr is a GET-only route (static path wins over the dynamic [action]
            // one), so posting to it would return 405.
            const isQr = action === "qr";
            const res = await fetch(`/api/sessions/${sessionId}/${action}`, {
                method: isQr ? "GET" : "POST",
                headers: isQr ? undefined : { "Content-Type": "application/json" },
                body: isQr ? undefined : JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                if (data?.code === "NUMBER_MISMATCH") {
                    setMismatchLocal(data?.data?.requestedPhone || null);
                }
                throw new Error(data.message || data.error || "Ação falhou");
            }

            setMismatchLocal(null);
            toast.success(data.message || "Sucesso");

            // Refresh logic
            if (action === 'logout' || action === 'qr' || action === 'stop') {
                // Drop the code on screen immediately: the old QR is already dead and
                // must not be scanned while the new connection is being established.
                setQrCode(null);
            }
            if (action === 'logout') {
                setPairingCode(null);
            }
            if (action === 'pair' && data.data?.pairingCode) {
                setPairingCode(data.data.pairingCode);
            }
            fetchSession();

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const handlePairingRequest = async () => {
        if (!phoneNumber) {
            toast.error("Informe um número de telefone");
            return;
        }
        setIsPairing(true);
        await performAction('pair', { phoneNumber });
        setIsPairing(false);
    };

    const digits = (value: string) => value.replace(/[^0-9]/g, "");

    const handleReconnect = async (phoneOverride?: string) => {
        const raw = phoneOverride !== undefined
            ? phoneOverride
            : (reconnectPhone || session?.linkedPhone || "");
        const target = digits(raw);
        if (target.length < 8) {
            toast.error("Informe o número da instância (DDD + número)");
            return;
        }
        await performAction("start", { phone: target });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copiado para a área de transferência");
    };

    const deleteSession = async () => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}/settings`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Instância excluída");
                router.push("/dashboard/sessions");
            } else {
                toast.error("Falha ao excluir");
            }
        } catch (e) {
            toast.error("Erro ao excluir a instância");
        }
    };

    const formatUptime = (seconds: number) => {
        if (!session?.status || session.status !== "CONNECTED") return "Desconectada";
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${d}d ${h}h ${m}min ${s}s`;
    };

    if (loading) return <div className="p-8">Carregando...</div>;
    if (!session) return <div className="p-8">Instância não encontrada</div>;

    const scannedPhone = session.mismatchPhone || mismatchLocal;
    const isMismatch = session.status === "NUMBER_MISMATCH" || !!mismatchLocal;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                <Button variant="ghost" asChild className="self-start">
                    <Link href="/dashboard/sessions">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para instâncias
                    </Link>
                </Button>
                <h1 className="text-xl sm:text-2xl font-bold truncate">
                    {session.name} <span className="text-gray-400 font-normal text-xs sm:text-sm block sm:inline mt-1 sm:mt-0">({session.sessionId})</span>
                </h1>
            </div>

            {isMismatch && (
                <Card className="border-red-300 bg-red-50/60">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="h-5 w-5" /> Número não corresponde ao registrado
                        </CardTitle>
                        <CardDescription>
                            O número escaneado é diferente do número vinculado a esta instância, então a conexão foi recusada.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 bg-white rounded-lg border">
                                <span className="text-xs text-gray-500 block">Número registrado</span>
                                <span className="font-mono font-semibold">{session.linkedPhone || "não registrado"}</span>
                            </div>
                            <div className="p-3 bg-white rounded-lg border">
                                <span className="text-xs text-gray-500 block">Número escaneado</span>
                                <span className="font-mono font-semibold text-red-700">{scannedPhone || "não informado"}</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-700">
                            O número da instância é fixo e não pode ser trocado. Entre em contato com o suporte para
                            liberar a reconexão desta instância.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button asChild className="bg-red-600 hover:bg-red-700">
                                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Suporte Woohub - instância ${session.sessionId}`)}`}>
                                    Falar com o suporte
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleReconnect(session.linkedPhone || "")}
                                disabled={!session.linkedPhone}
                            >
                                Tentar com o número registrado
                            </Button>
                            <Button variant="ghost" onClick={() => { setMismatchLocal(null); fetchSession(); }}>
                                Verificar novamente
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Card */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            Status da instância
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${session.status === 'CONNECTED' ? 'bg-green-100 text-green-700' :
                                session.status === 'STOPPED' || session.status === 'NUMBER_MISMATCH' ? 'bg-red-100 text-red-700' :
                                    'bg-yellow-100 text-yellow-700'
                                }`}>
                                {STATUS_LABELS[session.status] || session.status}
                            </div>
                        </CardTitle>
                        <CardDescription>Status de conexão em tempo real e tempo ativo.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-500 block">Tempo ativo</span>
                                <span className="text-xl font-mono font-medium">{formatUptime(uptime)}</span>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-500 block">Conectado como</span>
                                <span className="text-lg font-medium truncate">{session.me?.name || session.me?.id || "-"}</span>
                            </div>
                        </div>

                        {/* System Resource Extension */}
                        {session.status === 'CONNECTED' && systemMetrics && (
                            <div className="mt-4 pt-4 border-t">
                                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> Saúde do sistema</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-slate-50 p-3 rounded border text-center relative overflow-hidden">
                                        <Wifi className="h-4 w-4 text-slate-400 absolute top-2 right-2" />
                                        <div className="text-xs text-slate-500">Ping</div>
                                        <div className="font-bold text-green-600 mt-1">{systemMetrics.ping}</div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded border text-center">
                                        <div className="text-xs text-slate-500">Contatos salvos</div>
                                        <div className="font-bold text-slate-700 mt-1">{systemMetrics.store?.contacts || 0}</div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded border text-center">
                                        <div className="text-xs text-slate-500">Conversas salvas</div>
                                        <div className="font-bold text-slate-700 mt-1">{systemMetrics.store?.chats || 0}</div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded border text-center relative">
                                        <MemoryStick className="h-4 w-4 text-slate-400 absolute top-2 right-2 opacity-50" />
                                        <div className="text-xs text-slate-500">Mensagens salvas</div>
                                        <div className="font-bold text-slate-700 mt-1">{systemMetrics.store?.messages || 0}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {qrCode && (
                            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-white relative group">
                                <QRCodeSVG value={qrCode} size={256} />
                                <p className="mt-4 text-sm text-gray-500 animate-pulse">Escaneie com o WhatsApp para conectar</p>
                                <p className="mt-1 text-xs text-gray-400">Se o QR expirar ou falhar, clique em &quot;Gerar novo QR Code&quot;.</p>

                                <div className="mt-6 pt-6 border-t w-full">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Ou vincule pelo número de telefone</div>
                                        <div className="flex flex-col w-full max-w-sm gap-2 mt-1">
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="628123456789"
                                                    value={phoneNumber}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneNumber(e.target.value)}
                                                    className="font-mono"
                                                />
                                                <Button onClick={handlePairingRequest} disabled={isPairing || !phoneNumber}>
                                                    Vincular
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground text-center">Use o código do país sem + e sem espaços (ex.: 5511999999999)</p>
                                        </div>
                                        {pairingCode && (
                                            <div className="mt-4 p-4 bg-slate-900 rounded-lg w-full max-w-[320px] text-center border-2 border-slate-700 shadow-xl relative group/code">
                                                <div className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mb-2 font-semibold">Seu código de pareamento</div>
                                                <div
                                                    className="text-3xl font-mono font-bold text-white tracking-[0.3em] flex justify-center cursor-pointer hover:text-blue-400 transition-colors py-2"
                                                    onClick={() => copyToClipboard(pairingCode)}
                                                    title="Clique para copiar"
                                                >
                                                    {pairingCode.toUpperCase().replace('-', '').split('').map((char, i) => (
                                                        <span key={i} className="flex items-center">
                                                            {char}
                                                            {i === 3 && <span className="mx-2 text-slate-600 opacity-50">-</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="absolute top-2 right-2 h-7 w-7 text-slate-500 hover:text-white"
                                                    onClick={() => copyToClipboard(pairingCode)}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                                <div className="text-[9px] text-slate-500 mt-2 italic">Digite este código no seu celular</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Actions Panel */}
                <Card>
                    <CardHeader>
                        <CardTitle>Controles</CardTitle>
                        <CardDescription>Gerencie a instância ativa.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button
                            variant="outline"
                            className="w-full justify-start text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => performAction('start')}
                            disabled={session.status === 'CONNECTED' || session.status === 'SCAN_QR' || isMismatch}
                        >
                            <Play className="mr-2 h-4 w-4" /> Iniciar instância
                        </Button>

                        {session.status !== 'CONNECTED' && !isMismatch && (
                            <Button
                                className="w-full justify-start bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                                onClick={() => performAction('qr')}
                            >
                                <QrCode className="mr-2 h-4 w-4" />
                                {qrCode ? "Gerar novo QR Code" : "Obter QR Code"}
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            onClick={() => performAction('restart')}
                            disabled={!session.hasInstance && session.status !== 'CONNECTED'}
                        >
                            <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar instância
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => performAction('stop')}
                            disabled={session.status === 'STOPPED'}
                        >
                            <Square className="mr-2 h-4 w-4" /> Parar instância
                        </Button>

                        <div className="border-t my-4 pt-4 space-y-3">
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => performAction('logout')}
                                disabled={session.status !== 'CONNECTED'}
                            >
                                <LogOut className="mr-2 h-4 w-4" /> Desconectar
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="destructive"
                                        className="w-full justify-start"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Excluir instância
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. A instância será excluída
                                            permanentemente e os dados de conexão serão removidos do servidor.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={deleteSession} className="bg-red-600 hover:bg-red-700">
                                            Excluir
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Reconnection panel */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Phone className="h-4 w-4" /> Painel de reconexão
                    </CardTitle>
                    <CardDescription>
                        Informe o número desta instância para reconectar. Depois da primeira conexão o número fica
                        fixado e não pode ser trocado.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="5511999999999"
                            value={reconnectPhone}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReconnectPhone(e.target.value)}
                            className="font-mono"
                            disabled={session.status === "CONNECTED"}
                        />
                        <Button
                            onClick={() => handleReconnect()}
                            disabled={session.status === "CONNECTED" || session.status === "SCAN_QR"}
                            className="sm:w-auto"
                        >
                            <Play className="mr-2 h-4 w-4" /> Reconectar
                        </Button>
                    </div>
                    {session.linkedPhone && (
                        <p className="text-xs text-muted-foreground">
                            Número registrado: <span className="font-mono font-medium">{session.linkedPhone}</span>
                            {" "}(não pode ser alterado)
                        </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                        Use DDI + DDD + número, sem espaços (ex.: 5511999999999). Se o número escaneado for diferente
                        do registrado, a instância vai para o painel de suporte acima.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
