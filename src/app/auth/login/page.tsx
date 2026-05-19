'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { Check, Mail } from 'lucide-react'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

const FEATURES = [
  'Studio-grade product composites in under 2 minutes',
  'Brand voice consistency across every ad variation',
  'Export to Meta Ads Manager: 1:1, 4:5, 16:9, 9:16',
]

function KreashotWordmark({ height = 28, dark = false }: { height?: number; dark?: boolean }) {
  const width = Math.round(height * (498 / 95))
  return (
    <Image
      src={dark ? '/kreashot-wordmark-dark.png' : '/kreashot-wordmark-light.png'}
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
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'EmailSignin') setErrorMsg('Failed to send the magic link. Please try again.')
    else if (error) setErrorMsg('Something went wrong. Please try again.')
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const result = await signIn('resend', { email, redirect: false, callbackUrl: '/dashboard' })
      if (result?.error) {
        setErrorMsg('Failed to send the magic link. Please try again.')
      } else {
        setSent(true)
      }
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.')
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
            <KreashotWordmark height={28} dark />
          </div>

          {sent ? (
            /* Confirmation state */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(201,146,42,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <Mail size={24} color="#C9922A" />
              </div>
              <h1 style={{
                fontFamily: displayFont,
                fontSize: '28px',
                fontWeight: 400,
                color: '#1A1208',
                marginBottom: '12px',
                letterSpacing: '-0.01em',
              }}>
                Check your inbox
              </h1>
              <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
                We sent a magic link to
              </p>
              <p style={{ color: '#1A1208', fontSize: '14px', fontWeight: 600, marginBottom: '32px' }}>
                {email}
              </p>
              <p style={{ color: '#5C5245', fontSize: '13px', lineHeight: 1.6 }}>
                Click the link in the email to sign in. It expires in 24 hours.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                style={{
                  marginTop: '32px',
                  background: 'none',
                  border: 'none',
                  color: '#5C5245',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontFamily: bodyFont,
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* Email entry state */
            <>
              <h1 style={{
                fontFamily: displayFont,
                fontSize: '32px',
                fontWeight: 400,
                color: '#1A1208',
                marginBottom: '8px',
                letterSpacing: '-0.01em',
              }}>
                Sign in
              </h1>
              <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '36px', lineHeight: 1.5 }}>
                Enter your email and we&apos;ll send you a magic link.
              </p>

              {errorMsg && (
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(184,92,56,0.08)',
                  border: '1px solid rgba(184,92,56,0.3)',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: '#B85C38',
                }}>
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
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
                  {loading ? 'Sending...' : 'Send magic link'}
                </button>
              </form>

              <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid #DDD8CE' }}>
                <a href="/" style={{ fontSize: '13px', color: '#5C5245', textDecoration: 'none' }}>
                  &larr; Back to home
                </a>
              </div>
            </>
          )}
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
