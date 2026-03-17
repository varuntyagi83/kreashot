import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the company_id for the given user, or null if not found.
 * Call this at the top of every API route after auth.getUser().
 */
export async function getCompanyId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .single()
  return data?.company_id ?? null
}

/**
 * Returns the company_id + role for the given user.
 * Use when you need to check admin permissions.
 */
export async function getCompanyMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<{ company_id: string; role: string } | null> {
  const { data } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .single()
  return data ?? null
}

/**
 * Returns company_id + slug + name for the given user.
 * Use in API routes that construct Google Drive storage paths —
 * the slug is human-readable (e.g. "sunday-natural-181d469d")
 * and replaces the raw UUID as the Drive folder prefix.
 */
export async function getCompanyInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<{ company_id: string; company_slug: string; company_name: string } | null> {
  const { data } = await supabase
    .from('company_members')
    .select('company_id, companies!inner(slug, name)')
    .eq('user_id', userId)
    .single()
  if (!data) return null
  const company = data.companies as unknown as { slug: string; name: string } | null
  if (!company) return null
  return {
    company_id: data.company_id,
    company_slug: company.slug,
    company_name: company.name,
  }
}
