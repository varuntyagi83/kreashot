-- ============================================================================
-- Migration 018: Add Display Name to Angled Shots
-- ============================================================================
-- Purpose: Add display_name field that includes product name prefix
--          Example: "Product Name_Front" instead of just "Front"

-- Add display_name column to angled_shots table
ALTER TABLE angled_shots
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comment
COMMENT ON COLUMN angled_shots.display_name IS 'Display name with product prefix (e.g., "Product Name_Front")';

-- Update existing records to have display_name
-- This will be populated by the migration script
UPDATE angled_shots
SET display_name = CASE
  WHEN angle_name = 'front' THEN 'Front'
  WHEN angle_name = 'left_30deg' THEN 'Left 30deg'
  WHEN angle_name = 'right_30deg' THEN 'Right 30deg'
  WHEN angle_name = 'top_45deg' THEN 'Top 45deg'
  WHEN angle_name = 'three_quarter_left' THEN 'Three Quarter Left'
  WHEN angle_name = 'three_quarter_right' THEN 'Three Quarter Right'
  WHEN angle_name = 'isometric' THEN 'Isometric'
  ELSE angle_name
END
WHERE display_name IS NULL;
