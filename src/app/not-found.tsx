import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F5F0E8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-inter), system-ui, sans-serif',
      color: '#1A1208',
      textAlign: 'center',
      padding: '40px 24px',
    }}>
      <p style={{ color: '#C9922A', fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '24px' }}>
        404
      </p>
      <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 400, marginBottom: '16px', lineHeight: 1.1 }}>
        Page not found
      </h1>
      <p style={{ color: '#5C5245', fontSize: '16px', lineHeight: 1.6, maxWidth: '360px', marginBottom: '40px' }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" style={{
        backgroundColor: '#B85C38',
        color: '#F5F0E8',
        padding: '12px 28px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        textDecoration: 'none',
      }}>
        Back to home
      </Link>
    </div>
  )
}
