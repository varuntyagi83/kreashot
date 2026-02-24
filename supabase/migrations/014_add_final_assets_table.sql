-- Final Assets Table (Phase 6: Compositing Engine)
-- Stores generated ad creatives combining template, background, product, copy, and logo

CREATE TABLE final_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source components
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  composite_id UUID REFERENCES composites(id) ON DELETE SET NULL,
  copy_doc_id UUID REFERENCES copy_docs(id) ON DELETE SET NULL,

  -- Asset metadata
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL DEFAULT '1:1',  -- 1:1, 16:9, 9:16
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1080,

  -- Composition details
  composition_data JSONB NOT NULL DEFAULT '{}',
  -- Example structure:
  -- {
  --   "layers": [
  --     {"type": "background", "source_id": "composite-123", "position": {"x": 0, "y": 0}},
  --     {"type": "product", "source_id": "product-456", "position": {"x": 100, "y": 200}},
  --     {"type": "text", "content": "Amazing Product!", "position": {"x": 50, "y": 50}, "style": {...}},
  --     {"type": "logo", "source_id": "logo-789", "position": {"x": 900, "y": 50}}
  --   ],
  --   "safe_zones_validated": true
  -- }

  -- Storage sync fields
  storage_provider TEXT NOT NULL DEFAULT 'gdrive',
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  gdrive_file_id TEXT,

  -- Metadata
  slug TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_final_assets_category ON final_assets(category_id);
CREATE INDEX idx_final_assets_user ON final_assets(user_id);
CREATE INDEX idx_final_assets_template ON final_assets(template_id);
CREATE INDEX idx_final_assets_storage_provider ON final_assets(storage_provider);
CREATE INDEX idx_final_assets_created_at ON final_assets(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_final_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER final_assets_updated_at
  BEFORE UPDATE ON final_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_final_assets_updated_at();

-- Deletion queue trigger (storage sync)
CREATE OR REPLACE FUNCTION queue_final_asset_deletion()
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
      'final_asset', OLD.id, v_user_id,
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

CREATE TRIGGER final_assets_deletion_queue
  BEFORE DELETE ON final_assets
  FOR EACH ROW
  EXECUTE FUNCTION queue_final_asset_deletion();

-- RLS policies
ALTER TABLE final_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own final assets"
  ON final_assets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own final assets"
  ON final_assets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own final assets"
  ON final_assets FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own final assets"
  ON final_assets FOR DELETE
  USING (user_id = auth.uid());
