-- Migration: Fix Security Definer View issues (Security Advisor 0010)
-- Recreate templates_by_format, composites_by_format, final_assets_by_format
-- with security_invoker = true so they run as the calling user and RLS applies.
-- See: https://supabase.com/docs/guides/database/database-advisors

-- 1. templates_by_format
DROP VIEW IF EXISTS templates_by_format;
CREATE VIEW templates_by_format
  WITH (security_invoker = on)
AS
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

-- 2. composites_by_format
DROP VIEW IF EXISTS composites_by_format;
CREATE VIEW composites_by_format
  WITH (security_invoker = on)
AS
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

-- 3. final_assets_by_format
DROP VIEW IF EXISTS final_assets_by_format;
CREATE VIEW final_assets_by_format
  WITH (security_invoker = on)
AS
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
