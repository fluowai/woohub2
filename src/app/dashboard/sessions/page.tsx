import { auth } from "@/lib/auth";
import { SessionManager } from "@/components/dashboard/session-manager";

export default async function SessionsPage() {
    const session = await auth();

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        Instâncias
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Gerencie suas conexões do WhatsApp.
                    </p>
                </div>
            </div>
            <SessionManager user={session?.user} />
        </div>
    );
}
