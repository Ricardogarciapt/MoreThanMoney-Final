-- =====================================================
-- SETUP COMPLETO - VERSÃO SIMPLES
-- Execute TODO o script de uma vez (selecionar tudo e Run)
-- =====================================================

-- 1. TABELA: social_posts
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

CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON public.social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON public.social_posts(created_at DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ver posts" ON public.social_posts;
CREATE POLICY "Todos podem ver posts" ON public.social_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuários autenticados criam posts" ON public.social_posts;
CREATE POLICY "Usuários autenticados criam posts" ON public.social_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários editam seus posts" ON public.social_posts;
CREATE POLICY "Usuários editam seus posts" ON public.social_posts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins e autores deletam posts" ON public.social_posts;
CREATE POLICY "Admins e autores deletam posts" ON public.social_posts FOR DELETE
USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin')
);

-- 2. TABELA: social_likes
CREATE TABLE IF NOT EXISTS public.social_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_likes_post_id ON public.social_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_user_id ON public.social_likes(user_id);

ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ver likes" ON public.social_likes;
CREATE POLICY "Todos podem ver likes" ON public.social_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuários autenticados dão like" ON public.social_likes;
CREATE POLICY "Usuários autenticados dão like" ON public.social_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários removem seus likes" ON public.social_likes;
CREATE POLICY "Usuários removem seus likes" ON public.social_likes FOR DELETE USING (auth.uid() = user_id);

-- 3. TABELA: social_comments
CREATE TABLE IF NOT EXISTS public.social_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON public.social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_user_id ON public.social_comments(user_id);

ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ver comentários" ON public.social_comments;
CREATE POLICY "Todos podem ver comentários" ON public.social_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuários autenticados comentam" ON public.social_comments;
CREATE POLICY "Usuários autenticados comentam" ON public.social_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários editam seus comentários" ON public.social_comments;
CREATE POLICY "Usuários editam seus comentários" ON public.social_comments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus comentários" ON public.social_comments;
CREATE POLICY "Usuários deletam seus comentários" ON public.social_comments FOR DELETE USING (auth.uid() = user_id);

-- 4. TABELA: personal_portfolio
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

CREATE INDEX IF NOT EXISTS idx_personal_portfolio_user_id ON public.personal_portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_portfolio_symbol ON public.personal_portfolio(symbol);

ALTER TABLE public.personal_portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seu portfolio" ON public.personal_portfolio;
CREATE POLICY "Usuários veem seu portfolio" ON public.personal_portfolio FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários criam ativos" ON public.personal_portfolio FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam seus ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários atualizam seus ativos" ON public.personal_portfolio FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários deletam seus ativos" ON public.personal_portfolio FOR DELETE USING (auth.uid() = user_id);

-- 5. TABELA: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('dca_opportunity', 'price_alert', 'system', 'portfolio')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem suas notificações" ON public.notifications;
CREATE POLICY "Usuários veem suas notificações" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema cria notificações" ON public.notifications;
CREATE POLICY "Sistema cria notificações" ON public.notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários atualizam suas notificações" ON public.notifications;
CREATE POLICY "Usuários atualizam suas notificações" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam suas notificações" ON public.notifications;
CREATE POLICY "Usuários deletam suas notificações" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- 6. ADICIONAR CAMPO BIO (se não existir)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- 7. FUNÇÕES AUXILIARES
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clean_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notifications WHERE created_at < NOW() - INTERVAL '30 days' AND read = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. TRIGGERS
DROP TRIGGER IF EXISTS trigger_update_likes_count ON public.social_likes;
CREATE TRIGGER trigger_update_likes_count
  AFTER INSERT OR DELETE ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

DROP TRIGGER IF EXISTS trigger_update_comments_count ON public.social_comments;
CREATE TRIGGER trigger_update_comments_count
  AFTER INSERT OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

SELECT 
  '✅ Setup Completo!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('social_posts', 'social_likes', 'social_comments', 'personal_portfolio', 'notifications')) as tabelas_criadas,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('social_posts', 'social_likes', 'social_comments', 'personal_portfolio', 'notifications')) as politicas_rls,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public') as triggers;

