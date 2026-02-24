-- Migration 012: Add storage sync to copy_docs table
-- Phase 4: Marketing Copy Generation with OpenAI
-- Date: February 21, 2026

-- Add storage sync fields to existing copy_docs table
ALTER TABLE copy_docs
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'gdrive',
ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS storage_url TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT,
ADD COLUMN IF NOT EXISTS prompt_used TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add check constraint for valid storage providers
ALTER TABLE copy_docs
DROP CONSTRAINT IF EXISTS copy_docs_provider_check;

ALTER TABLE copy_docs
ADD CONSTRAINT copy_docs_provider_check
CHECK (storage_provider IN ('supabase', 'gdrive', 's3', 'local'));

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_copy_docs_storage_provider ON copy_docs(storage_provider);
CREATE INDEX IF NOT EXISTS idx_copy_docs_gdrive_id ON copy_docs(gdrive_file_id) WHERE gdrive_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copy_docs_category_id ON copy_docs(category_id);
CREATE INDEX IF NOT EXISTS idx_copy_docs_copy_type ON copy_docs(copy_type);
CREATE INDEX IF NOT EXISTS idx_copy_docs_user_id ON copy_docs(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_copy_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS copy_docs_updated_at ON copy_docs;
CREATE TRIGGER copy_docs_updated_at
  BEFORE UPDATE ON copy_docs
  FOR EACH ROW
  EXECUTE FUNCTION update_copy_docs_updated_at();

-- Deletion queue trigger (auto-queue deletions for Google Drive cleanup)
CREATE OR REPLACE FUNCTION queue_copy_doc_deletion()
RETURNS TRIGGER AS $$
BEGIN
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
      'copy_doc',
      OLD.id,
      OLD.user_id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.storage_url,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'category_id', OLD.category_id,
        'copy_type', OLD.copy_type,
        'language', OLD.language,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS copy_docs_deletion_queue ON copy_docs;
CREATE TRIGGER copy_docs_deletion_queue
  BEFORE DELETE ON copy_docs
  FOR EACH ROW
  EXECUTE FUNCTION queue_copy_doc_deletion();

-- Grant permissions
GRANT ALL ON copy_docs TO authenticated;
GRANT ALL ON copy_docs TO service_role;

-- Comments for documentation
COMMENT ON COLUMN copy_docs.storage_provider IS 'Storage backend: gdrive, supabase, s3, or local';
COMMENT ON COLUMN copy_docs.storage_path IS 'File path in storage system (e.g., category-slug/copy-docs/hook/name_timestamp.json)';
COMMENT ON COLUMN copy_docs.storage_url IS 'Public URL for accessing the file (Google Drive thumbnail URL)';
COMMENT ON COLUMN copy_docs.gdrive_file_id IS 'Google Drive file ID for fast deletion and updates';
COMMENT ON COLUMN copy_docs.prompt_used IS 'The AI prompt used to generate this copy for reproducibility';
