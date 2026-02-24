-- ============================================================================
-- Migration 018: Fix Existing Angled Shots Format Values
-- ============================================================================
-- Purpose: Ensure all existing angled shots have format='1:1' set
--          (for shots created before multi-format support)

-- Update any angled shots that don't have a format set
-- or have NULL format to default to '1:1'
UPDATE angled_shots
SET format = '1:1'
WHERE format IS NULL OR format = '';

-- Also set width/height for any records missing them
UPDATE angled_shots
SET
  width = 1080,
  height = 1080
WHERE format = '1:1' AND (width IS NULL OR height IS NULL OR width = 0 OR height = 0);

-- Set dimensions for other formats if they exist
UPDATE angled_shots
SET
  width = 1920,
  height = 1080
WHERE format = '16:9' AND (width IS NULL OR height IS NULL OR width = 0 OR height = 0);

UPDATE angled_shots
SET
  width = 1080,
  height = 1920
WHERE format = '9:16' AND (width IS NULL OR height IS NULL OR width = 0 OR height = 0);

UPDATE angled_shots
SET
  width = 1080,
  height = 1350
WHERE format = '4:5' AND (width IS NULL OR height IS NULL OR width = 0 OR height = 0);
