-- =====================================================
-- SCRIPT DE SETUP APP MOBILE (SEGURO)
-- Verifica existência antes de criar
-- =====================================================

-- =====================================================
-- 1. TABELA: social_posts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_posts_user_id') THEN
    CREATE INDEX idx_social_posts_user_id ON public.social_posts(user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_posts_created_at') THEN
    CREATE INDEX idx_social_posts_created_at ON public.social_posts(created_at DESC);
  END IF;
END $$;

-- RLS
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Todos podem ver posts" ON public.social_posts;
  CREATE POLICY "Todos podem ver posts"
    ON public.social_posts FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Usuários autenticados criam posts" ON public.social_posts;
  CREATE POLICY "Usuários autenticados criam posts"
    ON public.social_posts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários editam seus posts" ON public.social_posts;
  CREATE POLICY "Usuários editam seus posts"
    ON public.social_posts FOR UPDATE
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Admins e autores deletam posts" ON public.social_posts;
  CREATE POLICY "Admins e autores deletam posts"
    ON public.social_posts FOR DELETE
    USING (
      auth.uid() = user_id OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.user_type = 'admin'
      )
    );
END $$;

-- =====================================================
-- 2. TABELA: social_likes
-- =====================================================

CREATE TABLE IF NOT EXISTS public.social_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Índices
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_likes_post_id') THEN
    CREATE INDEX idx_social_likes_post_id ON public.social_likes(post_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_likes_user_id') THEN
    CREATE INDEX idx_social_likes_user_id ON public.social_likes(user_id);
  END IF;
END $$;

-- RLS
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Todos podem ver likes" ON public.social_likes;
  CREATE POLICY "Todos podem ver likes"
    ON public.social_likes FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Usuários autenticados dão like" ON public.social_likes;
  CREATE POLICY "Usuários autenticados dão like"
    ON public.social_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários removem seus likes" ON public.social_likes;
  CREATE POLICY "Usuários removem seus likes"
    ON public.social_likes FOR DELETE
    USING (auth.uid() = user_id);
END $$;

-- =====================================================
-- 3. TABELA: social_comments
-- =====================================================

CREATE TABLE IF NOT EXISTS public.social_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_comments_post_id') THEN
    CREATE INDEX idx_social_comments_post_id ON public.social_comments(post_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_comments_user_id') THEN
    CREATE INDEX idx_social_comments_user_id ON public.social_comments(user_id);
  END IF;
END $$;

-- RLS
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Todos podem ver comentários" ON public.social_comments;
  CREATE POLICY "Todos podem ver comentários"
    ON public.social_comments FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Usuários autenticados comentam" ON public.social_comments;
  CREATE POLICY "Usuários autenticados comentam"
    ON public.social_comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários editam seus comentários" ON public.social_comments;
  CREATE POLICY "Usuários editam seus comentários"
    ON public.social_comments FOR UPDATE
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários deletam seus comentários" ON public.social_comments;
  CREATE POLICY "Usuários deletam seus comentários"
    ON public.social_comments FOR DELETE
    USING (auth.uid() = user_id);
END $$;

-- =====================================================
-- 4. TABELA: personal_portfolio
-- =====================================================

CREATE TABLE IF NOT EXISTS public.personal_portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('crypto', 'etf', 'stock', 'forex', 'commodity')),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  purchase_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_personal_portfolio_user_id') THEN
    CREATE INDEX idx_personal_portfolio_user_id ON public.personal_portfolio(user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_personal_portfolio_symbol') THEN
    CREATE INDEX idx_personal_portfolio_symbol ON public.personal_portfolio(symbol);
  END IF;
END $$;

-- RLS
ALTER TABLE public.personal_portfolio ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Usuários veem seu portfolio" ON public.personal_portfolio;
  CREATE POLICY "Usuários veem seu portfolio"
    ON public.personal_portfolio FOR SELECT
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários criam ativos" ON public.personal_portfolio;
  CREATE POLICY "Usuários criam ativos"
    ON public.personal_portfolio FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários atualizam seus ativos" ON public.personal_portfolio;
  CREATE POLICY "Usuários atualizam seus ativos"
    ON public.personal_portfolio FOR UPDATE
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Usuários deletam seus ativos" ON public.personal_portfolio;
  CREATE POLICY "Usuários deletam seus ativos"
    ON public.personal_portfolio FOR DELETE
    USING (auth.uid() = user_id);
END $$;

-- =====================================================
-- 5. FUNÇÕES AUXILIARES
-- =====================================================

-- Atualizar contador de likes
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar contador de comentários
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. TRIGGERS
-- =====================================================

-- Trigger para likes
DROP TRIGGER IF EXISTS trigger_update_likes_count ON public.social_likes;
CREATE TRIGGER trigger_update_likes_count
  AFTER INSERT OR DELETE ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Trigger para comentários
DROP TRIGGER IF EXISTS trigger_update_comments_count ON public.social_comments;
CREATE TRIGGER trigger_update_comments_count
  AFTER INSERT OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

-- =====================================================
-- 7. ADICIONAR CAMPO BIO À TABELA PROFILES (se não existir)
-- =====================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN bio TEXT;
    RAISE NOTICE '✅ Campo "bio" adicionado à tabela profiles';
  ELSE
    RAISE NOTICE 'ℹ️ Campo "bio" já existe na tabela profiles';
  END IF;
END $$;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

DO $$ 
DECLARE
  tables_count INTEGER;
  policies_count INTEGER;
  triggers_count INTEGER;
BEGIN
  -- Contar tabelas criadas
  SELECT COUNT(*) INTO tables_count
  FROM information_schema.tables
  WHERE table_schema = 'public' 
  AND table_name IN ('social_posts', 'social_likes', 'social_comments', 'personal_portfolio');
  
  -- Contar políticas
  SELECT COUNT(*) INTO policies_count
  FROM pg_policies
  WHERE schemaname = 'public' 
  AND tablename IN ('social_posts', 'social_likes', 'social_comments', 'personal_portfolio');
  
  -- Contar triggers
  SELECT COUNT(*) INTO triggers_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public';
  
  RAISE NOTICE '✅ Setup App Mobile Concluído!';
  RAISE NOTICE '   - Tabelas criadas: % de 4', tables_count;
  RAISE NOTICE '   - Políticas RLS: % políticas', policies_count;
  RAISE NOTICE '   - Triggers: % triggers', triggers_count;
  RAISE NOTICE '';
  RAISE NOTICE '📱 Tabelas disponíveis:';
  RAISE NOTICE '   - social_posts (posts do feed social)';
  RAISE NOTICE '   - social_likes (likes dos posts)';
  RAISE NOTICE '   - social_comments (comentários)';
  RAISE NOTICE '   - personal_portfolio (portfolio pessoal)';
END $$;

