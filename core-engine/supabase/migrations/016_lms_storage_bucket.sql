-- Bucket público para imagens LMS (avatar do educador, thumbnail da sala/stream).
-- Upload na app usa SUPABASE_SERVICE_ROLE_KEY (contorna RLS). Esta política permite
-- leitura pública das URLs devolvidas por getPublicUrl.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lms-assets',
  'lms-assets',
  true,
  5242880, -- 5 MB (alinhado com app/api/admin/live-sessions/upload-image)
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lms_assets_public_read" on storage.objects;
create policy "lms_assets_public_read"
on storage.objects
for select
to public
using (bucket_id = 'lms-assets');
