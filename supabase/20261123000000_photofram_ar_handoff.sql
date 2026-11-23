/*
# Photofram AR hand-off

When a customer opens "View in AR" on a computer, the site uploads the
finished 3D frame model (a .glb with the rendered design as its texture; never
the original photos) so the phone that scans the QR code can open it.

- photofram-ar bucket: public read by URL (the /ar page and Scene Viewer fetch
  the model), 4 MB limit, glTF binary only.
- Anyone (anon) may upload, but only new files named ar/<uuid>.glb.
- Previews expire after 7 days. Only expired files can be listed or deleted,
  by anyone, so a daily job (netlify/functions/ar-cleanup.mjs) and every new
  upload can remove them through the Storage API without a secret key, while
  fresh links stay unlistable and undeletable.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photofram-ar', 'photofram-ar', true, 4194304, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "photofram_ar_insert" ON storage.objects;
CREATE POLICY "photofram_ar_insert" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'photofram-ar'
    AND (storage.foldername(name))[1] = 'ar'
    AND lower(storage.extension(name)) = 'glb'
  );

DROP POLICY IF EXISTS "photofram_ar_select_expired" ON storage.objects;
CREATE POLICY "photofram_ar_select_expired" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'photofram-ar' AND created_at < now() - interval '7 days');

DROP POLICY IF EXISTS "photofram_ar_delete_expired" ON storage.objects;
CREATE POLICY "photofram_ar_delete_expired" ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'photofram-ar' AND created_at < now() - interval '7 days');
