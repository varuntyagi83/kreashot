import { NextRequest, NextResponse } from 'next/server'
import { getStripe, planFromPriceId } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[billing/webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const companyId = session.metadata?.companyId
      const plan = session.metadata?.plan
      if (companyId && plan) {
        await prisma.company.update({
          where: { id: companyId },
          data: {
            plan,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
          },
        })
        console.log(`[billing/webhook] ${companyId} upgraded to ${plan}`)
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const companyId = sub.metadata?.companyId
      if (companyId) {
        const priceId = sub.items.data[0]?.price.id
        const plan = priceId ? planFromPriceId(priceId) : 'free'
        await prisma.company.update({ where: { id: companyId }, data: { plan } })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const companyId = sub.metadata?.companyId
      if (companyId) {
        await prisma.company.update({
          where: { id: companyId },
          data: { plan: 'free', stripeSubscriptionId: null },
        })
        console.log(`[billing/webhook] ${companyId} downgraded to free (subscription cancelled)`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[billing/webhook] handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
