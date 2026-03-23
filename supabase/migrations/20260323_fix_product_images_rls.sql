-- ============================================================
-- Fix product_images RLS policies for multi-tenancy
-- ============================================================
-- The product_images table was created in 003_align_product_images_schema.sql
-- with old user_id-based policies. It was accidentally omitted from the
-- company_id-based policy replacement loop in 20260316_company_multitenancy.sql.
-- This migration drops the stale policies and creates company-scoped ones.
-- ============================================================

-- Backfill any product_images rows that still have NULL company_id
-- (e.g. images uploaded after the multitenancy migration but before this fix)
UPDATE product_images pi
SET company_id = p.company_id
FROM products p
WHERE pi.product_id = p.id
  AND pi.company_id IS NULL
  AND p.company_id IS NOT NULL;

-- Drop old user_id-based policies
DROP POLICY IF EXISTS "product_images_select" ON product_images;
DROP POLICY IF EXISTS "product_images_insert" ON product_images;
DROP POLICY IF EXISTS "product_images_update" ON product_images;
DROP POLICY IF EXISTS "product_images_delete" ON product_images;

-- Create new company-scoped policies (matches all other tables)
CREATE POLICY "product_images_select" ON product_images
  FOR SELECT USING (is_company_member(company_id));

CREATE POLICY "product_images_insert" ON product_images
  FOR INSERT WITH CHECK (is_company_member(company_id));

CREATE POLICY "product_images_update" ON product_images
  FOR UPDATE USING (is_company_member(company_id));

CREATE POLICY "product_images_delete" ON product_images
  FOR DELETE USING (is_company_member(company_id));
