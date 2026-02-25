-- Brand Voices Library: user-level named brand voice profiles
-- Date: 2026-02-25

CREATE TABLE brand_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one default per user
CREATE UNIQUE INDEX brand_voices_user_default ON brand_voices(user_id) WHERE is_default = true;

-- No duplicate names per user
ALTER TABLE brand_voices ADD CONSTRAINT brand_voices_user_name_unique UNIQUE(user_id, name);

-- RLS
ALTER TABLE brand_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brand voices"
  ON brand_voices FOR ALL
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_voices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_voices_updated_at
  BEFORE UPDATE ON brand_voices
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_voices_updated_at();
