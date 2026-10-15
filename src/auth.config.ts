import type { NextAuthConfig } from "next-auth";

// Session lifetime from SESSION_TIMEOUT_HOURS (default 24h — not NextAuth's 30d).
const sessionHours = Math.max(1, parseInt(process.env.SESSION_TIMEOUT_HOURS || "24", 10) || 24);

export const authConfig = {
    pages: {
        signIn: '/auth/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
            
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn && (nextUrl.pathname === '/auth/login' || nextUrl.pathname === '/login')) {
                return Response.redirect(new URL('/dashboard', nextUrl));
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
            }
            if (!token.id && token.sub) {
                token.id = token.sub;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = ((token.id as string) || (token.sub as string)) as string;
                (session.user as any).role = token.role;
            }
            return session;
        }
    },
    providers: [], // Configured in auth.ts
    session: {
        strategy: 'jwt',
        maxAge: sessionHours * 3600,
    },
    trustHost: true,
} satisfies NextAuthConfig;
