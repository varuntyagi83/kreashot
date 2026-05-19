'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Check } from 'lucide-react'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

const FEATURES = [
  'Studio-grade product composites in under 2 minutes',
  'Brand voice consistency across every ad variation',
  'Export to Meta Ads Manager: 1:1, 4:5, 16:9, 9:16',
]

function KreashotWordmark({ height = 28 }: { height?: number }) {
  const width = Math.round(height * (498 / 95))
  return (
    <Image
      src="/kreashot-wordmark-light.png"
      alt="Kreashot"
      width={width}
      height={height}
      style={{ display: 'block' }}
      priority
    />
  )
}

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
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: bodyFont }}>

      {/* Left: dark brand panel */}
      <div style={{
        width: '480px',
        flexShrink: 0,
        backgroundColor: '#1A1208',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 56px',
        position: 'relative',
        overflow: 'hidden',
      }} className="hidden lg:flex">
        {/* Subtle radial glow */}
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(201,146,42,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <KreashotWordmark height={30} />

          <div style={{ marginTop: 'auto', paddingBottom: '16px' }}>
            <p style={{
              color: '#C9922A',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              marginBottom: '20px',
            }}>
              The AI creative studio
            </p>
            <h2 style={{
              fontFamily: displayFont,
              fontSize: 'clamp(28px, 3vw, 38px)',
              fontWeight: 400,
              color: '#F5F0E8',
              lineHeight: 1.15,
              marginBottom: '16px',
              letterSpacing: '-0.01em',
            }}>
              Product photo to<br />campaign creative<br />in minutes.
            </h2>
            <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '40px' }}>
              No studio. No photographer. No scheduling.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {FEATURES.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(201,146,42,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}>
                    <Check size={11} color="#C9922A" strokeWidth={2.5} />
                  </div>
                  <span style={{ fontSize: '13px', color: '#DDD8CE', lineHeight: 1.5, opacity: 0.7 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '48px' }}>
            <p style={{ fontSize: '11px', color: '#5C5245' }}>
              &copy; 2026 Kreashot. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Right: form panel */}
      <div style={{
        flex: 1,
        backgroundColor: '#F5F0E8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>

          {/* Mobile wordmark */}
          <div className="lg:hidden" style={{ marginBottom: '40px' }}>
            <Image
              src="/kreashot-wordmark-dark.png"
              alt="Kreashot"
              width={146}
              height={28}
              style={{ display: 'block' }}
              priority
            />
          </div>

          <h1 style={{
            fontFamily: displayFont,
            fontSize: '32px',
            fontWeight: 400,
            color: '#1A1208',
            marginBottom: '8px',
            letterSpacing: '-0.01em',
          }}>
            Welcome back
          </h1>
          <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '36px', lineHeight: 1.5 }}>
            Sign in to your account to continue
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 14px',
                  border: '1.5px solid #DDD8CE',
                  borderRadius: '8px',
                  backgroundColor: '#FDFAF5',
                  color: '#1A1208',
                  fontSize: '14px',
                  fontFamily: bodyFont,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
              />
            </div>

            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 14px',
                  border: '1.5px solid #DDD8CE',
                  borderRadius: '8px',
                  backgroundColor: '#FDFAF5',
                  color: '#1A1208',
                  fontSize: '14px',
                  fontFamily: bodyFont,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '46px',
                backgroundColor: loading ? '#8B3D22' : '#B85C38',
                color: '#F5F0E8',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                fontFamily: bodyFont,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                letterSpacing: '0.01em',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p style={{ marginTop: '24px', fontSize: '14px', color: '#5C5245', textAlign: 'center' }}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" style={{ color: '#2D4A35', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid #2D4A35' }}>
              Sign up
            </Link>
          </p>

          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid #DDD8CE' }}>
            <Link href="/" style={{ fontSize: '13px', color: '#5C5245', textDecoration: 'none' }}>
              &larr; Back to home
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}>
        <Image src="/kreashot-wordmark-dark.png" alt="Kreashot" width={146} height={28} priority />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
