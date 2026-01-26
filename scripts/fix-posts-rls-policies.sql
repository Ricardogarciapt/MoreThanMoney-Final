-- =====================================================
-- SCRIPT: Corrigir Políticas RLS da Tabela Posts
-- =====================================================
-- Este script garante que as políticas RLS estão corretas
-- para permitir que todos vejam posts e usuários autenticados criem posts

-- 1. VERIFICAR SE A TABELA EXISTE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'posts'
  ) THEN
    RAISE EXCEPTION 'Tabela posts não existe. Execute primeiro: scripts/create-posts-table-with-categories.sql';
  END IF;
END $$;

-- 2. GARANTIR QUE RLS ESTÁ HABILITADO
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 3. REMOVER TODAS AS POLÍTICAS EXISTENTES (para recriar corretamente)
DROP POLICY IF EXISTS "Todos podem ver posts" ON public.posts;
DROP POLICY IF EXISTS "Usuários autenticados criam posts" ON public.posts;
DROP POLICY IF EXISTS "Usuários editam seus posts" ON public.posts;
DROP POLICY IF EXISTS "Admins e autores deletam posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Users can edit own posts" ON public.posts;
DROP POLICY IF EXISTS "Admins and authors can delete posts" ON public.posts;

-- 4. CRIAR POLÍTICAS CORRETAS

-- Política: TODOS podem ver posts (mesmo sem autenticação)
CREATE POLICY "Todos podem ver posts" ON public.posts
  FOR SELECT
  USING (true);

-- Política: Usuários autenticados podem criar posts
CREATE POLICY "Usuários autenticados criam posts" ON public.posts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    auth.uid() = user_id
  );

-- Política: Usuários podem editar seus próprios posts
CREATE POLICY "Usuários editam seus posts" ON public.posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários e admins podem deletar posts
CREATE POLICY "Admins e autores deletam posts" ON public.posts
  FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.user_type = 'admin'
    )
  );

-- 5. VERIFICAR POLÍTICAS CRIADAS
SELECT 
  '✅ Políticas RLS criadas!' as status,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'posts'
ORDER BY policyname;

-- 6. TESTAR ACESSO (deve retornar posts mesmo sem autenticação)
SELECT 
  '📊 Teste de acesso:' as info,
  COUNT(*) as total_posts,
  COUNT(CASE WHEN media_url IS NOT NULL OR media_urls IS NOT NULL THEN 1 END) as posts_com_media
FROM public.posts;

-- 7. VERIFICAR SE HÁ POSTS E SE ESTÃO ACESSÍVEIS
SELECT 
  '📝 Últimos 5 posts (verificação de acesso):' as info,
  id,
  user_name,
  LEFT(content, 30) as preview,
  category,
  created_at
FROM public.posts
ORDER BY created_at DESC
LIMIT 5;

