-- Add 'gcs' to storage_provider check constraints across all affected tables.
-- Previously only ('supabase', 'gdrive', 's3', 'local') were allowed.

ALTER TABLE product_images
  DROP CONSTRAINT IF EXISTS product_images_provider_check,
  ADD CONSTRAINT product_images_provider_check
    CHECK (storage_provider IN ('supabase', 'gdrive', 'gcs', 's3', 'local'));

ALTER TABLE brand_assets
  DROP CONSTRAINT IF EXISTS brand_assets_provider_check,
  ADD CONSTRAINT brand_assets_provider_check
    CHECK (storage_provider IN ('supabase', 'gdrive', 'gcs', 's3', 'local'));

ALTER TABLE angled_shots
  DROP CONSTRAINT IF EXISTS angled_shots_provider_check,
  ADD CONSTRAINT angled_shots_provider_check
    CHECK (storage_provider IN ('supabase', 'gdrive', 'gcs', 's3', 'local'));

ALTER TABLE copy_docs
  DROP CONSTRAINT IF EXISTS copy_docs_provider_check,
  ADD CONSTRAINT copy_docs_provider_check
    CHECK (storage_provider IN ('supabase', 'gdrive', 'gcs', 's3', 'local'));
