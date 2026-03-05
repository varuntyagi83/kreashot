-- Migration: Add deletion trigger for collages table
-- Previously missing — collage GDrive files were orphaned on cascade delete

CREATE OR REPLACE FUNCTION queue_collage_deletion()
RETURNS TRIGGER AS $$
BEGIN
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
      'collage',
      OLD.id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.gdrive_file_id,
      OLD.storage_url,
      OLD.user_id,
      jsonb_build_object(
        'category_id', OLD.category_id,
        'name', OLD.name,
        'deleted_at', NOW()
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS collages_deletion_queue ON collages;
CREATE TRIGGER collages_deletion_queue
  AFTER DELETE ON collages
  FOR EACH ROW
  EXECUTE FUNCTION queue_collage_deletion();
