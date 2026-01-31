-- =====================================================
-- SCRIPT: Verificar e Corrigir Tabelas de Posts Sociais
-- =====================================================
-- Este script verifica se as tabelas estão corretas e se as publicações existentes estão a ser carregadas

-- 1. VERIFICAR SE A TABELA POSTS EXISTE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'posts'
  ) THEN
    RAISE NOTICE '⚠️ Tabela posts NÃO EXISTE! Criando...';
    
    -- Criar tabela posts
    CREATE TABLE IF NOT EXISTS public.posts (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      media_urls TEXT[],
      mentions UUID[],
      category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social')),
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    RAISE NOTICE '✅ Tabela posts criada!';
  ELSE
    RAISE NOTICE '✅ Tabela posts existe!';
  END IF;
END $$;

-- 2. VERIFICAR E ADICIONAR COLUNAS FALTANTES
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
    RAISE NOTICE '✅ Coluna media_urls adicionada!';
  END IF;
  
  -- mentions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'mentions'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN mentions UUID[];
    RAISE NOTICE '✅ Coluna mentions adicionada!';
  END IF;
  
  -- likes_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'likes_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN likes_count INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Coluna likes_count adicionada!';
  END IF;
  
  -- comments_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'comments_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN comments_count INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Coluna comments_count adicionada!';
  END IF;
END $$;

-- 3. MIGRAR DADOS DE media_url PARA media_urls (se necessário)
UPDATE public.posts
SET media_urls = ARRAY[media_url]
WHERE media_url IS NOT NULL 
  AND (media_urls IS NULL OR array_length(media_urls, 1) IS NULL);

-- 4. VERIFICAR TABELA POST_LIKES
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'post_likes'
  ) THEN
    RAISE NOTICE '⚠️ Tabela post_likes NÃO EXISTE! Criando...';
    
    CREATE TABLE IF NOT EXISTS public.post_likes (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes(user_id);
    
    RAISE NOTICE '✅ Tabela post_likes criada!';
  ELSE
    RAISE NOTICE '✅ Tabela post_likes existe!';
  END IF;
END $$;

-- 5. VERIFICAR TABELA POST_COMMENTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'post_comments'
  ) THEN
    RAISE NOTICE '⚠️ Tabela post_comments NÃO EXISTE! Criando...';
    
    CREATE TABLE IF NOT EXISTS public.post_comments (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      mentions UUID[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON public.post_comments(user_id);
    
    RAISE NOTICE '✅ Tabela post_comments criada!';
  ELSE
    RAISE NOTICE '✅ Tabela post_comments existe!';
  END IF;
END $$;

-- 6. GARANTIR RLS ESTÁ HABILITADO E POLÍTICAS CORRETAS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Políticas para posts
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

-- Políticas para likes
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

-- Políticas para comentários
DROP POLICY IF EXISTS "Todos podem ver comentários" ON public.post_comments;
CREATE POLICY "Todos podem ver comentários" ON public.post_comments
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados criam comentários" ON public.post_comments;
CREATE POLICY "Usuários autenticados criam comentários" ON public.post_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários editam seus comentários" ON public.post_comments;
CREATE POLICY "Usuários editam seus comentários" ON public.post_comments
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus comentários" ON public.post_comments;
CREATE POLICY "Usuários deletam seus comentários" ON public.post_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- 7. SINCRONIZAR CONTADORES (likes_count e comments_count)
UPDATE public.posts p
SET 
  likes_count = COALESCE((
    SELECT COUNT(*) 
    FROM public.post_likes pl 
    WHERE pl.post_id = p.id
  ), 0),
  comments_count = COALESCE((
    SELECT COUNT(*) 
    FROM public.post_comments pc 
    WHERE pc.post_id = p.id
  ), 0);

-- 8. CRIAR/ATUALIZAR TRIGGERS PARA CONTADORES AUTOMÁTICOS
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts 
    SET likes_count = COALESCE(likes_count, 0) + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts 
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_likes_count ON public.post_likes;
CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION update_likes_count();

CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts 
    SET comments_count = COALESCE(comments_count, 0) + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts 
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_comments_count ON public.post_comments;
CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_count();

-- 9. VERIFICAÇÃO FINAL - CONTAR POSTS EXISTENTES
SELECT 
  '📊 RESUMO DAS TABELAS SOCIAIS' as titulo,
  (SELECT COUNT(*) FROM public.posts) as total_posts,
  (SELECT COUNT(*) FROM public.post_likes) as total_likes,
  (SELECT COUNT(*) FROM public.post_comments) as total_comments,
  (SELECT COUNT(*) FROM public.posts WHERE media_url IS NOT NULL OR media_urls IS NOT NULL) as posts_com_media;

-- 10. LISTAR ÚLTIMOS 10 POSTS (para verificar se estão a ser carregados)
SELECT 
  '📝 ÚLTIMOS POSTS' as titulo,
  id,
  user_name,
  LEFT(content, 50) as preview,
  category,
  created_at,
  likes_count,
  comments_count,
  CASE 
    WHEN media_url IS NOT NULL THEN 'Sim (media_url)'
    WHEN media_urls IS NOT NULL AND array_length(media_urls, 1) > 0 THEN 'Sim (media_urls)'
    ELSE 'Não'
  END as tem_media
FROM public.posts
ORDER BY created_at DESC
LIMIT 10;




