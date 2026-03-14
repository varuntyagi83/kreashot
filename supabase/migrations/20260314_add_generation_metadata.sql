-- Add generation_time_ms and aspect_ratio to backgrounds, composites, and final_assets
-- These columns power the image metadata badges in the UI (generation time + aspect ratio overlays)

ALTER TABLE backgrounds
  ADD COLUMN IF NOT EXISTS generation_time_ms integer,
  ADD COLUMN IF NOT EXISTS aspect_ratio text;

ALTER TABLE composites
  ADD COLUMN IF NOT EXISTS generation_time_ms integer,
  ADD COLUMN IF NOT EXISTS aspect_ratio text;

ALTER TABLE final_assets
  ADD COLUMN IF NOT EXISTS generation_time_ms integer,
  ADD COLUMN IF NOT EXISTS aspect_ratio text;

-- Backfill aspect_ratio from format column where available
UPDATE backgrounds SET aspect_ratio = format WHERE aspect_ratio IS NULL AND format IS NOT NULL;
UPDATE composites SET aspect_ratio = format WHERE aspect_ratio IS NULL AND format IS NOT NULL;
UPDATE final_assets SET aspect_ratio = format WHERE aspect_ratio IS NULL AND format IS NOT NULL;
