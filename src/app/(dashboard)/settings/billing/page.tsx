'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, CreditCard, Zap, Rocket, Infinity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    description: 'Get started',
    icon: Zap,
    limits: '25 generations/day per type',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49/mo',
    description: 'Growing brands',
    icon: Rocket,
    limits: '200 generations/day per type',
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$149/mo',
    description: 'High-volume teams',
    icon: Infinity,
    limits: 'Unlimited generations',
  },
]

export default function BillingPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  useEffect(() => {
    if (searchParams.get('success') === '1') {
      toast.success('Plan upgraded successfully')
      router.replace('/settings/billing')
    }
    if (searchParams.get('canceled') === '1') {
      toast.info('Upgrade canceled')
      router.replace('/settings/billing')
    }
  }, [searchParams, router])

  useEffect(() => {
    fetch('/api/company')
      .then((r) => r.json())
      .then((data) => {
        setCurrentPlan(data.company?.plan || 'free')
        setHasSubscription(!!data.company?.stripeSubscriptionId)
      })
      .catch(() => toast.error('Failed to load billing info'))
      .finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async (plan: string) => {
    setUpgrading(plan)
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout')
      setUpgrading(null)
    }
  }

  const handleManage = async () => {
    setOpeningPortal(true)
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: any) {
      toast.error(err.message || 'Failed to open billing portal')
      setOpeningPortal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">Manage your plan and subscription</p>
        </div>
        {hasSubscription && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleManage} disabled={openingPortal}>
            {openingPortal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Manage subscription
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = currentPlan === plan.id
          return (
            <Card key={plan.id} className={isCurrent ? 'border-primary ring-1 ring-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  {isCurrent && <Badge>Current plan</Badge>}
                </div>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <p className="text-2xl font-bold">{plan.price}</p>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground">{plan.limits}</p>
                {plan.id !== 'free' && !isCurrent && (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={!!upgrading}
                  >
                    {upgrading === plan.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Redirecting...</>
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </Button>
                )}
                {isCurrent && plan.id !== 'free' && (
                  <p className="text-xs text-center text-muted-foreground">Use &quot;Manage subscription&quot; to cancel or change.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
