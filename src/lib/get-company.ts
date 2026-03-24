import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const ACTIVE_COMPANY_COOKIE = 'adforge_active_company'

/**
 * Reads the active company cookie. Safe in any async server context.
 */
async function readActiveCompanyCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/**
 * Returns all companies the user belongs to, with role + name + slug.
 */
export async function getUserCompanies(
  supabase: SupabaseClient,
  userId: string
): Promise<Array<{ company_id: string; role: string; name: string; slug: string }>> {
  const { data } = await supabase
    .from('company_members')
    .select('company_id, role, companies!inner(name, slug)')
    .eq('user_id', userId)
  if (!data) return []
  return data.map((row: any) => ({
    company_id: row.company_id,
    role: row.role,
    name: row.companies?.name ?? '',
    slug: row.companies?.slug ?? '',
  }))
}

/**
 * Resolves which company is active for the user.
 * Honours the active company cookie; falls back to first membership.
 */
async function resolveActiveCompanyId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: rows } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)

  if (!rows || rows.length === 0) return null

  const cookieValue = await readActiveCompanyCookie()
  if (cookieValue && rows.some((r) => r.company_id === cookieValue)) {
    return cookieValue
  }

  // Cookie not set or stale — fall back to first membership
  return rows[0].company_id
}

/**
 * Returns the company_id for the given user, or null if not found.
 * When the user belongs to multiple companies, honours the active company cookie.
 */
export async function getCompanyId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  return resolveActiveCompanyId(supabase, userId)
}

/**
 * Returns the company_id + role for the given user.
 * Use when you need to check admin permissions.
 */
export async function getCompanyMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<{ company_id: string; role: string } | null> {
  const companyId = await resolveActiveCompanyId(supabase, userId)
  if (!companyId) return null

  const { data } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  return data ?? null
}

/**
 * Returns company_id + slug + name for the given user.
 * Use in API routes that construct Google Drive storage paths.
 */
export async function getCompanyInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<{ company_id: string; company_slug: string; company_name: string } | null> {
  const companyId = await resolveActiveCompanyId(supabase, userId)
  if (!companyId) return null

  const { data } = await supabase
    .from('company_members')
    .select('company_id, companies!inner(slug, name)')
    .eq('user_id', userId)
    .eq('company_id', companyId)
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
