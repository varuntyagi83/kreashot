-- ============================================
-- Migration: Configure Storage Bucket Limits
-- Purpose: Set file size limits and MIME type restrictions
-- Date: February 21, 2026
-- ============================================

-- Configure user upload buckets (product images, brand assets)
-- Allow larger files (100MB) and more formats
UPDATE storage.buckets
SET
  file_size_limit = 104857600,  -- 100 MB in bytes
  allowed_mime_types = '{image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml}'
WHERE id IN ('product-images', 'brand-assets');

-- Configure AI-generated image buckets
-- Smaller limit (50MB) as AI images are usually compressed
UPDATE storage.buckets
SET
  file_size_limit = 52428800,  -- 50 MB in bytes
  allowed_mime_types = '{image/jpeg,image/jpg,image/png,image/webp}'
WHERE id IN ('angled-shots', 'backgrounds', 'angled-product-background', 'final-assets');

-- Configure document buckets (guidelines, copy)
UPDATE storage.buckets
SET
  file_size_limit = 10485760,  -- 10 MB in bytes
  allowed_mime_types = '{application/pdf,image/jpeg,image/png}'
WHERE id = 'guidelines';

-- Note: These limits can be increased if needed:
-- - Maximum file size in Supabase: 5 GB per file
-- - For larger files, consider Google Drive integration (see docs/GOOGLE_DRIVE_INTEGRATION.md)

-- Verification query
SELECT
  id,
  name,
  CASE
    WHEN file_size_limit IS NULL THEN 'No limit (default 50MB)'
    ELSE (file_size_limit / 1048576)::text || ' MB'
  END as size_limit,
  allowed_mime_types
FROM storage.buckets
ORDER BY name;
