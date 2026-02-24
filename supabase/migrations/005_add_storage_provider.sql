-- ============================================
-- Migration: Add storage provider tracking
-- Purpose: Track which storage backend is used for each file
-- Date: February 21, 2026
-- ============================================

-- Add storage_provider column to all file tables
ALTER TABLE product_images
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

ALTER TABLE brand_assets
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

ALTER TABLE backgrounds
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

ALTER TABLE composites
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

ALTER TABLE final_assets
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'gdrive';

-- Add gdrive_file_id to store Google Drive file IDs for direct access
ALTER TABLE product_images
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

ALTER TABLE brand_assets
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

ALTER TABLE backgrounds
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

ALTER TABLE composites
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

ALTER TABLE final_assets
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_images_provider ON product_images(storage_provider);
CREATE INDEX IF NOT EXISTS idx_product_images_gdrive_id ON product_images(gdrive_file_id) WHERE gdrive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brand_assets_provider ON brand_assets(storage_provider);
CREATE INDEX IF NOT EXISTS idx_brand_assets_gdrive_id ON brand_assets(gdrive_file_id) WHERE gdrive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_angled_shots_provider ON angled_shots(storage_provider);
CREATE INDEX IF NOT EXISTS idx_angled_shots_gdrive_id ON angled_shots(gdrive_file_id) WHERE gdrive_file_id IS NOT NULL;

-- Add check constraints to ensure valid storage provider
ALTER TABLE product_images
ADD CONSTRAINT IF NOT EXISTS product_images_provider_check
CHECK (storage_provider IN ('supabase', 'gdrive', 's3', 'local'));

ALTER TABLE brand_assets
ADD CONSTRAINT IF NOT EXISTS brand_assets_provider_check
CHECK (storage_provider IN ('supabase', 'gdrive', 's3', 'local'));

ALTER TABLE angled_shots
ADD CONSTRAINT IF NOT EXISTS angled_shots_provider_check
CHECK (storage_provider IN ('supabase', 'gdrive', 's3', 'local'));

-- Comment on columns
COMMENT ON COLUMN product_images.storage_provider IS 'Storage backend: supabase, gdrive, s3, local';
COMMENT ON COLUMN product_images.gdrive_file_id IS 'Google Drive file ID for direct access';
COMMENT ON COLUMN product_images.storage_url IS 'Public URL (may be from Supabase or Google Drive)';

-- Verification
SELECT
  'product_images' as table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'product_images'
  AND column_name IN ('storage_provider', 'gdrive_file_id')
ORDER BY column_name;
