/*
# Photofram AR hand-off

When a customer opens "View in AR" on a computer, the site uploads the
finished 3D frame model (a .glb with the rendered design as its texture; never
the original photos) so the phone that scans the QR code can open it.

- photofram-ar bucket: public read (the /ar page and Scene Viewer fetch the
  model by URL), 4 MB limit, glTF binary only.
- Anyone (anon) may upload, but only new files named ar/<uuid>.glb; there is
  no anon read-list, update or delete.
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
