-- Keep angled shots when product image is deleted (do not cascade delete).
-- User intent: deleting a source product image should not remove generated angled shots
-- (they are standalone assets and may be used in composites/final assets).
-- Change: product_image_id FK from ON DELETE CASCADE to ON DELETE SET NULL;
-- angled shots remain, with product_image_id set to NULL (source no longer linked).

-- 1. Drop existing FK (name may vary)
DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint
  WHERE conrelid = 'angled_shots'::regclass
    AND confrelid = 'product_images'::regclass
    AND contype = 'f';
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE angled_shots DROP CONSTRAINT %I', _con);
  END IF;
END $$;

-- 2. Allow NULL so ON DELETE SET NULL can apply
ALTER TABLE angled_shots
  ALTER COLUMN product_image_id DROP NOT NULL;

-- 3. Re-add FK with SET NULL (angled shots stay when product image is deleted)
ALTER TABLE angled_shots
  ADD CONSTRAINT angled_shots_product_image_id_fkey
  FOREIGN KEY (product_image_id)
  REFERENCES product_images(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN angled_shots.product_image_id IS 'Source product image; NULL if source was deleted (angled shot asset is kept).';
