-- Migration 010: Add composites table with storage sync
-- Phase 3: Product × Background Composites

-- Create composites table
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
  storage_provider TEXT NOT NULL DEFAULT 'gdrive', -- 'gdrive' or 'supabase'
  storage_path TEXT NOT NULL, -- Path in storage system
  storage_url TEXT NOT NULL, -- Public URL (Google Drive thumbnail API)
  gdrive_file_id TEXT, -- Google Drive file ID for fast deletion

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(category_id, slug),
  UNIQUE(angled_shot_id, background_id) -- Prevent duplicate composites
);

-- Create indexes for faster queries
CREATE INDEX idx_composites_category_id ON composites(category_id);
CREATE INDEX idx_composites_product_id ON composites(product_id);
CREATE INDEX idx_composites_angled_shot_id ON composites(angled_shot_id);
CREATE INDEX idx_composites_background_id ON composites(background_id);
CREATE INDEX idx_composites_user_id ON composites(user_id);
CREATE INDEX idx_composites_storage_provider ON composites(storage_provider);

-- Enable RLS
ALTER TABLE composites ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access composites in their own categories
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

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_composites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER composites_updated_at
  BEFORE UPDATE ON composites
  FOR EACH ROW
  EXECUTE FUNCTION update_composites_updated_at();

-- Deletion queue trigger (for storage sync)
CREATE OR REPLACE FUNCTION queue_composite_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_category_id UUID;
BEGIN
  -- Get user_id and category_id via JOIN
  SELECT c.user_id, c.id INTO v_user_id, v_category_id
  FROM categories c
  WHERE c.id = OLD.category_id;

  -- Only queue if file exists in Google Drive
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

CREATE TRIGGER composites_deletion_queue
  BEFORE DELETE ON composites
  FOR EACH ROW
  EXECUTE FUNCTION queue_composite_deletion();

-- Grant permissions
GRANT ALL ON composites TO authenticated;
GRANT ALL ON composites TO service_role;
