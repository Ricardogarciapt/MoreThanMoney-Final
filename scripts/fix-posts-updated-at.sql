-- =====================================================
-- FIX: Adicionar coluna updated_at na tabela posts
-- =====================================================

-- 1. Verificar se a coluna updated_at existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'updated_at'
  ) THEN
    -- Adicionar coluna updated_at
    ALTER TABLE public.posts
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Atualizar registos existentes
    UPDATE public.posts
    SET updated_at = created_at
    WHERE updated_at IS NULL;
    
    RAISE NOTICE '✅ Coluna updated_at ADICIONADA à tabela posts';
  ELSE
    RAISE NOTICE '✅ Coluna updated_at JÁ EXISTE na tabela posts';
  END IF;
END $$;

-- 2. Criar/atualizar trigger para atualizar updated_at automaticamente
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

-- Nota: Trigger criado/atualizado

-- 3. Verificar e garantir que todas as colunas necessárias existem
DO $$
BEGIN
  -- media_urls
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN media_urls TEXT[];
    -- Coluna media_urls adicionada
  END IF;
  
  -- mentions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'mentions'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN mentions UUID[];
    -- Coluna mentions adicionada
  END IF;
  
  -- likes_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'likes_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN likes_count INTEGER DEFAULT 0;
    -- Coluna likes_count adicionada
  END IF;
  
  -- comments_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'comments_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN comments_count INTEGER DEFAULT 0;
    -- Coluna comments_count adicionada
  END IF;
END $$;

-- 4. Verificar e garantir RLS está habilitado
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 5. Verificar e criar/atualizar políticas RLS
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

RAISE NOTICE '✅ Políticas RLS criadas/atualizadas';

-- 6. Verificação final - mostrar estrutura da tabela
SELECT 
  '✅ Verificação de colunas concluída!' as status,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'posts'
ORDER BY ordinal_position;

-- 7. Verificar políticas RLS ativas
SELECT
  '✅ Políticas RLS ativas:' as status,
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'posts'
ORDER BY policyname;

