import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://kreashot.com'
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { stripeCustomerId: true },
    })
    if (!company?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${getBaseUrl()}/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[billing/portal]', error)
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 })
  }
}
