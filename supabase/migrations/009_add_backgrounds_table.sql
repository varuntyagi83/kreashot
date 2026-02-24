-- Migration 009: Add backgrounds table with storage sync
-- Phase 3: Background Generation

-- Create backgrounds table
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
  storage_provider TEXT NOT NULL DEFAULT 'gdrive', -- 'gdrive' or 'supabase'
  storage_path TEXT NOT NULL, -- Path in storage system
  storage_url TEXT NOT NULL, -- Public URL (Google Drive thumbnail API)
  gdrive_file_id TEXT, -- Google Drive file ID for fast deletion

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(category_id, slug)
);

-- Create index for faster queries
CREATE INDEX idx_backgrounds_category_id ON backgrounds(category_id);
CREATE INDEX idx_backgrounds_user_id ON backgrounds(user_id);
CREATE INDEX idx_backgrounds_storage_provider ON backgrounds(storage_provider);

-- Enable RLS
ALTER TABLE backgrounds ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access backgrounds in their own categories
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

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_backgrounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backgrounds_updated_at
  BEFORE UPDATE ON backgrounds
  FOR EACH ROW
  EXECUTE FUNCTION update_backgrounds_updated_at();

-- Deletion queue trigger (for storage sync)
CREATE OR REPLACE FUNCTION queue_background_deletion()
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

CREATE TRIGGER backgrounds_deletion_queue
  BEFORE DELETE ON backgrounds
  FOR EACH ROW
  EXECUTE FUNCTION queue_background_deletion();

-- Grant permissions
GRANT ALL ON backgrounds TO authenticated;
GRANT ALL ON backgrounds TO service_role;
