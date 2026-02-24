-- ============================================================================
-- Migration 016: Add gdrive_folder_id to categories table
-- ============================================================================
-- Purpose: Store Google Drive root folder ID for each category
--          Required for automated storage organization

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS gdrive_folder_id TEXT;

-- Add index for folder ID lookups
CREATE INDEX IF NOT EXISTS idx_categories_gdrive_folder_id
  ON categories(gdrive_folder_id);

-- Add comment for documentation
COMMENT ON COLUMN categories.gdrive_folder_id IS 'Google Drive root folder ID for category storage';
