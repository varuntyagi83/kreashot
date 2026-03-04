-- Create collages table for multi-image collage ad builder
CREATE TABLE IF NOT EXISTS collages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '1:1',
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1080,
  collage_data JSONB NOT NULL DEFAULT '{}',
  -- Generated output (follows storage sync pattern)
  storage_provider TEXT,
  storage_path TEXT,
  storage_url TEXT,
  gdrive_file_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_collages_category_id ON collages(category_id);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_collages_user_id ON collages(user_id);

-- Enable RLS
ALTER TABLE collages ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own collages
CREATE POLICY "Users can view own collages"
  ON collages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own collages"
  ON collages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collages"
  ON collages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collages"
  ON collages FOR DELETE
  USING (auth.uid() = user_id);
