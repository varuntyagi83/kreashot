'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

const inputStyle: React.CSSProperties = {
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
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1A1208',
  marginBottom: '8px',
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!companyName.trim()) {
      toast.error('Company name is required')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { company_name: companyName.trim() },
        },
      })

      if (error) {
        toast.error('Could not create account. Please check your details and try again.')
      } else {
        setDone(true)
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
          <Image
            src="/kreashot-wordmark-light.png"
            alt="Kreashot"
            width={146}
            height={28}
            style={{ display: 'block' }}
            priority
          />

          <div style={{ marginTop: 'auto', paddingBottom: '16px' }}>
            <p style={{
              color: '#C9922A', fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '20px',
            }}>
              Free to start
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
              3 full pipeline runs.<br />No credit card.<br />No scheduling.
            </h2>
            <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6 }}>
              Upload a product photo and get 20 ad variations ready for Meta before lunch.
            </p>
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

          {done ? (
            /* Post-signup confirmation state */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '56px', height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(45,74,53,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#2D4A35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 style={{ fontFamily: displayFont, fontSize: '28px', fontWeight: 400, color: '#1A1208', marginBottom: '12px' }}>
                Check your email
              </h1>
              <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '32px' }}>
                We sent a confirmation link to <strong style={{ color: '#1A1208' }}>{email}</strong>. Click it to activate your account and start your first pipeline run.
              </p>
              <Link href="/auth/login" style={{
                display: 'inline-block',
                color: '#2D4A35', fontSize: '14px', fontWeight: 600,
                textDecoration: 'none', borderBottom: '1px solid #2D4A35', paddingBottom: '2px',
              }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 style={{
                fontFamily: displayFont,
                fontSize: '32px', fontWeight: 400,
                color: '#1A1208', marginBottom: '8px', letterSpacing: '-0.01em',
              }}>
                Create your account
              </h1>
              <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '36px', lineHeight: 1.5 }}>
                Free to start. No credit card required.
              </p>

              <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label htmlFor="companyName" style={labelStyle}>Company name</label>
                  <input
                    id="companyName"
                    type="text"
                    placeholder="Acme Inc."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    maxLength={100}
                    disabled={loading}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                    onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
                  />
                </div>
                <div>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                    onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
                  />
                </div>
                <div>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                    onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" style={labelStyle}>Confirm password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#C9922A')}
                    onBlur={(e) => (e.target.style.borderColor = '#DDD8CE')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', height: '46px',
                    backgroundColor: loading ? '#8B3D22' : '#B85C38',
                    color: '#F5F0E8', border: 'none', borderRadius: '8px',
                    fontSize: '15px', fontWeight: 600, fontFamily: bodyFont,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s', letterSpacing: '0.01em',
                  }}
                >
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>

              <p style={{ marginTop: '24px', fontSize: '14px', color: '#5C5245', textAlign: 'center' }}>
                Already have an account?{' '}
                <Link href="/auth/login" style={{ color: '#2D4A35', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid #2D4A35' }}>
                  Sign in
                </Link>
              </p>

              <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid #DDD8CE' }}>
                <Link href="/" style={{ fontSize: '13px', color: '#5C5245', textDecoration: 'none' }}>
                  &larr; Back to home
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
