-- Add 'overlay' to brand_assets asset_type check constraint
-- The seeder creates overlay brand assets but the original constraint didn't include this type.

ALTER TABLE brand_assets
  DROP CONSTRAINT IF EXISTS brand_assets_asset_type_check;

ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_asset_type_check
    CHECK (asset_type IN ('logo', 'font', 'color_palette', 'watermark', 'overlay', 'other'));
