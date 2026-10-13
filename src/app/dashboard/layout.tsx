import { auth } from "@/lib/auth";
import { Navbar } from "@/components/dashboard/navbar";
import { RoleBanner } from "@/components/dashboard/role-banner";
import { SessionProvider } from "@/components/dashboard/session-provider";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import { UpdateChecker } from "@/components/dashboard/update-checker";
import { RegistrationWarning } from "@/components/dashboard/registration-warning";
import { RoleThemeProvider } from "@/components/dashboard/role-theme";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Toaster } from "sonner";
import pkg from "../../../package.json";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    let appName = "Woohub";
    let registrationEnabled = true;

    try {
        // @ts-ignore
        const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
        appName = systemConfig?.appName || appName;
        registrationEnabled = systemConfig?.enableRegistration ?? registrationEnabled;
    } catch (e) {
        logger.error("DashboardLayout", "systemConfig unavailable, using defaults:", e);
    }

    let userRole = (session?.user as any)?.role as string;
    let userId = session?.user?.id;
    const userEmail = session?.user?.email;

    // Direct database role lookup to ensure role changes (e.g. MEGA_ADMIN) take effect immediately without stale JWT session
    if (userId || userEmail) {
        try {
            const dbUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        ...(userId ? [{ id: userId }] : []),
                        ...(userEmail ? [{ email: userEmail }] : []),
                    ],
                },
                select: { id: true, role: true, name: true },
            });
            if (dbUser) {
                userRole = dbUser.role;
                userId = dbUser.id;
            }
        } catch (e) {
            logger.error("DashboardLayout", "Failed to resolve dbUser role:", e);
        }
    }

    // Resolve white label reseller branding if applicable
    if (userId) {
        try {
            if (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN") {
                const reseller = await prisma.reseller.findFirst({
                    where: { ownerId: userId },
                    include: { branding: true },
                });
                if (reseller?.branding?.name) {
                    appName = reseller.branding.name;
                }
            } else if (userRole !== "MEGA_ADMIN") {
                const membership = await prisma.tenantMember.findFirst({
                    where: { userId },
                    include: {
                        tenant: {
                            include: {
                                reseller: {
                                    include: { branding: true },
                                },
                            },
                        },
                    },
                });
                if (membership?.tenant?.reseller?.branding?.name) {
                    appName = membership.tenant.reseller.branding.name;
                }
            }
        } catch (e) {
            logger.error("DashboardLayout", "Failed to resolve reseller branding:", e);
        }
    }

    return (
        <SessionProvider>
            <SidebarProvider>
                <RoleThemeProvider userRole={userRole}>
                    <UpdateChecker />
                    <RegistrationWarning
                        role={userRole}
                        registrationEnabled={registrationEnabled}
                    />
                    <div className="flex flex-col h-screen bg-slate-50 relative overflow-hidden" suppressHydrationWarning={true}>
                        {/* Top Role Banner matching mockup spanning full width */}
                        <RoleBanner userRole={userRole} />

                        <div className="flex flex-1 overflow-hidden min-h-0 relative">
                            {/* Sidebar */}
                            <SidebarShell
                                appName={appName}
                                userName={session?.user?.name}
                                userEmail={session?.user?.email}
                                version={pkg.version}
                                userRole={userRole}
                            />

                            {/* Main Content Area */}
                            <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10" suppressHydrationWarning={true}>
                                {/* Navbar */}
                                <Navbar appName={appName} userRole={userRole} />

                                {/* Scrollable Main View */}
                                <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 styled-scrollbar bg-slate-50/60">
                                    {children}
                                </main>
                            </div>
                        </div>
                        <Toaster />
                    </div>
                </RoleThemeProvider>
            </SidebarProvider>
        </SessionProvider>
    );
}
