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
