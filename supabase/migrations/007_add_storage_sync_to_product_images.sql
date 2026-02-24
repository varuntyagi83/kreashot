-- Migration: Add storage sync fields to product_images table
-- This enables the same 3-layer sync system (UI ↔ Supabase ↔ Google Drive) for product images

-- 1. Drop the trigger first (it was created in migration 006 but fields don't exist yet)
DROP TRIGGER IF EXISTS trigger_queue_product_image_deletion ON product_images;

-- 2. Add storage sync fields to product_images
ALTER TABLE product_images
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS storage_path TEXT,
ADD COLUMN IF NOT EXISTS storage_url TEXT,
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

-- 3. Update existing records to set storage_path from file_path
UPDATE product_images
SET storage_path = file_path
WHERE storage_path IS NULL;

-- 4. Recreate the trigger (now that fields exist)
CREATE TRIGGER trigger_queue_product_image_deletion
  AFTER DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION queue_product_image_deletion();

-- 5. Add comments
COMMENT ON COLUMN product_images.storage_provider IS 'Storage system: gdrive or supabase';
COMMENT ON COLUMN product_images.storage_path IS 'File path in storage system';
COMMENT ON COLUMN product_images.storage_url IS 'Public URL (Google Drive thumbnail API for gdrive files)';
COMMENT ON COLUMN product_images.gdrive_file_id IS 'Google Drive file ID for fast deletion';
