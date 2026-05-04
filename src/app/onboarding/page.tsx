'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  // If user already has a company, send them to the dashboard immediately
  useEffect(() => {
    fetch('/api/company')
      .then((r) => {
        if (r.ok) router.replace('/')
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!companyName.trim()) {
      toast.error('Company name is required')
      return
    }

    if (companyName.trim().length > 100) {
      toast.error('Company name must be 100 characters or fewer')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName.trim() }),
      })

      if (res.ok) {
        toast.success('Organisation created! Welcome to Kreashot.')
        router.replace('/')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create organisation')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Up Your Organisation</CardTitle>
          <CardDescription>
            Enter your company name to get started. You can change this later in Settings.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Acme Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                maxLength={100}
                disabled={loading}
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up...' : 'Get Started'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
