-- =====================================================
-- SETUP SUPABASE STORAGE BUCKET PARA SOCIAL FEED
-- =====================================================
-- Execute este SQL no Supabase SQL Editor

-- 1. Criar bucket 'uploads' (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Políticas de Acesso para o bucket 'uploads'

-- Policy: Todos podem VER uploads (GET)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'uploads' );

-- Policy: Usuários autenticados podem FAZER UPLOAD (POST)
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' AND
  auth.role() = 'authenticated'
);

-- Policy: Usuários podem ATUALIZAR seus próprios uploads
DROP POLICY IF EXISTS "Users can update own uploads" ON storage.objects;
CREATE POLICY "Users can update own uploads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Usuários podem DELETAR seus próprios uploads
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Verificação
SELECT 
  '✅ Bucket criado!' as status,
  id,
  name,
  public,
  created_at
FROM storage.buckets
WHERE id = 'uploads';

SELECT 
  '✅ Políticas criadas!' as status,
  COUNT(*) as total_policies
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';

