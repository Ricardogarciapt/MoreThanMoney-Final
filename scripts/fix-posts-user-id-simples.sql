-- =====================================================
-- FIX SIMPLES: ADICIONAR COLUNA user_id NA TABELA posts
-- Versão simplificada e segura
-- =====================================================

-- 1. CRIAR TABELA SE NÃO EXISTIR
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT,
  content TEXT NOT NULL,
  media_url TEXT,
  category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADICIONAR COLUNA user_id SE NÃO EXISTIR
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN user_id UUID;
    RAISE NOTICE '✅ Coluna user_id adicionada';
  END IF;
END $$;

-- 3. ADICIONAR COLUNA user_name SE NÃO EXISTIR
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'user_name'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN user_name TEXT;
    UPDATE public.posts SET user_name = 'Utilizador' WHERE user_name IS NULL;
    RAISE NOTICE '✅ Coluna user_name adicionada';
  END IF;
END $$;

-- 4. ADICIONAR COLUNA category SE NÃO EXISTIR
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN category TEXT;
    RAISE NOTICE '✅ Coluna category adicionada';
  END IF;
END $$;

-- 5. ADICIONAR COLUNA media_url SE NÃO EXISTIR
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'posts' 
      AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN media_url TEXT;
    RAISE NOTICE '✅ Coluna media_url adicionada';
  END IF;
END $$;

-- 6. ADICIONAR FOREIGN KEY SE NÃO EXISTIR
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
      AND table_name = 'posts' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
  ) THEN
    ALTER TABLE public.posts 
    ADD CONSTRAINT posts_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;
    RAISE NOTICE '✅ Foreign key user_id criada';
  END IF;
END $$;

-- 7. CRIAR ÍNDICES
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);

-- 8. HABILITAR RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 9. CRIAR POLÍTICAS RLS
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

-- 10. VERIFICAÇÃO FINAL
SELECT 
  '✅ SETUP COMPLETO!' as status,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'posts'
ORDER BY ordinal_position;

