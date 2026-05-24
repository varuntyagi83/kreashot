export default function VerifyEmailPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F0E8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, padding: '48px 32px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1A1208', marginBottom: 16 }}>Check your email</h1>
        <p style={{ color: '#5C5245', fontSize: 15, lineHeight: 1.6 }}>
          We sent a verification link to your email address. Click the link to activate your account and sign in.
        </p>
        <p style={{ color: '#7A6E62', fontSize: 13, marginTop: 24 }}>
          Didn&apos;t get the email? Check your spam folder or contact support.
        </p>
      </div>
    </div>
  )
}
