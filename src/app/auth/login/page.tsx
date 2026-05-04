'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Check } from 'lucide-react'

const FEATURES = [
  'AI-generated product composites',
  'Brand voice consistency at scale',
  'Multi-format export: 1:1, 16:9, 9:16, 4:5',
]

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const error = searchParams.get('error')
    const message = searchParams.get('message')
    if (error) toast.error(error)
    else if (message) toast.success(message)
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Signed in successfully')
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[480px] shrink-0 relative flex-col items-center justify-center p-14 bg-[#07070f] overflow-hidden">
        {/* Gradient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] rounded-full bg-violet-700/15 blur-[100px] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />

        <div className="relative z-10 w-full max-w-xs">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
              <span className="text-white font-bold text-lg leading-none">K</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Kreashot</span>
          </div>

          <h2 className="text-3xl font-bold text-white leading-snug mb-3">
            Ad creatives that convert, at scale
          </h2>
          <p className="text-sm text-white/35 leading-relaxed mb-10">
            From product photo to campaign-ready creative in minutes.
          </p>

          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-violet-600/25 flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-violet-400" />
                </div>
                <span className="text-sm text-white/45">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm leading-none">K</span>
            </div>
            <span className="text-xl font-bold tracking-tight">Kreashot</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
          <p className="text-sm text-muted-foreground mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-violet-600 hover:bg-violet-500 text-white font-medium"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-violet-600 hover:text-violet-500 font-medium">
              Sign up
            </Link>
          </p>

          <div className="mt-8 pt-8 border-t border-border">
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">K</span>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
