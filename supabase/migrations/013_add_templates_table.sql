-- Migration 013: Add templates table for guideline-based ad templates
-- Phase 5: Templates store placeholder configurations (layers, safe zones)
-- Phase 6 will use these templates to generate actual composites

-- Templates table (category-specific layout definitions)
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL DEFAULT '1:1',  -- Default to 1:1 (Instagram square)
  width INTEGER NOT NULL DEFAULT 1080,  -- 1:1 canvas (1080x1080)
  height INTEGER NOT NULL DEFAULT 1080,

  -- Template definition (layers, positions, safe zones)
  template_data JSONB NOT NULL DEFAULT '{"layers": [], "safe_zones": []}',

  -- Storage sync fields
  storage_provider TEXT NOT NULL DEFAULT 'gdrive',
  storage_path TEXT NOT NULL DEFAULT '',
  storage_url TEXT NOT NULL DEFAULT '',
  gdrive_file_id TEXT,

  slug TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one template per category (Phase 5)
-- Phase 7 will expand to support multiple formats per category
CREATE UNIQUE INDEX idx_templates_category
  ON templates(category_id);

-- Index for queries
CREATE INDEX idx_templates_storage_provider
  ON templates(storage_provider);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION update_templates_updated_at();

-- Deletion queue trigger (storage sync)
CREATE OR REPLACE FUNCTION queue_template_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM categories WHERE id = OLD.category_id;

  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type, resource_id, user_id,
      storage_provider, storage_path, storage_url,
      gdrive_file_id, metadata
    ) VALUES (
      'template', OLD.id, v_user_id,
      OLD.storage_provider, OLD.storage_path, OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', OLD.category_id,
        'name', OLD.name,
        'format', OLD.format,
        'deleted_at', NOW()
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER templates_deletion_queue
  BEFORE DELETE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION queue_template_deletion();

-- RLS policies
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON templates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own templates"
  ON templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own templates"
  ON templates FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own templates"
  ON templates FOR DELETE
  USING (user_id = auth.uid());

-- Add storage sync fields to existing guidelines table
ALTER TABLE guidelines
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'gdrive',
  ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Guidelines updated_at trigger
CREATE OR REPLACE FUNCTION update_guidelines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guidelines_updated_at
  BEFORE UPDATE ON guidelines
  FOR EACH ROW
  EXECUTE FUNCTION update_guidelines_updated_at();

-- Guidelines deletion queue trigger
CREATE OR REPLACE FUNCTION queue_guideline_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type, resource_id, user_id,
      storage_provider, storage_path, storage_url,
      gdrive_file_id, metadata
    ) VALUES (
      'guideline', OLD.id, OLD.user_id,
      OLD.storage_provider, OLD.storage_path, OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', OLD.category_id,
        'name', OLD.name,
        'deleted_at', NOW()
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guidelines_deletion_queue
  BEFORE DELETE ON guidelines
  FOR EACH ROW
  EXECUTE FUNCTION queue_guideline_deletion();
