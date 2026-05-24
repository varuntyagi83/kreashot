'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ color: '#1A1208' }}>Something went wrong</h2>
          <button
            onClick={reset}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              background: '#B85C38',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
