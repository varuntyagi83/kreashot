import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { checkRateLimit } from '@/lib/rate-limit'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function createCompanyForUser(userId: string, companyName: string) {
  const baseSlug = slugify(companyName) || 'company'
  const slug = `${baseSlug}-${Date.now()}`
  const company = await prisma.company.create({ data: { name: companyName, slug } })
  await prisma.companyMember.create({ data: { companyId: company.id, userId, role: 'admin' } })
  return company
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: 'Kreashot <hi@corevisionailabs.com>',
      // Override the send path to rate-limit magic-link emails (anti-bombing)
      // and brand the message. Throwing here aborts the sign-in attempt.
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const limit = await checkRateLimit(`magiclink:${email.toLowerCase()}`, 5, 15 * 60 * 1000)
        if (!limit.allowed) {
          throw new Error('Too many magic link requests. Please wait a few minutes.')
        }
        const { Resend: ResendClient } = await import('resend')
        const resend = new ResendClient(provider.apiKey as string)
        const { error } = await resend.emails.send({
          from: provider.from as string,
          to: email,
          subject: 'Sign in to Kreashot',
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8;">
              <img src="https://kreashot.com/kreashot-wordmark-dark.png" alt="Kreashot" height="28" style="margin-bottom: 32px;" />
              <h1 style="font-size: 28px; font-weight: 400; color: #1A1208; margin: 0 0 16px;">Sign in to Kreashot</h1>
              <p style="color: #5C5245; font-size: 14px; margin: 0 0 32px;">Click the button below to sign in. This link expires shortly and can only be used once.</p>
              <a href="${url}" style="display: inline-block; background: #B85C38; color: #F5F0E8; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">Sign in</a>
              <p style="color: #7A6E62; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        })
        if (error) throw new Error(typeof error === 'string' ? error : 'Failed to send magic link')
      },
    }),
    Credentials({
      id: 'otp',
      credentials: { email: {}, otp: {}, companyName: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const otp = credentials?.otp as string | undefined
        const companyName = credentials?.companyName as string | undefined
        if (!email || !otp) return null

        // Per-email attempt counter persists across code regenerations — prevents
        // brute force by repeatedly requesting new codes to reset the per-code limit.
        const emailLimit = await checkRateLimit(`otp:${email.toLowerCase()}`, 15, 15 * 60 * 1000)
        if (!emailLimit.allowed) return null

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

        // Brute-force / credential-stuffing protection: throttle login attempts
        // per email. Returning null surfaces the same generic error as a bad
        // password, so this does not reveal the lockout or whether the email exists.
        const limit = await checkRateLimit(`pwlogin:${email.toLowerCase()}`, 10, 15 * 60 * 1000)
        if (!limit.allowed) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null
        if (!user.emailVerified) return null

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
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days — a leaked token expires in a week, not a month
    updateAge: 24 * 60 * 60, // refresh the token at most once per day of activity
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id as string
      return session
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id || !user.email) return

      // Auto-accept any pending company invites for this email
      try {
        const pendingInvites = await prisma.companyInvite.findMany({
          where: { email: user.email, acceptedAt: null, expiresAt: { gt: new Date() } },
        })
        for (const invite of pendingInvites) {
          const existing = await prisma.companyMember.findFirst({
            where: { userId: user.id, companyId: invite.companyId },
          })
          if (!existing) {
            await prisma.companyMember.create({
              data: { userId: user.id, companyId: invite.companyId, role: invite.role },
            })
          }
          await prisma.companyInvite.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
          })
        }
      } catch (err) {
        console.error('[signIn] invite acceptance failed:', err)
      }

      // Existing magic-link pendingSignup logic
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
