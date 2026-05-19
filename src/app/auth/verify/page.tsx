import Image from 'next/image'
import { Mail } from 'lucide-react'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

export default function VerifyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F5F0E8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: bodyFont,
    }}>
      <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>
        <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/kreashot-wordmark-dark.png"
            alt="Kreashot"
            width={146}
            height={28}
            priority
          />
        </div>

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

        <p style={{ color: '#5C5245', fontSize: '14px', lineHeight: 1.6, marginBottom: '32px' }}>
          A magic link is on its way. Click it to sign in. It expires in 24 hours.
        </p>

        <a href="/auth/login" style={{
          display: 'inline-block',
          fontSize: '13px',
          color: '#5C5245',
          textDecoration: 'underline',
        }}>
          Back to sign in
        </a>
      </div>
    </div>
  )
}
