-- Fix: queue_angled_shot_deletion() (from 20260225) used wrong deletion_queue columns.
-- Table has storage_path (not file_path) and requires resource_type, resource_id, user_id.
-- This caused trigger to fail on INSERT when angled_shots were cascade-deleted (e.g. product image delete).
-- Restore correct INSERT so cascade deletes queue GDrive files for cleanup.

CREATE OR REPLACE FUNCTION queue_angled_shot_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.storage_provider IN ('gdrive', 's3') AND OLD.gdrive_file_id IS NOT NULL THEN
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
        'table', 'angled_shots',
        'angle_name', OLD.angle_name,
        'category_id', OLD.category_id,
        'product_id', OLD.product_id,
        'deleted_at', NOW()
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
