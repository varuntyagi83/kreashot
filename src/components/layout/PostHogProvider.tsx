'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useSession } from 'next-auth/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    capture_pageview: false, // we capture manually below to get SPA navigation
    capture_pageleave: true,
    person_profiles: 'identified_only',
  })
}

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (pathname) {
      ph?.capture('$pageview', { $current_url: window.location.href })
    }
  }, [pathname, searchParams, ph])

  return null
}

function UserIdentifier() {
  const { data: session } = useSession()
  const ph = usePostHog()

  useEffect(() => {
    if (session?.user?.email) {
      ph?.identify(session.user.email, {
        email: session.user.email,
        name: session.user.name ?? undefined,
      })
    } else if (!session) {
      ph?.reset()
    }
  }, [session, ph])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <UserIdentifier />
      {children}
    </PHProvider>
  )
}
