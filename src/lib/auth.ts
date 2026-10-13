import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";

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
      },
      authorize: async (credentials) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { password } = parsedCredentials.data;
          const email = parsedCredentials.data.email.trim().toLowerCase();
          
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;

          const passwordsMatch = await bcrypt.compare(password, user.password);

          if (passwordsMatch) {
             return user;
          }
        }
        return null;
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
