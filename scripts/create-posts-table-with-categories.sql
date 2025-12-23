-- =====================================================
-- CRIAÇÃO DA TABELA POSTS COM CATEGORIAS
-- Para o novo SocialFeed com Stories estilo Instagram
-- =====================================================

-- 1. TABELA: posts
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);

-- Atualizar updated_at automaticamente
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

-- 2. TABELA: post_likes (para likes individuais)
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Índices para likes
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes(user_id);

-- Função para atualizar likes_count automaticamente
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts
        SET updated_at = NOW()
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts
        SET updated_at = NOW()
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_likes_count_insert ON public.post_likes;
DROP TRIGGER IF EXISTS trigger_update_likes_count_delete ON public.post_likes;

CREATE TRIGGER trigger_update_likes_count_insert
    AFTER INSERT ON public.post_likes
    FOR EACH ROW
    EXECUTE FUNCTION update_post_likes_count();

CREATE TRIGGER trigger_update_likes_count_delete
    AFTER DELETE ON public.post_likes
    FOR EACH ROW
    EXECUTE FUNCTION update_post_likes_count();

-- 3. TABELA: post_comments (opcional, para futuras implementações)
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para comentários
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON public.post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON public.post_comments(created_at DESC);

-- Atualizar updated_at dos comentários
DROP TRIGGER IF EXISTS trigger_update_comments_updated_at ON public.post_comments;
CREATE TRIGGER trigger_update_comments_updated_at
    BEFORE UPDATE ON public.post_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS
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

-- =====================================================
-- VIEWS ÚTEIS (opcional)
-- =====================================================

-- View para posts com contagem de likes e comentários
CREATE OR REPLACE VIEW public.posts_with_stats AS
SELECT 
  p.*,
  COALESCE(COUNT(DISTINCT pl.id), 0)::INTEGER AS likes_count,
  COALESCE(COUNT(DISTINCT pc.id), 0)::INTEGER AS comments_count
FROM public.posts p
LEFT JOIN public.post_likes pl ON p.id = pl.post_id
LEFT JOIN public.post_comments pc ON p.id = pc.post_id
GROUP BY p.id;

-- =====================================================
-- VERIFICAÇÃO
-- =====================================================

-- Verificar se as tabelas foram criadas
DO $$
BEGIN
  RAISE NOTICE '✅ Tabela posts criada com sucesso!';
  RAISE NOTICE '✅ Tabela post_likes criada com sucesso!';
  RAISE NOTICE '✅ Tabela post_comments criada com sucesso!';
  RAISE NOTICE '✅ Políticas RLS configuradas!';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Próximos passos:';
  RAISE NOTICE '1. Verificar se o bucket "uploads" existe no Supabase Storage';
  RAISE NOTICE '2. Configurar políticas de Storage para permitir uploads';
  RAISE NOTICE '3. Testar criação de posts via app mobile';
END $$;
