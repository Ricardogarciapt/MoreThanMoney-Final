-- ================================================
-- SCRIPT DE VERIFICAÇÃO E CRIAÇÃO DE TABELAS
-- MoreThanMoney - Sistema Completo
-- ================================================

-- 1. VERIFICAR TABELA profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    RAISE NOTICE 'Tabela profiles não existe! Criar manualmente.';
  ELSE
    RAISE NOTICE '✅ Tabela profiles OK';
  END IF;
END $$;

-- 2. VERIFICAR TABELA fcm_tokens (Push Notifications)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fcm_tokens') THEN
    CREATE TABLE public.fcm_tokens (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      device_type TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, token)
    );
    
    CREATE INDEX idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
    CREATE INDEX idx_fcm_tokens_active ON public.fcm_tokens(active);
    
    ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can view own tokens"
      ON public.fcm_tokens FOR SELECT
      USING (auth.uid() = user_id);
    
    CREATE POLICY "Users can insert own tokens"
      ON public.fcm_tokens FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    
    CREATE POLICY "Users can update own tokens"
      ON public.fcm_tokens FOR UPDATE
      USING (auth.uid() = user_id);
      
    RAISE NOTICE '✅ Tabela fcm_tokens CRIADA';
  ELSE
    RAISE NOTICE '✅ Tabela fcm_tokens OK';
  END IF;
END $$;

-- 3. VERIFICAR TABELA notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    CREATE TABLE public.notifications (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data JSONB,
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
    CREATE INDEX idx_notifications_read ON public.notifications(read);
    CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
    
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can view own notifications"
      ON public.notifications FOR SELECT
      USING (auth.uid() = user_id);
    
    CREATE POLICY "Users can update own notifications"
      ON public.notifications FOR UPDATE
      USING (auth.uid() = user_id);
      
    RAISE NOTICE '✅ Tabela notifications CRIADA';
  ELSE
    RAISE NOTICE '✅ Tabela notifications OK';
  END IF;
END $$;

-- 4. VERIFICAR TABELA social_posts (para CRON DCA Post)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'social_posts') THEN
    CREATE TABLE public.social_posts (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT,
      video_url TEXT,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX idx_social_posts_user_id ON public.social_posts(user_id);
    CREATE INDEX idx_social_posts_created_at ON public.social_posts(created_at DESC);
    
    ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Anyone can view posts"
      ON public.social_posts FOR SELECT
      USING (true);
    
    CREATE POLICY "Users can insert own posts"
      ON public.social_posts FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    
    CREATE POLICY "Users can update own posts"
      ON public.social_posts FOR UPDATE
      USING (auth.uid() = user_id);
      
    RAISE NOTICE '✅ Tabela social_posts CRIADA';
  ELSE
    RAISE NOTICE '✅ Tabela social_posts OK';
  END IF;
END $$;

-- 5. CRIAR USER SISTEMA (para posts automáticos)
DO $$
DECLARE
  sistema_user_id UUID;
BEGIN
  SELECT id INTO sistema_user_id FROM public.profiles WHERE email = 'sistema@morethanmoney.pt';
  
  IF sistema_user_id IS NULL THEN
    INSERT INTO public.profiles (
      email,
      full_name,
      username,
      user_type,
      is_active
    ) VALUES (
      'sistema@morethanmoney.pt',
      'Sistema MoreThanMoney',
      'sistema_mtm',
      'admin',
      true
    );
    RAISE NOTICE '✅ User SISTEMA criado';
  ELSE
    RAISE NOTICE '✅ User SISTEMA OK';
  END IF;
END $$;

-- 6. VERIFICAR TABELA admin_crypto_portfolio
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_crypto_portfolio') THEN
    RAISE NOTICE '⚠️ Tabela admin_crypto_portfolio não existe! Executar create-admin-portfolio-tables.sql';
  ELSE
    RAISE NOTICE '✅ Tabela admin_crypto_portfolio OK';
  END IF;
END $$;

-- 7. VERIFICAR TABELA admin_etf_portfolio
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_etf_portfolio') THEN
    RAISE NOTICE '⚠️ Tabela admin_etf_portfolio não existe! Executar create-admin-portfolio-tables.sql';
  ELSE
    RAISE NOTICE '✅ Tabela admin_etf_portfolio OK';
  END IF;
END $$;

-- 8. VERIFICAR SISTEMA DE EMAIL MARKETING
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_sequences') THEN
    RAISE NOTICE '⚠️ Sistema de Email Marketing não configurado! Executar create-email-marketing-system.sql';
  ELSE
    RAISE NOTICE '✅ Sistema de Email Marketing OK';
  END IF;
END $$;

-- ================================================
-- FIM DO SCRIPT DE VERIFICAÇÃO
-- ================================================

SELECT '✅ VERIFICAÇÃO COMPLETA!' AS status;

