-- Brand Guidelines Library: user-level reusable brand guidelines (extracted from PDFs)
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS brand_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_file_name TEXT,
  extracted_text TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one default per user
CREATE UNIQUE INDEX IF NOT EXISTS brand_guidelines_user_default
  ON brand_guidelines(user_id)
  WHERE is_default = true;

-- No duplicate names per user
ALTER TABLE brand_guidelines
  ADD CONSTRAINT brand_guidelines_user_name_unique UNIQUE(user_id, name);

-- RLS
ALTER TABLE brand_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_guidelines_select" ON brand_guidelines
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "brand_guidelines_insert" ON brand_guidelines
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "brand_guidelines_update" ON brand_guidelines
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "brand_guidelines_delete" ON brand_guidelines
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_guidelines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_guidelines_updated_at
  BEFORE UPDATE ON brand_guidelines
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_guidelines_updated_at();
