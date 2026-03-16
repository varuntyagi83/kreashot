-- ============================================================
-- Multi-Tenant Company Authorization Migration
-- ============================================================
-- Adds company-level data isolation.
-- Each user auto-joins a company; data is scoped by company_id.
-- user_id is kept as creator audit trail (unchanged, never removed).
-- ============================================================

-- ============================================================
-- STEP 1: Create companies + company_members tables
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);

-- ============================================================
-- STEP 2: Add company_id to all main tables (nullable first)
-- ============================================================

ALTER TABLE categories       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE brand_assets     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE products         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE angled_shots     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE backgrounds      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE composites       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE copy_docs        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE guidelines       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE final_assets     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE ad_exports       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE asset_references ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE templates        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE collages         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE brand_guidelines ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE brand_voices     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- product_images table (if it exists — added in later migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_images') THEN
    ALTER TABLE product_images ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
  END IF;
END$$;

-- ============================================================
-- STEP 3: Data migration — one company per existing user
-- ============================================================

-- Create a temp mapping table: user_id → new company_id
CREATE TEMP TABLE _user_company_map AS
SELECT
  au.id AS user_id,
  gen_random_uuid() AS company_id,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(au.email, '@', 1),
    'My Company'
  ) AS company_name,
  au.email
FROM auth.users au;

-- Insert one company per user
INSERT INTO companies (id, name, slug)
SELECT
  company_id,
  company_name,
  LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || LEFT(company_id::text, 8)
FROM _user_company_map
ON CONFLICT DO NOTHING;

-- Insert one admin member per company
INSERT INTO company_members (company_id, user_id, role)
SELECT company_id, user_id, 'admin'
FROM _user_company_map
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 4: Backfill company_id on all tables
-- ============================================================

UPDATE categories       t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE brand_assets     t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE products         t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE angled_shots     t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE backgrounds      t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE composites       t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE copy_docs        t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE guidelines       t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE final_assets     t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE ad_exports       t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE asset_references t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE templates        t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE collages         t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE brand_guidelines t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;
UPDATE brand_voices     t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id;

-- product_images (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_images') THEN
    EXECUTE 'UPDATE product_images t SET company_id = m.company_id FROM _user_company_map m WHERE t.user_id = m.user_id';
  END IF;
END$$;

-- ============================================================
-- STEP 5: Set NOT NULL constraint after backfill
-- ============================================================

ALTER TABLE categories       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE brand_assets     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE products         ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE angled_shots     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE backgrounds      ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE composites       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE copy_docs        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE guidelines       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE final_assets     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE ad_exports       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE asset_references ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE templates        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE collages         ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE brand_guidelines ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE brand_voices     ALTER COLUMN company_id SET NOT NULL;

-- Indexes on company_id for the main queryable tables
CREATE INDEX IF NOT EXISTS idx_categories_company_id ON categories(company_id);
CREATE INDEX IF NOT EXISTS idx_backgrounds_company_id ON backgrounds(company_id);
CREATE INDEX IF NOT EXISTS idx_composites_company_id ON composites(company_id);
CREATE INDEX IF NOT EXISTS idx_final_assets_company_id ON final_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_company_id ON brand_assets(company_id);

-- ============================================================
-- STEP 6: RLS helper function
-- ============================================================

CREATE OR REPLACE FUNCTION is_company_member(cid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = cid AND user_id = auth.uid()
  )
$$;

-- ============================================================
-- STEP 7: Update RLS policies to use company_id
-- ============================================================

-- Helper: drop all old user_id-based policies and create new company_id-based ones
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'categories', 'brand_assets', 'products',
    'angled_shots', 'backgrounds', 'composites', 'copy_docs',
    'guidelines', 'final_assets', 'ad_exports', 'asset_references',
    'templates', 'collages', 'brand_guidelines', 'brand_voices'
  ])
  LOOP
    -- Drop old user_id-based policies (various naming patterns used historically)
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', tbl, tbl);
    -- Also drop commonly named policies from security advisor fix
    EXECUTE format('DROP POLICY IF EXISTS "Allow users to manage own %s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Users can manage their own %s" ON %I', tbl, tbl);

    -- Create new company-scoped policies
    EXECUTE format('
      CREATE POLICY "%s_select" ON %I FOR SELECT USING (is_company_member(company_id));
      CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (is_company_member(company_id));
      CREATE POLICY "%s_update" ON %I FOR UPDATE USING (is_company_member(company_id));
      CREATE POLICY "%s_delete" ON %I FOR DELETE USING (is_company_member(company_id));
    ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- STEP 8: RLS on companies + company_members tables
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- Users can see their own company
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid())
  );

-- Only admins can update company info
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid() AND role = 'admin')
  );

-- Members can see all members in their company
CREATE POLICY "company_members_select" ON company_members
  FOR SELECT USING (is_company_member(company_id));

-- Only admins can insert (invite) members
CREATE POLICY "company_members_insert" ON company_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_id = company_members.company_id AND user_id = auth.uid() AND role = 'admin')
  );

-- Only admins can remove members (or a user can remove themselves)
CREATE POLICY "company_members_delete" ON company_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM company_members WHERE company_id = company_members.company_id AND user_id = auth.uid() AND role = 'admin')
  );

-- System can insert company/member on signup (service role bypasses RLS)
-- No INSERT policy on companies needed — auth callback uses service role or anon insert is handled server-side
