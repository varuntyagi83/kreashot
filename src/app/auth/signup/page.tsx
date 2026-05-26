'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Check, Mail, KeyRound, Lock } from 'lucide-react'
import posthog from 'posthog-js'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

const FEATURES = [
  'Studio-grade product composites in under 2 minutes',
  'Brand voice consistency across every ad variation',
  'Export to Meta Ads Manager: 1:1, 4:5, 16:9, 9:16',
]

type Tab = 'magic' | 'otp' | 'password'

function KreashotWordmark({ height = 28, dark = false }: { height?: number; dark?: boolean }) {
  const width = Math.round(height * (498 / 95))
  return <Image src={dark ? '/kreashot-wordmark-dark.png' : '/kreashot-wordmark-light.png'} alt="Kreashot" width={width} height={height} style={{ display: 'block' }} priority />
}

const inputStyle = {
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
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.2s',
}

const btnStyle = (loading: boolean) => ({
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
})

function SignupForm() {
  const [tab, setTab] = useState<Tab>('magic')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  function resetState() {
    setErrorMsg('')
    setOtpSent(false)
    setOtp('')
    setPassword('')
    setConfirmPassword('')
    setMagicSent(false)
  }

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName.trim()) { setErrorMsg('Company name is required.'); return }
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, companyName: companyName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error || 'Failed to send magic link.')
        return
      }
      // Store succeeded — now trigger the magic link email client-side
      await signIn('resend', { email, redirect: false, callbackUrl: '/dashboard' })
      posthog.capture('signup_initiated', { method: 'magic_link', email })
      setMagicSent(true)
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName.trim()) { setErrorMsg('Company name is required.'); return }
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, companyName: companyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) setErrorMsg(data.error || 'Failed to send code.')
      else setOtpSent(true)
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const result = await signIn('otp', { email, otp, companyName: companyName.trim(), redirect: false })
      if (result?.error) setErrorMsg('Invalid or expired code. Please try again.')
      else { posthog.capture('user_signed_up', { method: 'otp', email }); router.push('/dashboard') }
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName.trim()) { setErrorMsg('Company name is required.'); return }
    if (password !== confirmPassword) { setErrorMsg('Passwords do not match.'); return }
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return }
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/password?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyName: companyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error || 'Registration failed.'); return }

      const result = await signIn('password', { email, password, redirect: false })
      if (result?.error) setErrorMsg('Account created, but sign in failed. Please go to the login page.')
      else { posthog.capture('user_signed_up', { method: 'password', email }); router.push('/dashboard') }
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'magic', label: 'Magic link' },
    { id: 'otp', label: 'One-time code' },
    { id: 'password', label: 'Password' },
  ]

  if (magicSent) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(201,146,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <Mail size={24} color="#C9922A" />
        </div>
        <h1 style={{ fontFamily: displayFont, fontSize: '28px', fontWeight: 400, color: '#1A1208', marginBottom: '12px', letterSpacing: '-0.01em' }}>Check your inbox</h1>
        <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>We sent a magic link to</p>
        <p style={{ color: '#1A1208', fontSize: '14px', fontWeight: 600, marginBottom: '32px' }}>{email}</p>
        <p style={{ color: '#5C5245', fontSize: '13px', lineHeight: 1.6 }}>Click the link to activate your account and set up your workspace. Expires in 24 hours.</p>
      </div>
    )
  }

  const commonFields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Company name</label>
        <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." required disabled={loading} autoFocus style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Email address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required disabled={loading} style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
      </div>
    </div>
  )

  return (
    <>
      <h1 style={{ fontFamily: displayFont, fontSize: '32px', fontWeight: 400, color: '#1A1208', marginBottom: '8px', letterSpacing: '-0.01em' }}>Create your account</h1>
      <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '28px', lineHeight: 1.5 }}>
        Set up your workspace in under a minute.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: '#EDE8DF', borderRadius: '8px', padding: '4px' }}>
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => { setTab(id); resetState() }} style={{ flex: 1, padding: '7px 4px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: tab === id ? 600 : 400, fontFamily: bodyFont, cursor: 'pointer', backgroundColor: tab === id ? '#FDFAF5' : 'transparent', color: tab === id ? '#1A1208' : '#7A6E62', boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 14px', backgroundColor: 'rgba(184,92,56,0.08)', border: '1px solid rgba(184,92,56,0.3)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#B85C38' }}>
          {errorMsg}
        </div>
      )}

      {tab === 'magic' && (
        <form onSubmit={handleMagic} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {commonFields}
          <button type="submit" disabled={loading} style={btnStyle(loading)}>{loading ? 'Sending...' : 'Send magic link'}</button>
        </form>
      )}

      {tab === 'otp' && !otpSent && (
        <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {commonFields}
          <button type="submit" disabled={loading} style={btnStyle(loading)}>{loading ? 'Sending...' : 'Send 6-digit code'}</button>
        </form>
      )}

      {tab === 'otp' && otpSent && (
        <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '13px', color: '#5C5245', margin: 0 }}>Code sent to <strong style={{ color: '#1A1208' }}>{email}</strong></p>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>6-digit code</label>
            <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required disabled={loading} autoFocus style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
          </div>
          <button type="submit" disabled={loading || otp.length !== 6} style={btnStyle(loading)}>{loading ? 'Verifying...' : 'Verify and create account'}</button>
          <button type="button" onClick={() => { setOtpSent(false); setOtp('') }} style={{ background: 'none', border: 'none', color: '#5C5245', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', fontFamily: bodyFont }}>Resend code</button>
        </form>
      )}

      {tab === 'password' && (
        <form onSubmit={handlePasswordSignup} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {commonFields}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required disabled={loading} style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Confirm password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" required disabled={loading} style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
          </div>
          <button type="submit" disabled={loading} style={btnStyle(loading)}>{loading ? 'Creating account...' : 'Create account'}</button>
        </form>
      )}

      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #DDD8CE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ fontSize: '13px', color: '#5C5245', textDecoration: 'none' }}>&larr; Back to home</a>
        <a href="/auth/login" style={{ fontSize: '13px', color: '#C9922A', textDecoration: 'none', fontWeight: 500 }}>Already have an account?</a>
      </div>
    </>
  )
}

function LeftPanel() {
  return (
    <div style={{ width: '480px', flexShrink: 0, backgroundColor: '#1A1208', display: 'flex', flexDirection: 'column', padding: '48px 56px', position: 'relative', overflow: 'hidden' }} className="hidden lg:flex">
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '400px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(201,146,42,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <KreashotWordmark height={30} />
        <div style={{ marginTop: 'auto', paddingBottom: '16px' }}>
          <p style={{ color: '#C9922A', fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '20px' }}>The AI creative studio</p>
          <h2 style={{ fontFamily: displayFont, fontSize: 'clamp(28px, 3vw, 38px)', fontWeight: 400, color: '#F5F0E8', lineHeight: 1.15, marginBottom: '16px', letterSpacing: '-0.01em' }}>
            Product photo to<br />campaign creative<br />in minutes.
          </h2>
          <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '40px' }}>No studio. No photographer. No scheduling.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(201,146,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <Check size={11} color="#C9922A" strokeWidth={2.5} />
                </div>
                <span style={{ fontSize: '13px', color: '#DDD8CE', lineHeight: 1.5, opacity: 0.7 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: '48px' }}>
          <p style={{ fontSize: '11px', color: '#5C5245' }}>&copy; 2026 Kreashot. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><Image src="/kreashot-wordmark-dark.png" alt="Kreashot" width={146} height={28} priority /></div>}>
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: bodyFont }}>
        <LeftPanel />
        <div style={{ flex: 1, backgroundColor: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <div className="lg:hidden" style={{ marginBottom: '40px' }}><KreashotWordmark height={28} dark /></div>
            <SignupForm />
          </div>
        </div>
      </div>
    </Suspense>
  )
}
