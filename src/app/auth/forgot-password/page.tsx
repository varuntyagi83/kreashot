'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Mail } from 'lucide-react'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/password?action=forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error || 'Something went wrong.')
      } else {
        setSent(true)
      }
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8', padding: '40px 24px', fontFamily: bodyFont }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ marginBottom: '40px' }}>
          <Image src="/kreashot-wordmark-dark.png" alt="Kreashot" width={146} height={28} priority />
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(201,146,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Mail size={24} color="#C9922A" />
            </div>
            <h1 style={{ fontFamily: displayFont, fontSize: '28px', fontWeight: 400, color: '#1A1208', marginBottom: '12px', letterSpacing: '-0.01em' }}>Check your inbox</h1>
            <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>If an account exists for</p>
            <p style={{ color: '#1A1208', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>{email}</p>
            <p style={{ color: '#5C5245', fontSize: '13px', lineHeight: 1.6 }}>you&apos;ll receive a password reset link. It expires in 1 hour.</p>
            <a href="/auth/login" style={{ display: 'inline-block', marginTop: '32px', fontSize: '13px', color: '#C9922A', textDecoration: 'none', fontWeight: 500 }}>Back to sign in</a>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: displayFont, fontSize: '32px', fontWeight: 400, color: '#1A1208', marginBottom: '8px', letterSpacing: '-0.01em' }}>Forgot password?</h1>
            <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '32px', lineHeight: 1.5 }}>Enter your email and we&apos;ll send you a reset link.</p>

            {errorMsg && (
              <div style={{ padding: '12px 14px', backgroundColor: 'rgba(184,92,56,0.08)', border: '1px solid rgba(184,92,56,0.3)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#B85C38' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required disabled={loading} autoFocus style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', height: '46px', backgroundColor: loading ? '#8B3D22' : '#B85C38', color: '#F5F0E8', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, fontFamily: bodyFont, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #DDD8CE' }}>
              <a href="/auth/login" style={{ fontSize: '13px', color: '#5C5245', textDecoration: 'none' }}>&larr; Back to sign in</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
