-- Add color_description to categories for category-level brand PDF uploads.
-- When brand-docs uses Vision + translateGuidelinesToColorDescription, store result here
-- so backgrounds/composites can use accurate brand colors without @ references.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS brand_guidelines_color_description TEXT;

COMMENT ON COLUMN categories.brand_guidelines_color_description IS 'Natural-language color palette from brand PDF (for image generation). Populated when PDF is uploaded via brand-docs with Vision + translation.';
