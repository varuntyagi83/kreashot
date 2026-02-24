-- ============================================
-- Migration: Align schema with implementation
-- Issue: Schema defined product_assets but implementation uses product_images
-- Date: February 21, 2026
-- ============================================

-- Drop product_assets table if exists (from initial schema)
DROP TABLE IF EXISTS product_assets CASCADE;

-- Create product_images table (matches current implementation)
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Storage path: {user_id}/{product_id}/{timestamp}.{ext}
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update angled_shots table to reference product_images correctly
ALTER TABLE angled_shots
  DROP COLUMN IF EXISTS product_asset_id,
  ADD COLUMN IF NOT EXISTS product_image_id UUID REFERENCES product_images(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_angled_shots_product_image ON angled_shots(product_image_id);

-- Enable RLS
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_images
-- Users can only access images for products in their categories
DROP POLICY IF EXISTS "product_images_select" ON product_images;
DROP POLICY IF EXISTS "product_images_insert" ON product_images;
DROP POLICY IF EXISTS "product_images_update" ON product_images;
DROP POLICY IF EXISTS "product_images_delete" ON product_images;

CREATE POLICY "product_images_select" ON product_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = product_images.product_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_insert" ON product_images
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = product_images.product_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_update" ON product_images
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = product_images.product_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_delete" ON product_images
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = product_images.product_id
      AND c.user_id = auth.uid()
    )
  );

-- Update storage bucket name from 'assets' to 'product-images'
-- Note: This is declarative - the bucket should already exist from implementation
-- If not, it needs to be created via Supabase dashboard or previous migration

-- Ensure product-images bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', false)
ON CONFLICT (id) DO NOTHING;

-- Update storage policies for product-images bucket
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "product-images_select" ON storage.objects;
  DROP POLICY IF EXISTS "product-images_insert" ON storage.objects;
  DROP POLICY IF EXISTS "product-images_update" ON storage.objects;
  DROP POLICY IF EXISTS "product-images_delete" ON storage.objects;

  -- Create policies for product-images bucket
  CREATE POLICY "product-images_select" ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

  CREATE POLICY "product-images_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

  CREATE POLICY "product-images_update" ON storage.objects FOR UPDATE
    USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

  CREATE POLICY "product-images_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
END $$;
