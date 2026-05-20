import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function createCompanyForUser(userId: string, companyName: string) {
  const baseSlug = slugify(companyName) || 'company'
  const slug = `${baseSlug}-${Date.now()}`
  const company = await prisma.company.create({ data: { name: companyName, slug } })
  await prisma.companyMember.create({ data: { companyId: company.id, userId, role: 'owner' } })
  return company
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: 'Kreashot <hi@corevisionailabs.com>',
    }),
    Credentials({
      id: 'otp',
      credentials: { email: {}, otp: {}, companyName: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const otp = credentials?.otp as string | undefined
        const companyName = credentials?.companyName as string | undefined
        if (!email || !otp) return null

        const record = await prisma.otpCode.findFirst({
          where: { email, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        })
        if (!record) return null
        if (record.attempts >= 5) return null

        const valid = await bcrypt.compare(otp, record.codeHash)
        if (!valid) {
          await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
          return null
        }

        await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } })

        const user = await prisma.user.upsert({
          where: { email },
          update: { emailVerified: new Date() },
          create: { email, emailVerified: new Date() },
        })

        const existingMembership = await prisma.companyMember.findFirst({ where: { userId: user.id } })
        const name = companyName || record.companyName
        if (!existingMembership && name) {
          await createCompanyForUser(user.id, name)
        }

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    Credentials({
      id: 'password',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
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
    async signIn({ user, account }) {
      if (account?.provider === 'resend' && user.id && user.email) {
        const pending = await prisma.pendingSignup.findUnique({ where: { email: user.email } }).catch(() => null)
        if (pending) {
          const existing = await prisma.companyMember.findFirst({ where: { userId: user.id } })
          if (!existing) {
            await createCompanyForUser(user.id, pending.companyName)
          }
          await prisma.pendingSignup.delete({ where: { email: user.email } }).catch(() => null)
        }
      }
    },
  },
})
