-- ============================================================
-- H-01: Harden collages table company_id FK, index, and RLS
-- ============================================================
-- Context:
--   20260304_create_collages_table.sql created the table without company_id.
--   20260316_company_multitenancy.sql added company_id as a plain FK
--   (REFERENCES companies(id), no ON DELETE CASCADE) and replaced the
--   collages_select/insert/update/delete policies with company-scoped ones.
--   However, it did NOT:
--     1. Add ON DELETE CASCADE to the company_id FK.
--     2. Create an index on collages(company_id).
--     3. Drop the four verbose user_id-based policies created in 20260304
--        ("Users can view/create/update/delete own collages") — the loop in
--        20260316 only targeted snake_case names and missed these.
-- This migration closes all three gaps without touching previously-applied files.
-- ============================================================

-- ============================================================
-- STEP 1: Re-create company_id FK with ON DELETE CASCADE
-- ============================================================
-- The column was added nullable in 20260316 and then set NOT NULL.
-- We need to drop the old constraint and recreate it with CASCADE.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'collages'::regclass
    AND contype = 'f'
    AND conkey = ARRAY(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'collages'::regclass AND attname = 'company_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE collages DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

ALTER TABLE collages
  ADD CONSTRAINT collages_company_id_fkey
  FOREIGN KEY (company_id)
  REFERENCES companies(id)
  ON DELETE CASCADE;

-- ============================================================
-- STEP 2: Index on company_id (missing from original migration)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_collages_company_id ON collages(company_id);

-- ============================================================
-- STEP 3: Drop residual user_id-based policies from 20260304
-- ============================================================
-- These four verbose policies were created in the original migration and
-- were NOT removed by the 20260316 loop (which only matched snake_case names).
DROP POLICY IF EXISTS "Users can view own collages"   ON collages;
DROP POLICY IF EXISTS "Users can create own collages" ON collages;
DROP POLICY IF EXISTS "Users can update own collages" ON collages;
DROP POLICY IF EXISTS "Users can delete own collages" ON collages;

-- ============================================================
-- STEP 4: Ensure company-scoped RLS policies are in place
-- ============================================================
-- The 20260316 migration created these under the snake_case names.
-- We recreate them idempotently in case this migration runs on a clean DB
-- where 20260316 has not yet been applied (e.g. replaying from scratch).
DROP POLICY IF EXISTS "collages_select" ON collages;
DROP POLICY IF EXISTS "collages_insert" ON collages;
DROP POLICY IF EXISTS "collages_update" ON collages;
DROP POLICY IF EXISTS "collages_delete" ON collages;

CREATE POLICY "collages_select" ON collages
  FOR SELECT USING (is_company_member(company_id));

CREATE POLICY "collages_insert" ON collages
  FOR INSERT WITH CHECK (is_company_member(company_id));

CREATE POLICY "collages_update" ON collages
  FOR UPDATE USING (is_company_member(company_id));

CREATE POLICY "collages_delete" ON collages
  FOR DELETE USING (is_company_member(company_id));
