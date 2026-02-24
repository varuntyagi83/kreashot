-- Migration 012: Add format support to backgrounds table
-- Phase 4: Multi-format background generation

-- Add format, width, and height columns to backgrounds table
ALTER TABLE backgrounds
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080;

-- Create index for format queries
CREATE INDEX IF NOT EXISTS idx_backgrounds_format ON backgrounds(format);

-- Add check constraint for valid formats
ALTER TABLE backgrounds
  ADD CONSTRAINT backgrounds_format_check
  CHECK (format IN ('1:1', '16:9', '9:16', '4:5'));

-- Comment
COMMENT ON COLUMN backgrounds.format IS 'Aspect ratio format (1:1, 16:9, 9:16, 4:5)';
COMMENT ON COLUMN backgrounds.width IS 'Background width in pixels';
COMMENT ON COLUMN backgrounds.height IS 'Background height in pixels';
