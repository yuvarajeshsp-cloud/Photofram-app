/*
# Photofram website content

Applied to the shared Shop Manager Supabase project. The website's /admin
page signs in with a normal Shop Manager account (Administrator or Manager).
Nothing in the Shop Manager app uses these tables.

- photofram_settings: one row per organization; `data` holds brand name,
  logo, colors, WhatsApp number, links, address, shipping rules.
- photofram_templates: frame templates; `data` holds the template definition
  (photo slots, text slots, sizes, frame finishes, prices, preview image).
- photofram_items: reviews and FAQs. `kind` says which list an item belongs
  to, `position` its order, `hidden` keeps it off the site without deleting.
- photofram-media storage bucket: logos, template artwork and previews,
  stored under "<organization_id>/...". Public read; only an Administrator
  or Manager of that organization can upload or delete.
- public_photofram_content(org_slug): what the website reads when it builds.
  Returns visible items only. The tables themselves stay closed to anon.
*/

CREATE TABLE IF NOT EXISTS photofram_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS photofram_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  position int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS photofram_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('review', 'faq')),
  position int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_photofram_templates_org ON photofram_templates(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_photofram_items_org_kind ON photofram_items(organization_id, kind, position);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON photofram_settings;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON photofram_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();
DROP TRIGGER IF EXISTS trg_stamp_organization_id ON photofram_templates;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON photofram_templates
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();
DROP TRIGGER IF EXISTS trg_stamp_organization_id ON photofram_items;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON photofram_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

ALTER TABLE photofram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE photofram_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE photofram_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photofram_settings_select" ON photofram_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "photofram_settings_insert" ON photofram_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "photofram_settings_update" ON photofram_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "photofram_templates_select" ON photofram_templates FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "photofram_templates_insert" ON photofram_templates FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "photofram_templates_update" ON photofram_templates FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "photofram_templates_delete" ON photofram_templates FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "photofram_items_select" ON photofram_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "photofram_items_insert" ON photofram_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "photofram_items_update" ON photofram_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "photofram_items_delete" ON photofram_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

-- ============================================================
-- STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photofram-media', 'photofram-media', true, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "photofram_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photofram-media' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "photofram_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photofram-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());
CREATE POLICY "photofram_media_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'photofram-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());
CREATE POLICY "photofram_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photofram-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());

-- ============================================================
-- PUBLIC READ (website build)
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_photofram_content(org_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH org AS (SELECT id FROM organizations WHERE slug = org_slug)
  SELECT jsonb_build_object(
    'found', EXISTS (SELECT 1 FROM org),
    'settings', COALESCE((SELECT s.data FROM photofram_settings s WHERE s.organization_id = (SELECT id FROM org)), '{}'::jsonb),
    'templates', COALESCE((SELECT jsonb_agg(t.data || jsonb_build_object('slug', t.slug) ORDER BY t.position, t.created_at) FROM photofram_templates t
                           WHERE t.organization_id = (SELECT id FROM org) AND NOT t.hidden), '[]'::jsonb),
    'reviews', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM photofram_items i
                         WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'review' AND NOT i.hidden), '[]'::jsonb),
    'faqs', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM photofram_items i
                      WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'faq' AND NOT i.hidden), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_photofram_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_photofram_content(text) TO anon, authenticated;
