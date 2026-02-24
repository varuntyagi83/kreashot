-- Migration: Add deletion queue for syncing Google Drive deletions
-- When angled_shots records are deleted, queue Google Drive file deletion

-- Create deletion queue table
CREATE TABLE IF NOT EXISTS deletion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL, -- 'angled_shot', 'product_image', etc.
  resource_id UUID, -- Optional: original resource ID
  storage_provider TEXT NOT NULL, -- 'gdrive', 'supabase', 's3'
  storage_path TEXT, -- File path (fallback)
  gdrive_file_id TEXT, -- Google Drive file ID (preferred for faster deletion)
  storage_url TEXT, -- Public URL (for reference)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_deletion_queue_status ON deletion_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deletion_queue_user_id ON deletion_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_queue_resource ON deletion_queue(resource_type, resource_id);

-- Enable RLS
ALTER TABLE deletion_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own deletion queue"
  ON deletion_queue
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their own deletion queue"
  ON deletion_queue
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to queue deletion when angled_shot is deleted
CREATE OR REPLACE FUNCTION queue_angled_shot_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if file is in Google Drive
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      storage_provider,
      storage_path,
      gdrive_file_id,
      storage_url,
      user_id,
      metadata
    ) VALUES (
      'angled_shot',
      OLD.id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.gdrive_file_id,
      OLD.storage_url,
      OLD.user_id,
      jsonb_build_object(
        'category_id', OLD.category_id,
        'product_id', OLD.product_id,
        'angle_name', OLD.angle_name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Queue Google Drive deletion when angled_shot record is deleted
DROP TRIGGER IF EXISTS trigger_queue_angled_shot_deletion ON angled_shots;
CREATE TRIGGER trigger_queue_angled_shot_deletion
  AFTER DELETE ON angled_shots
  FOR EACH ROW
  EXECUTE FUNCTION queue_angled_shot_deletion();

-- Function to queue deletion when product_image is deleted
CREATE OR REPLACE FUNCTION queue_product_image_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if file is in Google Drive
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      storage_provider,
      storage_path,
      gdrive_file_id,
      storage_url,
      user_id,
      metadata
    ) VALUES (
      'product_image',
      OLD.id,
      OLD.storage_provider,
      OLD.file_path,
      OLD.gdrive_file_id,
      OLD.storage_url,
      OLD.user_id,
      jsonb_build_object(
        'product_id', OLD.product_id,
        'file_name', OLD.file_name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Queue Google Drive deletion when product_image record is deleted
DROP TRIGGER IF EXISTS trigger_queue_product_image_deletion ON product_images;
CREATE TRIGGER trigger_queue_product_image_deletion
  AFTER DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION queue_product_image_deletion();

-- Comment
COMMENT ON TABLE deletion_queue IS 'Queue for processing Google Drive file deletions asynchronously';
COMMENT ON COLUMN deletion_queue.resource_type IS 'Type of resource being deleted (angled_shot, product_image, etc.)';
COMMENT ON COLUMN deletion_queue.gdrive_file_id IS 'Google Drive file ID - preferred for fast deletion';
COMMENT ON COLUMN deletion_queue.status IS 'Processing status: pending, processing, completed, failed';
COMMENT ON COLUMN deletion_queue.retry_count IS 'Number of times this deletion has been attempted';
