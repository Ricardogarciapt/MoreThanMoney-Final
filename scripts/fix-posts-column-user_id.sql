-- =====================================================
-- FIX: COLUNA user_id NÃO EXISTE NA TABELA posts
-- Este script adiciona a coluna se não existir
-- =====================================================

-- 1. VERIFICAR SE TABELA EXISTE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'posts'
  ) THEN
    -- Criar tabela do zero se não existir
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
    RAISE NOTICE '✅ Tabela posts JÁ EXISTE';
  END IF;
END $$;

-- 2. VERIFICAR E ADICIONAR COLUNA user_id (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'user_id'
  ) THEN
    -- Adicionar coluna user_id
    ALTER TABLE public.posts 
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- Se houver dados, precisamos preencher (assumindo que não há posts antigos)
    -- Como é uma nova tabela, provavelmente está vazia
    
    -- Tornar NOT NULL depois (se necessário)
    ALTER TABLE public.posts 
    ALTER COLUMN user_id SET NOT NULL;
    
    RAISE NOTICE '✅ Coluna user_id ADICIONADA';
  ELSE
    RAISE NOTICE '✅ Coluna user_id JÁ EXISTE';
  END IF;
END $$;

-- 3. VERIFICAR E ADICIONAR COLUNA user_name (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'user_name'
  ) THEN
    ALTER TABLE public.posts 
    ADD COLUMN user_name TEXT;
    
    -- Preencher com valor padrão se houver posts
    UPDATE public.posts 
    SET user_name = 'Utilizador' 
    WHERE user_name IS NULL;
    
    ALTER TABLE public.posts 
    ALTER COLUMN user_name SET NOT NULL;
    
    RAISE NOTICE '✅ Coluna user_name ADICIONADA';
  ELSE
    RAISE NOTICE '✅ Coluna user_name JÁ EXISTE';
  END IF;
END $$;

-- 4. VERIFICAR E ADICIONAR COLUNA category (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE public.posts 
    ADD COLUMN category TEXT CHECK (category IN ('updates', 'forex', 'crypto', 'mindset', 'lideranca', 'network', 'social'));
    
    RAISE NOTICE '✅ Coluna category ADICIONADA';
  ELSE
    RAISE NOTICE '✅ Coluna category JÁ EXISTE';
  END IF;
END $$;

-- 5. VERIFICAR E ADICIONAR COLUNA media_url (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.posts 
    ADD COLUMN media_url TEXT;
    
    RAISE NOTICE '✅ Coluna media_url ADICIONADA';
  ELSE
    RAISE NOTICE '✅ Coluna media_url JÁ EXISTE';
  END IF;
END $$;

-- 6. CRIAR ÍNDICES (se não existirem)
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);

-- 7. VERIFICAR FOREIGN KEY
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'posts' 
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    -- Adicionar foreign key
    ALTER TABLE public.posts 
    ADD CONSTRAINT posts_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Foreign key user_id CRIADA';
  ELSE
    RAISE NOTICE '✅ Foreign key user_id JÁ EXISTE';
  END IF;
END $$;

-- 8. HABILITAR RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 9. CRIAR/ATUALIZAR POLÍTICAS RLS
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

-- 10. VERIFICAÇÃO FINAL - MOSTRAR SCHEMA
SELECT 
  '📋 SCHEMA FINAL DA TABELA posts:' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'posts'
ORDER BY ordinal_position;

-- 11. RESULTADO
SELECT 
  '✅ FIX COMPLETO!' as status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'user_id') as user_id_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'user_name') as user_name_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'category') as category_exists,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts') as policies_count;

