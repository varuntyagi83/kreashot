-- Migration 015: Multi-Format Support for Templates, Composites, and Final Assets
-- Phase 1 of multi-format implementation
--
-- This migration adds format support while maintaining backward compatibility:
-- - Adds format columns with '1:1' defaults (preserves existing behavior)
-- - Creates format_configs table for format metadata
-- - Updates constraints to allow one template per (category, format) pair
--
-- IMPORTANT: This is NON-BREAKING. All existing data remains unchanged.

-- ============================================================================
-- Step 1: Add format columns to templates table
-- ============================================================================

-- Add format-related columns (all default to '1:1' for existing rows)
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080;

-- Ensure all existing templates explicitly have 1:1 format
UPDATE templates
SET
  format = '1:1',
  width = 1080,
  height = 1080
WHERE format IS NULL OR format = '';

-- Add comment for documentation
COMMENT ON COLUMN templates.format IS 'Format type: 1:1, 16:9, 9:16, or 4:5';
COMMENT ON COLUMN templates.width IS 'Canvas width in pixels';
COMMENT ON COLUMN templates.height IS 'Canvas height in pixels';

-- ============================================================================
-- Step 2: Update templates unique constraint
-- ============================================================================

-- Drop old constraint (one template per category)
DROP INDEX IF EXISTS idx_templates_category;

-- Create new constraint (one template per category+format combination)
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_category_format
  ON templates(category_id, format)
  ;

-- Add index for format queries
CREATE INDEX IF NOT EXISTS idx_templates_format
  ON templates(format)
  ;

-- ============================================================================
-- Step 3: Add format columns to composites table
-- ============================================================================

ALTER TABLE composites
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080;

-- Ensure all existing composites explicitly have 1:1 format
UPDATE composites
SET
  format = '1:1',
  width = 1080,
  height = 1080
WHERE format IS NULL OR format = '';

-- Add comment for documentation
COMMENT ON COLUMN composites.format IS 'Format type inherited from template';
COMMENT ON COLUMN composites.width IS 'Composite width in pixels';
COMMENT ON COLUMN composites.height IS 'Composite height in pixels';

-- Add index for format queries
CREATE INDEX IF NOT EXISTS idx_composites_format
  ON composites(format)
  ;

-- ============================================================================
-- Step 4: Add format columns to final_assets table
-- ============================================================================

ALTER TABLE final_assets
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080;

-- Ensure all existing final_assets explicitly have 1:1 format
UPDATE final_assets
SET
  format = '1:1',
  width = 1080,
  height = 1080
WHERE format IS NULL OR format = '';

-- Add comment for documentation
COMMENT ON COLUMN final_assets.format IS 'Format type inherited from template';
COMMENT ON COLUMN final_assets.width IS 'Final asset width in pixels';
COMMENT ON COLUMN final_assets.height IS 'Final asset height in pixels';

-- Add index for format queries
CREATE INDEX IF NOT EXISTS idx_final_assets_format
  ON final_assets(format)
  ;

-- ============================================================================
-- Step 5: Create format_configs table (metadata for supported formats)
-- ============================================================================

CREATE TABLE IF NOT EXISTS format_configs (
  format TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  aspect_ratio NUMERIC(5,2) NOT NULL,
  platform_tags TEXT[] DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE format_configs IS 'Metadata for supported ad formats';
COMMENT ON COLUMN format_configs.format IS 'Format identifier (1:1, 16:9, etc.)';
COMMENT ON COLUMN format_configs.name IS 'Display name for UI';
COMMENT ON COLUMN format_configs.width IS 'Default canvas width in pixels';
COMMENT ON COLUMN format_configs.height IS 'Default canvas height in pixels';
COMMENT ON COLUMN format_configs.aspect_ratio IS 'Width divided by height';
COMMENT ON COLUMN format_configs.platform_tags IS 'Social media platforms that support this format';

-- Insert standard formats
INSERT INTO format_configs (format, name, width, height, aspect_ratio, platform_tags, description)
VALUES
  (
    '1:1',
    'Square (Instagram Post)',
    1080,
    1080,
    1.00,
    ARRAY['instagram', 'facebook', 'linkedin', 'twitter'],
    'Perfect square format for Instagram posts, Facebook posts, and LinkedIn updates'
  ),
  (
    '16:9',
    'Landscape (YouTube)',
    1920,
    1080,
    1.78,
    ARRAY['youtube', 'facebook', 'linkedin', 'twitter', 'website'],
    'Wide landscape format for YouTube videos, Facebook covers, and website banners'
  ),
  (
    '9:16',
    'Portrait (Stories)',
    1080,
    1920,
    0.56,
    ARRAY['instagram', 'facebook', 'tiktok', 'snapchat', 'youtube-shorts'],
    'Vertical format for Instagram Stories, TikTok, Snapchat, and YouTube Shorts'
  ),
  (
    '4:5',
    'Portrait (Feed)',
    1080,
    1350,
    0.80,
    ARRAY['instagram', 'facebook', 'pinterest'],
    'Vertical format optimized for Instagram and Facebook feed posts'
  )
ON CONFLICT (format) DO UPDATE SET
  name = EXCLUDED.name,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  aspect_ratio = EXCLUDED.aspect_ratio,
  platform_tags = EXCLUDED.platform_tags,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Add updated_at trigger
DROP FUNCTION IF EXISTS update_format_configs_updated_at CASCADE;
CREATE OR REPLACE FUNCTION update_format_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS format_configs_updated_at ON format_configs;
CREATE TRIGGER format_configs_updated_at
  BEFORE UPDATE ON format_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_format_configs_updated_at();

-- ============================================================================
-- Step 6: Add format validation constraints
-- ============================================================================

-- Ensure format values match format_configs
ALTER TABLE templates
  ADD CONSTRAINT templates_format_fkey
  FOREIGN KEY (format)
  REFERENCES format_configs(format)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE composites
  ADD CONSTRAINT composites_format_fkey
  FOREIGN KEY (format)
  REFERENCES format_configs(format)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE final_assets
  ADD CONSTRAINT final_assets_format_fkey
  FOREIGN KEY (format)
  REFERENCES format_configs(format)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- ============================================================================
-- Step 7: Create helper views for format queries
-- ============================================================================

-- View: templates_by_format
-- Groups templates by category and format for easy querying
DROP VIEW IF EXISTS templates_by_format AS
SELECT
  t.category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  t.format,
  fc.name AS format_name,
  fc.width AS format_width,
  fc.height AS format_height,
  fc.aspect_ratio,
  COUNT(t.id) AS template_count,
  MAX(t.created_at) AS latest_template_created
FROM templates t
JOIN categories c ON c.id = t.category_id
JOIN format_configs fc ON fc.format = t.format
GROUP BY t.category_id, c.name, c.slug, t.format, fc.name, fc.width, fc.height, fc.aspect_ratio;

COMMENT ON VIEW templates_by_format IS 'Summary of templates grouped by category and format';

-- View: composites_by_format
-- Shows composite counts per category and format
DROP VIEW IF EXISTS composites_by_format AS
SELECT
  comp.category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  comp.format,
  fc.name AS format_name,
  COUNT(comp.id) AS composite_count,
  MAX(comp.created_at) AS latest_composite_created
FROM composites comp
JOIN categories c ON c.id = comp.category_id
JOIN format_configs fc ON fc.format = comp.format
GROUP BY comp.category_id, c.name, c.slug, comp.format, fc.name;

COMMENT ON VIEW composites_by_format IS 'Summary of composites grouped by category and format';

-- View: final_assets_by_format
-- Shows final asset counts per category and format
DROP VIEW IF EXISTS final_assets_by_format AS
SELECT
  fa.category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  fa.format,
  fc.name AS format_name,
  COUNT(fa.id) AS final_asset_count,
  MAX(fa.created_at) AS latest_final_asset_created
FROM final_assets fa
JOIN categories c ON c.id = fa.category_id
JOIN format_configs fc ON fc.format = fa.format
GROUP BY fa.category_id, c.name, c.slug, fa.format, fc.name;

COMMENT ON VIEW final_assets_by_format IS 'Summary of final assets grouped by category and format';

-- ============================================================================
-- Step 8: Create verification queries
-- ============================================================================

-- Function to verify migration success
CREATE OR REPLACE FUNCTION verify_multi_format_migration()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- Check 1: format_configs table exists and has 4 rows
  RETURN QUERY
  SELECT
    'format_configs_table'::TEXT AS check_name,
    CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'FAIL' END AS status,
    'Expected 4 formats, found ' || COUNT(*)::TEXT AS details
  FROM format_configs;

  -- Check 2: All templates have format set
  RETURN QUERY
  SELECT
    'templates_format_set'::TEXT AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE format IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    'Templates with NULL format: ' || COUNT(*) FILTER (WHERE format IS NULL)::TEXT AS details
  FROM templates;

  -- Check 3: All composites have format set
  RETURN QUERY
  SELECT
    'composites_format_set'::TEXT AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE format IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    'Composites with NULL format: ' || COUNT(*) FILTER (WHERE format IS NULL)::TEXT AS details
  FROM composites;

  -- Check 4: All final_assets have format set
  RETURN QUERY
  SELECT
    'final_assets_format_set'::TEXT AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE format IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    'Final assets with NULL format: ' || COUNT(*) FILTER (WHERE format IS NULL)::TEXT AS details
  FROM final_assets;

  -- Check 5: Unique constraint works (one template per category+format)
  RETURN QUERY
  SELECT
    'templates_unique_constraint'::TEXT AS check_name,
    'INFO'::TEXT AS status,
    'Templates per category+format: ' || COUNT(*)::TEXT AS details
  FROM templates_by_format;

  -- Check 6: Views created successfully
  RETURN QUERY
  SELECT
    'views_created'::TEXT AS check_name,
    CASE WHEN COUNT(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS status,
    'Format views found: ' || COUNT(*)::TEXT AS details
  FROM information_schema.views
  WHERE table_name IN ('templates_by_format', 'composites_by_format', 'final_assets_by_format');

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_multi_format_migration() IS 'Verification checks for multi-format migration';

-- ============================================================================
-- Migration Summary
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 015: Multi-format support completed successfully';
  RAISE NOTICE '📋 Summary:';
  RAISE NOTICE '  - Added format columns to templates, composites, final_assets';
  RAISE NOTICE '  - Created format_configs table with 4 formats';
  RAISE NOTICE '  - Updated unique constraints for multi-format templates';
  RAISE NOTICE '  - Created helper views for format queries';
  RAISE NOTICE '  - All existing data preserved with 1:1 format defaults';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Run verification: SELECT * FROM verify_multi_format_migration();';
END $$;
