-- =====================================================
-- FIX COMPLETO: POSTS + STORAGE BUCKET
-- Execute este script SE o diagnóstico mostrar problemas
-- =====================================================

-- 1. CRIAR TABELA POSTS OU ADICIONAR COLUNAS FALTANTES
DO $$
BEGIN
  -- Criar tabela se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'posts'
  ) THEN
    CREATE TABLE public.posts (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE '✅ Tabela posts CRIADA';
  ELSE
    -- Tabela existe - adicionar colunas faltantes
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'user_id'
    ) THEN
      -- Adicionar coluna sem NOT NULL primeiro
      ALTER TABLE public.posts ADD COLUMN user_id UUID;
      
      -- Se não houver dados, tornar NOT NULL. Se houver, deixar nullable temporariamente
      IF (SELECT COUNT(*) FROM public.posts) = 0 THEN
        ALTER TABLE public.posts ALTER COLUMN user_id SET NOT NULL;
      END IF;
      
      -- Adicionar foreign key
      ALTER TABLE public.posts ADD CONSTRAINT posts_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      RAISE NOTICE '✅ Coluna user_id ADICIONADA';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'user_name'
    ) THEN
      ALTER TABLE public.posts ADD COLUMN user_name TEXT;
      UPDATE public.posts SET user_name = 'Utilizador' WHERE user_name IS NULL;
      
      -- Tornar NOT NULL apenas se todos os valores foram preenchidos
      IF NOT EXISTS (SELECT 1 FROM public.posts WHERE user_name IS NULL) THEN
        ALTER TABLE public.posts ALTER COLUMN user_name SET NOT NULL;
      END IF;
      
      RAISE NOTICE '✅ Coluna user_name ADICIONADA';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'category'
    ) THEN
      ALTER TABLE public.posts ADD COLUMN category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social'));
      RAISE NOTICE '✅ Coluna category ADICIONADA';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'media_url'
    ) THEN
      ALTER TABLE public.posts ADD COLUMN media_url TEXT;
      RAISE NOTICE '✅ Coluna media_url ADICIONADA';
    END IF;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON public.posts;
CREATE TRIGGER trigger_update_posts_updated_at
    BEFORE UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_updated_at();

-- 2. CRIAR TABELA post_likes (se não existir)
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes(user_id);

-- 3. HABILITAR RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR POLÍTICAS RLS PARA POSTS
DROP POLICY IF EXISTS "Todos podem ver posts" ON public.posts;
CREATE POLICY "Todos podem ver posts" ON public.posts
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados criam posts" ON public.posts;
CREATE POLICY "Usuários autenticados criam posts" ON public.posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários editam seus posts" ON public.posts;
CREATE POLICY "Usuários editam seus posts" ON public.posts
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins e autores deletam posts" ON public.posts;
CREATE POLICY "Admins e autores deletam posts" ON public.posts
  FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin'
    )
  );

-- 5. CRIAR POLÍTICAS RLS PARA POST_LIKES
DROP POLICY IF EXISTS "Todos podem ver likes" ON public.post_likes;
CREATE POLICY "Todos podem ver likes" ON public.post_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados criam likes" ON public.post_likes;
CREATE POLICY "Usuários autenticados criam likes" ON public.post_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus likes" ON public.post_likes;
CREATE POLICY "Usuários deletam seus likes" ON public.post_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 6. CRIAR BUCKET 'uploads' (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

-- 7. CRIAR POLÍTICAS DE STORAGE
-- Policy: Todos podem VER uploads
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'uploads' );

-- Policy: Usuários autenticados podem FAZER UPLOAD
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
  auth.role() = 'authenticated'
);

-- Policy: Usuários podem DELETAR seus próprios uploads
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads' AND
  auth.role() = 'authenticated'
);

-- 8. VERIFICAÇÃO FINAL
SELECT 
  '✅ SETUP COMPLETO!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') as posts_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'post_likes') as post_likes_table_exists,
  (SELECT COUNT(*) FROM storage.buckets WHERE id = 'uploads') as uploads_bucket_exists,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts') as posts_policies_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND (policyname LIKE '%upload%' OR policyname LIKE '%public%')) as storage_policies_count;

