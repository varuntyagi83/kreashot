-- Migration: Remove unused Supabase Storage buckets
-- All storage has been migrated to Google Drive, so these buckets are no longer needed

-- Drop storage policies first (they reference the buckets)
DO $$
DECLARE
  bucket TEXT;
  policy_name TEXT;
BEGIN
  FOR bucket IN SELECT unnest(ARRAY[
    'brand-assets', 'assets', 'angled-shots', 'backgrounds',
    'angled-product-background', 'copy-doc', 'guidelines', 'final-assets'
  ])
  LOOP
    -- Drop all policies for this bucket
    FOR policy_name IN SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE bucket || '%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', policy_name);
    END LOOP;
  END LOOP;
END $$;

-- Delete all buckets
-- Note: This will fail if buckets contain files. You should empty them first via Supabase Dashboard.
DELETE FROM storage.buckets WHERE id IN (
  'brand-assets',
  'assets',
  'angled-shots',
  'backgrounds',
  'angled-product-background',
  'copy-doc',
  'guidelines',
  'final-assets'
);

-- Verify buckets were deleted
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM storage.buckets WHERE id IN (
    'brand-assets', 'assets', 'angled-shots', 'backgrounds',
    'angled-product-background', 'copy-doc', 'guidelines', 'final-assets'
  );

  IF remaining_count > 0 THEN
    RAISE NOTICE '⚠️  % bucket(s) still exist. They may contain files. Empty them via Supabase Dashboard first.', remaining_count;
  ELSE
    RAISE NOTICE '✅ All unused Supabase Storage buckets successfully removed';
  END IF;
END $$;
