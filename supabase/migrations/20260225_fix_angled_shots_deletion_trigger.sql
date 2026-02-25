-- Fix: migration 011 referenced non-existent table "storage_deletion_queue"
-- The actual table created in migration 006 is "deletion_queue"

CREATE OR REPLACE FUNCTION queue_angled_shot_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.storage_provider IN ('gdrive', 's3') AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      file_path,
      storage_provider,
      gdrive_file_id,
      metadata
    ) VALUES (
      OLD.storage_path,
      OLD.storage_provider,
      OLD.gdrive_file_id,
      jsonb_build_object(
        'table', 'angled_shots',
        'record_id', OLD.id,
        'angle_name', OLD.angle_name,
        'deleted_at', now()
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
