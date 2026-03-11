-- Re-create brand-assets bucket for font storage (Supabase).
-- Fonts are stored here so the browser can load them via @font-face without CORS issues.
-- Other brand assets (logos, etc.) remain on Google Drive.
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to manage their own files (path: {user_id}/...)
DROP POLICY IF EXISTS "brand-assets_select" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_update" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_delete" ON storage.objects;
CREATE POLICY "brand-assets_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');
CREATE POLICY "brand-assets_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "brand-assets_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "brand-assets_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
