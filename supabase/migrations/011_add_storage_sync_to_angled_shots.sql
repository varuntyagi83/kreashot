-- ============================================
-- Add storage sync fields to angled_shots
-- ============================================

-- Add storage_provider column (defaults to 'supabase' for existing records)
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase';

-- Add gdrive_file_id column for Google Drive integration
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

-- Also need to update the old product_asset_id reference (should be product_image_id)
-- First, add the new column
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS product_image_id UUID REFERENCES product_images(id) ON DELETE CASCADE;

-- For existing records, copy product_asset_id to product_image_id if needed
-- (This handles the case where product_assets was renamed to product_images)
UPDATE angled_shots
SET product_image_id = product_asset_id
WHERE product_image_id IS NULL AND product_asset_id IS NOT NULL;

-- Make product_image_id NOT NULL after data migration
ALTER TABLE angled_shots
ALTER COLUMN product_image_id SET NOT NULL;

-- Drop the old product_asset_id column if it exists
ALTER TABLE angled_shots
DROP COLUMN IF EXISTS product_asset_id;

-- Add index for faster lookups by product_image
CREATE INDEX IF NOT EXISTS idx_angled_shots_product_image_id
ON angled_shots(product_image_id);

-- Add index for faster lookups by Google Drive file ID
CREATE INDEX IF NOT EXISTS idx_angled_shots_gdrive_file_id
ON angled_shots(gdrive_file_id)
WHERE gdrive_file_id IS NOT NULL;

-- ============================================
-- Update deletion queue trigger
-- ============================================

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS angled_shots_deletion_queue ON angled_shots;

-- Create function to queue angled shot deletion
CREATE OR REPLACE FUNCTION queue_angled_shot_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue for deletion if stored in external storage
  IF OLD.storage_provider IN ('gdrive', 's3') AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO storage_deletion_queue (
      file_path,
      storage_provider,
      gdrive_file_id,
      metadata
    ) VALUES (
      OLD.storage_path,
      OLD.storage_provider,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'table', 'angled_shots',
        'record_id', OLD.id,
        'angle_name', OLD.angle_name
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER angled_shots_deletion_queue
  BEFORE DELETE ON angled_shots
  FOR EACH ROW
  EXECUTE FUNCTION queue_angled_shot_deletion();
