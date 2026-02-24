-- Fix: product_images trigger needs to get user_id from related product
-- product_images -> products -> categories -> user_id

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_queue_product_image_deletion ON product_images;

-- Update the trigger function to get user_id from the product's category
CREATE OR REPLACE FUNCTION queue_product_image_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_category_id UUID;
BEGIN
  -- Get user_id from product -> category
  SELECT c.user_id, c.id INTO v_user_id, v_category_id
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.id = OLD.product_id;

  -- Only queue if file is in Google Drive and we found a user_id
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL AND v_user_id IS NOT NULL THEN
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
      OLD.storage_path,
      OLD.gdrive_file_id,
      OLD.storage_url,
      v_user_id,
      jsonb_build_object(
        'product_id', OLD.product_id,
        'category_id', v_category_id,
        'file_name', OLD.file_name,
        'deleted_at', NOW()
      )
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER trigger_queue_product_image_deletion
  AFTER DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION queue_product_image_deletion();
