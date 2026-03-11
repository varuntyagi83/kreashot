-- Migration: Fix Security Advisor vulnerabilities (RLS)
-- Addresses Supabase Security Advisor findings (e.g. 0013: rls disabled in public).
-- Run this and then re-check Security Advisor in Dashboard → Database → Security Advisor.
--
-- 1. format_configs: reference table had no RLS (created in 015). Enable RLS and allow
--    read-only access for authenticated users. Writes stay migration/service-role only.

ALTER TABLE format_configs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read format metadata (needed for templates/composites/final_assets).
-- No INSERT/UPDATE/DELETE policies: only migrations / service role can modify.
CREATE POLICY "format_configs_select_authenticated"
  ON format_configs
  FOR SELECT
  TO authenticated
  USING (true);
