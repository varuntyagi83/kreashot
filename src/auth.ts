import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: 'Kreashot <noreply@kreashot.com>',
    }),
  ],
  pages: {
    signIn: '/auth/login',
    verifyRequest: '/auth/verify',
    error: '/auth/login',
  },
  session: {
    strategy: 'database',
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-create a company for every new user
      if (!user.email || !user.id) return
      const displayName = user.name?.trim() || user.email.split('@')[0] || 'My Company'
      const baseSlug = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const slug = `${baseSlug}-${user.id.slice(0, 8)}`

      const company = await prisma.company.create({
        data: { name: displayName.slice(0, 100), slug },
      })
      await prisma.companyMember.create({
        data: { companyId: company.id, userId: user.id, role: 'admin' },
      })
    },
  },
})
