-- Apply Phase 3 Migrations (009, 010, 011)
-- Run this in Supabase SQL Editor

-- ============================================
-- Migration 009: Add backgrounds table
-- ============================================

CREATE TABLE IF NOT EXISTS backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Background metadata
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  prompt_used TEXT,

  -- Storage sync fields (CRITICAL - all 4 required)
  storage_provider TEXT NOT NULL DEFAULT 'gdrive',
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  gdrive_file_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(category_id, slug)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_backgrounds_category_id ON backgrounds(category_id);
CREATE INDEX IF NOT EXISTS idx_backgrounds_user_id ON backgrounds(user_id);
CREATE INDEX IF NOT EXISTS idx_backgrounds_storage_provider ON backgrounds(storage_provider);

-- Enable RLS
ALTER TABLE backgrounds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view their own backgrounds" ON backgrounds;
  DROP POLICY IF EXISTS "Users can insert backgrounds in their own categories" ON backgrounds;
  DROP POLICY IF EXISTS "Users can update their own backgrounds" ON backgrounds;
  DROP POLICY IF EXISTS "Users can delete their own backgrounds" ON backgrounds;

  -- Create new policies
  CREATE POLICY "Users can view their own backgrounds"
    ON backgrounds FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = backgrounds.category_id
        AND categories.user_id = auth.uid()
      )
    );

  CREATE POLICY "Users can insert backgrounds in their own categories"
    ON backgrounds FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = backgrounds.category_id
        AND categories.user_id = auth.uid()
      )
      AND user_id = auth.uid()
    );

  CREATE POLICY "Users can update their own backgrounds"
    ON backgrounds FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = backgrounds.category_id
        AND categories.user_id = auth.uid()
      )
    );

  CREATE POLICY "Users can delete their own backgrounds"
    ON backgrounds FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = backgrounds.category_id
        AND categories.user_id = auth.uid()
      )
    );
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_backgrounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS backgrounds_updated_at ON backgrounds;
CREATE TRIGGER backgrounds_updated_at
  BEFORE UPDATE ON backgrounds
  FOR EACH ROW
  EXECUTE FUNCTION update_backgrounds_updated_at();

-- Deletion queue trigger
CREATE OR REPLACE FUNCTION queue_background_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_category_id UUID;
BEGIN
  SELECT c.user_id, c.id INTO v_user_id, v_category_id
  FROM categories c
  WHERE c.id = OLD.category_id;

  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      user_id,
      storage_provider,
      storage_path,
      storage_url,
      gdrive_file_id,
      metadata
    ) VALUES (
      'background',
      OLD.id,
      v_user_id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', v_category_id,
        'background_name', OLD.name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS backgrounds_deletion_queue ON backgrounds;
CREATE TRIGGER backgrounds_deletion_queue
  BEFORE DELETE ON backgrounds
  FOR EACH ROW
  EXECUTE FUNCTION queue_background_deletion();

-- Grant permissions
GRANT ALL ON backgrounds TO authenticated;
GRANT ALL ON backgrounds TO service_role;

-- ============================================
-- Migration 010: Add composites table
-- ============================================

CREATE TABLE IF NOT EXISTS composites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  angled_shot_id UUID NOT NULL REFERENCES angled_shots(id) ON DELETE CASCADE,
  background_id UUID NOT NULL REFERENCES backgrounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Composite metadata
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  prompt_used TEXT,

  -- Storage sync fields (CRITICAL - all 4 required)
  storage_provider TEXT NOT NULL DEFAULT 'gdrive',
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  gdrive_file_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(category_id, slug),
  UNIQUE(angled_shot_id, background_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_composites_category_id ON composites(category_id);
CREATE INDEX IF NOT EXISTS idx_composites_product_id ON composites(product_id);
CREATE INDEX IF NOT EXISTS idx_composites_angled_shot_id ON composites(angled_shot_id);
CREATE INDEX IF NOT EXISTS idx_composites_background_id ON composites(background_id);
CREATE INDEX IF NOT EXISTS idx_composites_user_id ON composites(user_id);
CREATE INDEX IF NOT EXISTS idx_composites_storage_provider ON composites(storage_provider);

-- Enable RLS
ALTER TABLE composites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their own composites" ON composites;
  DROP POLICY IF EXISTS "Users can insert composites in their own categories" ON composites;
  DROP POLICY IF EXISTS "Users can update their own composites" ON composites;
  DROP POLICY IF EXISTS "Users can delete their own composites" ON composites;

  CREATE POLICY "Users can view their own composites"
    ON composites FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = composites.category_id
        AND categories.user_id = auth.uid()
      )
    );

  CREATE POLICY "Users can insert composites in their own categories"
    ON composites FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = composites.category_id
        AND categories.user_id = auth.uid()
      )
      AND user_id = auth.uid()
    );

  CREATE POLICY "Users can update their own composites"
    ON composites FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = composites.category_id
        AND categories.user_id = auth.uid()
      )
    );

  CREATE POLICY "Users can delete their own composites"
    ON composites FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM categories
        WHERE categories.id = composites.category_id
        AND categories.user_id = auth.uid()
      )
    );
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_composites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS composites_updated_at ON composites;
CREATE TRIGGER composites_updated_at
  BEFORE UPDATE ON composites
  FOR EACH ROW
  EXECUTE FUNCTION update_composites_updated_at();

-- Deletion queue trigger
CREATE OR REPLACE FUNCTION queue_composite_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_category_id UUID;
BEGIN
  SELECT c.user_id, c.id INTO v_user_id, v_category_id
  FROM categories c
  WHERE c.id = OLD.category_id;

  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      user_id,
      storage_provider,
      storage_path,
      storage_url,
      gdrive_file_id,
      metadata
    ) VALUES (
      'composite',
      OLD.id,
      v_user_id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', v_category_id,
        'product_id', OLD.product_id,
        'angled_shot_id', OLD.angled_shot_id,
        'background_id', OLD.background_id,
        'composite_name', OLD.name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS composites_deletion_queue ON composites;
CREATE TRIGGER composites_deletion_queue
  BEFORE DELETE ON composites
  FOR EACH ROW
  EXECUTE FUNCTION queue_composite_deletion();

-- Grant permissions
GRANT ALL ON composites TO authenticated;
GRANT ALL ON composites TO service_role;

-- ============================================
-- Migration 011: Add storage sync to angled_shots
-- ============================================

-- Add storage_provider column
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase';

-- Add gdrive_file_id column
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;

-- Add product_image_id column (replaces old product_asset_id)
ALTER TABLE angled_shots
ADD COLUMN IF NOT EXISTS product_image_id UUID REFERENCES product_images(id) ON DELETE CASCADE;

-- Migrate data from old column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'angled_shots' AND column_name = 'product_asset_id'
  ) THEN
    UPDATE angled_shots
    SET product_image_id = product_asset_id
    WHERE product_image_id IS NULL AND product_asset_id IS NOT NULL;

    ALTER TABLE angled_shots DROP COLUMN IF EXISTS product_asset_id;
  END IF;
END $$;

-- Make product_image_id NOT NULL
ALTER TABLE angled_shots
ALTER COLUMN product_image_id SET NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_angled_shots_product_image_id
ON angled_shots(product_image_id);

CREATE INDEX IF NOT EXISTS idx_angled_shots_gdrive_file_id
ON angled_shots(gdrive_file_id)
WHERE gdrive_file_id IS NOT NULL;

-- Update deletion queue trigger for angled_shots
CREATE OR REPLACE FUNCTION queue_angled_shot_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_category_id UUID;
BEGIN
  SELECT c.user_id, c.id INTO v_user_id, v_category_id
  FROM categories c
  WHERE c.id = OLD.category_id;

  -- Queue for deletion if stored in Google Drive
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      user_id,
      storage_provider,
      storage_path,
      storage_url,
      gdrive_file_id,
      metadata
    ) VALUES (
      'angled_shot',
      OLD.id,
      v_user_id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', v_category_id,
        'product_id', OLD.product_id,
        'angle_name', OLD.angle_name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS angled_shots_deletion_queue ON angled_shots;
CREATE TRIGGER angled_shots_deletion_queue
  BEFORE DELETE ON angled_shots
  FOR EACH ROW
  EXECUTE FUNCTION queue_angled_shot_deletion();

-- ============================================
-- Summary
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Phase 3 migrations applied successfully!';
  RAISE NOTICE '  - backgrounds table created with storage sync';
  RAISE NOTICE '  - composites table created with storage sync';
  RAISE NOTICE '  - angled_shots updated with storage sync fields';
  RAISE NOTICE '';
  RAISE NOTICE 'Folder structure for Phase 3:';
  RAISE NOTICE '  - Backgrounds: {category-slug}/backgrounds/{background-name}.jpg';
  RAISE NOTICE '  - Composites: {category-slug}/composites/{composite-name}.jpg';
END $$;
