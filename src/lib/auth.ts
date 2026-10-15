import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { verifyTotp, decryptTotpSecret, isAdminRole, mfaRequiredForAdmins } from "@/lib/mfa";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.email = user.email;
      }
      if (!token.id && token.sub) {
        token.id = token.sub;
      }
      // Dynamically refresh role from database so changes take effect immediately
      const lookupId = (token.id as string) || (token.sub as string);
      const lookupEmail = token.email as string;
      if (lookupId || lookupEmail) {
        try {
          const dbUser = await prisma.user.findFirst({
            where: {
              OR: [
                ...(lookupId ? [{ id: lookupId }] : []),
                ...(lookupEmail ? [{ email: lookupEmail }] : []),
              ],
            },
            select: { id: true, role: true, name: true, email: true },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.email = dbUser.email;
            if (dbUser.name) token.name = dbUser.name;
          }
        } catch {
          // keep existing token.role if query fails
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = ((token.id as string) || (token.sub as string)) as string;
        (session.user as any).role = token.role;
        if (token.email) session.user.email = token.email as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA Code", type: "text" },
      },
      authorize: async (credentials) => {
        const parsedCredentials = z
          .object({
            email: z.string().email(),
            password: z.string().min(6),
            mfaCode: z.string().optional(),
          })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const { password, mfaCode } = parsedCredentials.data;
        const email = parsedCredentials.data.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) return null;

        // MFA gate: when enabled, a valid TOTP code is required in the same signIn call.
        if (user.mfaEnabled) {
          if (!user.mfaSecret) return null;
          let secret: string;
          try {
            secret = decryptTotpSecret(user.id, user.mfaSecret);
          } catch {
            return null; // fail closed
          }
          if (!mfaCode || !verifyTotp(secret, mfaCode)) return null;
        } else if (mfaRequiredForAdmins() && isAdminRole(user.role)) {
          return null; // MFA_REQUIRED_FOR_ADMINS before enrollment
        }

        return user;
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
