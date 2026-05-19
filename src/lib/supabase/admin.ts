import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — initialized on first call (request time), not at module load (build time).
// Using a closure rather than a bare mutable module variable avoids the TS strict-null issue
// while still guaranteeing a single client per process.
let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _client
}
