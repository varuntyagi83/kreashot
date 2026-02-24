-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-assets', 'brand-assets', false),
  ('assets', 'assets', false),
  ('angled-shots', 'angled-shots', false),
  ('backgrounds', 'backgrounds', false),
  ('angled-product-background', 'angled-product-background', false),
  ('copy-doc', 'copy-doc', false),
  ('guidelines', 'guidelines', false),
  ('final-assets', 'final-assets', false);

-- Storage policies: Users can manage their own files
-- Pattern: {user_id}/{category_id}/{filename} for per-category buckets
-- Pattern: {user_id}/{filename} for global buckets (brand-assets)

DO $$
DECLARE
  bucket TEXT;
BEGIN
  FOR bucket IN SELECT unnest(ARRAY[
    'brand-assets', 'assets', 'angled-shots', 'backgrounds',
    'angled-product-background', 'copy-doc', 'guidelines', 'final-assets'
  ])
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_select" ON storage.objects FOR SELECT
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_insert" ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_update" ON storage.objects FOR UPDATE
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_delete" ON storage.objects FOR DELETE
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
    ', bucket, bucket, bucket, bucket, bucket, bucket, bucket, bucket);
  END LOOP;
END $$;
