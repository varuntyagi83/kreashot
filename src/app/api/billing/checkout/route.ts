import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getStripe, PLAN_PRICE_IDS } from '@/lib/stripe'

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://kreashot.com'
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const { plan } = await request.json()
    if (!plan || !['pro', 'scale'].includes(plan)) {
      return NextResponse.json({ error: 'plan must be pro or scale' }, { status: 400 })
    }

    const priceId = PLAN_PRICE_IDS[plan]
    if (!priceId) {
      return NextResponse.json({ error: `${plan} price not configured` }, { status: 500 })
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, stripeCustomerId: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Create or retrieve Stripe customer
    let customerId = company.stripeCustomerId
    if (!customerId) {
      const customer = await getStripe().customers.create({
        name: company.name,
        metadata: { companyId },
      })
      customerId = customer.id
      await prisma.company.update({ where: { id: companyId }, data: { stripeCustomerId: customerId } })
    }

    const baseUrl = getBaseUrl()
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings/billing?success=1`,
      cancel_url: `${baseUrl}/settings/billing?canceled=1`,
      metadata: { companyId, plan },
      subscription_data: { metadata: { companyId, plan } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[billing/checkout]', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
