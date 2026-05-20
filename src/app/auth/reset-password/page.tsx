'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check } from 'lucide-react'

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

function ResetForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) { setErrorMsg('Invalid reset link.'); return }
    if (password !== confirmPassword) { setErrorMsg('Passwords do not match.'); return }
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return }

    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/password?action=reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) setErrorMsg(data.error || 'Something went wrong.')
      else setDone(true)
    } catch {
      setErrorMsg('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#B85C38', fontSize: '14px', marginBottom: '24px' }}>Invalid or missing reset link. Please request a new one.</p>
        <a href="/auth/forgot-password" style={{ color: '#C9922A', fontSize: '14px' }}>Request new link</a>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(201,146,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <Check size={24} color="#C9922A" />
        </div>
        <h1 style={{ fontFamily: displayFont, fontSize: '28px', fontWeight: 400, color: '#1A1208', marginBottom: '12px', letterSpacing: '-0.01em' }}>Password updated</h1>
        <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '32px' }}>Your password has been changed. You can now sign in.</p>
        <button onClick={() => router.push('/auth/login')} style={{ width: '100%', height: '46px', backgroundColor: '#B85C38', color: '#F5F0E8', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, fontFamily: bodyFont, cursor: 'pointer' }}>
          Go to sign in
        </button>
      </div>
    )
  }

  return (
    <>
      <h1 style={{ fontFamily: displayFont, fontSize: '32px', fontWeight: 400, color: '#1A1208', marginBottom: '8px', letterSpacing: '-0.01em' }}>Set new password</h1>
      <p style={{ color: '#5C5245', fontSize: '14px', marginBottom: '32px', lineHeight: 1.5 }}>Choose a strong password for your account.</p>

      {errorMsg && (
        <div style={{ padding: '12px 14px', backgroundColor: 'rgba(184,92,56,0.08)', border: '1px solid rgba(184,92,56,0.3)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#B85C38' }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>New password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required disabled={loading} autoFocus style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A1208', marginBottom: '8px' }}>Confirm password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" required disabled={loading} style={inputStyle} onFocus={e => (e.target.style.borderColor = '#C9922A')} onBlur={e => (e.target.style.borderColor = '#DDD8CE')} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', height: '46px', backgroundColor: loading ? '#8B3D22' : '#B85C38', color: '#F5F0E8', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, fontFamily: bodyFont, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><Image src="/kreashot-wordmark-dark.png" alt="Kreashot" width={146} height={28} priority /></div>}>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8', padding: '40px 24px', fontFamily: bodyFont }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <div style={{ marginBottom: '40px' }}>
            <Image src="/kreashot-wordmark-dark.png" alt="Kreashot" width={146} height={28} priority />
          </div>
          <ResetForm />
        </div>
      </div>
    </Suspense>
  )
}
