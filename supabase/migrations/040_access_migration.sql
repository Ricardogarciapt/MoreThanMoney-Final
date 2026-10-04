-- 040_access_migration.sql — migração packs + comprovativos IQONIC

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'access-proofs',
  'access-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "access_proofs_insert_own" ON storage.objects;
CREATE POLICY "access_proofs_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'access-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "access_proofs_select_own" ON storage.objects;
CREATE POLICY "access_proofs_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'access-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins via service role (API routes)

CREATE INDEX IF NOT EXISTS idx_profiles_iqonic_pending
ON profiles ((profile_data->>'access_validation_status'))
WHERE (profile_data->>'access_validation_status') = 'pending';
