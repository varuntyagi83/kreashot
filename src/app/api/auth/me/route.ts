import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me — returns the current user's email for client-side use. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ email: null }, { status: 401 })
    return NextResponse.json({ email: user.email ?? null })
  } catch {
    return NextResponse.json({ email: null }, { status: 500 })
  }
}
