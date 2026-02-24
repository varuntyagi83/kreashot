-- ============================================================================
-- Migration 017: Add Multi-Format Support to Angled Shots
-- ============================================================================
-- Purpose: Enable angled shots to be generated in multiple aspect ratios
--          using Gemini's intelligent aspect ratio conversion

-- Add format columns to angled_shots table
ALTER TABLE angled_shots
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS source_angled_shot_id UUID REFERENCES angled_shots(id) ON DELETE CASCADE;

-- Add foreign key constraint for format validation
ALTER TABLE angled_shots
  ADD CONSTRAINT angled_shots_format_fkey
  FOREIGN KEY (format) REFERENCES format_configs(format)
  ON UPDATE CASCADE;

-- Add index for format queries
CREATE INDEX IF NOT EXISTS idx_angled_shots_format
  ON angled_shots(format);

-- Add index for source lookup (to find all derived versions)
CREATE INDEX IF NOT EXISTS idx_angled_shots_source
  ON angled_shots(source_angled_shot_id);

-- Add comments
COMMENT ON COLUMN angled_shots.format IS 'Aspect ratio format (1:1, 16:9, 9:16, 4:5)';
COMMENT ON COLUMN angled_shots.width IS 'Image width in pixels';
COMMENT ON COLUMN angled_shots.height IS 'Image height in pixels';
COMMENT ON COLUMN angled_shots.source_angled_shot_id IS 'Reference to the original 1:1 angled shot (NULL for original, set for Gemini-generated variants)';

-- Update existing angled shots to have proper dimensions based on format
UPDATE angled_shots
SET
  width = CASE
    WHEN format = '1:1' THEN 1080
    WHEN format = '16:9' THEN 1920
    WHEN format = '9:16' THEN 1080
    WHEN format = '4:5' THEN 1080
    ELSE 1080
  END,
  height = CASE
    WHEN format = '1:1' THEN 1080
    WHEN format = '16:9' THEN 1080
    WHEN format = '9:16' THEN 1920
    WHEN format = '4:5' THEN 1350
    ELSE 1080
  END
WHERE format IS NOT NULL;
