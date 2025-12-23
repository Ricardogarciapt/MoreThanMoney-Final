-- =====================================================
-- DIAGNÓSTICO: TABELA POSTS E STORAGE
-- Execute este script para verificar o estado atual
-- =====================================================

-- 1. VERIFICAR SE TABELA 'posts' EXISTE
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts')
    THEN '✅ Tabela posts EXISTE'
    ELSE '❌ Tabela posts NÃO EXISTE - EXECUTAR: scripts/create-posts-table-with-categories.sql'
  END as status_posts;

-- 2. VERIFICAR COLUNAS DA TABELA 'posts' (se existir)
SELECT 
  '📋 Colunas da tabela posts:' as info,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'posts'
ORDER BY ordinal_position;

-- 3. VERIFICAR RLS NA TABELA 'posts'
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'posts'
      AND rowsecurity = true
    )
    THEN '✅ RLS está HABILITADO'
    ELSE '⚠️ RLS NÃO está habilitado'
  END as status_rls;

-- 4. VERIFICAR POLÍTICAS RLS
SELECT 
  '🔐 Políticas RLS:' as info,
  policyname,
  cmd as operation,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'posts'
ORDER BY policyname;

-- 5. VERIFICAR SE TABELA 'post_likes' EXISTE
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'post_likes')
    THEN '✅ Tabela post_likes EXISTE'
    ELSE '❌ Tabela post_likes NÃO EXISTE'
  END as status_post_likes;

-- 6. VERIFICAR BUCKET 'uploads' NO STORAGE
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads')
    THEN '✅ Bucket uploads EXISTE'
    ELSE '❌ Bucket uploads NÃO EXISTE - CRIAR via Dashboard ou script'
  END as status_bucket;

-- 7. VERIFICAR SE BUCKET É PÚBLICO
SELECT 
  id,
  name,
  public,
  CASE 
    WHEN public = true THEN '✅ Bucket é PÚBLICO'
    ELSE '❌ Bucket NÃO é público - CONFIGURAR'
  END as status_public
FROM storage.buckets
WHERE id = 'uploads';

-- 8. VERIFICAR POLÍTICAS DO STORAGE
SELECT 
  '🔐 Políticas Storage:' as info,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%upload%' OR policyname LIKE '%public%'
ORDER BY policyname;

-- 9. VERIFICAR ÍNDICES
SELECT 
  '📊 Índices na tabela posts:' as info,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'posts';

-- 10. CONTAR POSTS EXISTENTES
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts')
    THEN (SELECT COUNT(*) FROM public.posts)::text || ' posts encontrados'
    ELSE 'N/A - Tabela não existe'
  END as total_posts;

-- =====================================================
-- RESUMO DE AÇÕES NECESSÁRIAS
-- =====================================================
SELECT 
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts')
    THEN '🔴 AÇÃO URGENTE: Executar scripts/create-posts-table-with-categories.sql'
    WHEN NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads')
    THEN '🔴 AÇÃO URGENTE: Criar bucket uploads no Storage'
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads' AND public = false)
    THEN '🟡 AÇÃO: Tornar bucket uploads público'
    ELSE '✅ Tudo OK!'
  END as acao_necessaria;

