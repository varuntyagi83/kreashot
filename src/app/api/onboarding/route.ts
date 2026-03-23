import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding
 * Creates a company for a newly signed-up user who has no company yet.
 * Safe to call multiple times — exits early if the user already belongs to a company.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Idempotency: if already in a company, just return success
    const { data: existing } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ alreadyOnboarded: true })
    }

    const { companyName } = await request.json()
    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json({ error: 'companyName is required' }, { status: 400 })
    }
    if (companyName.length > 100) {
      return NextResponse.json({ error: 'companyName must be 100 characters or fewer' }, { status: 400 })
    }

    const name = companyName.trim()
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const slug = `${baseSlug}-${user.id.slice(0, 8)}`

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name, slug })
      .select('id')
      .single()

    if (companyError || !company) {
      console.error('[onboarding POST] company insert error:', companyError)
      return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }

    const { error: memberError } = await supabase
      .from('company_members')
      .insert({ company_id: company.id, user_id: user.id, role: 'admin' })

    if (memberError) {
      console.error('[onboarding POST] member insert error:', memberError)
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
    }

    console.log(`[onboarding] Created company "${name}" (${company.id}) for user ${user.email}`)
    return NextResponse.json({ company: { id: company.id, name, slug } }, { status: 201 })
  } catch (err: any) {
    console.error('[onboarding POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
