-- =====================================================
-- FIX: Adicionar coluna media_urls na tabela posts
-- =====================================================
-- ERRO: could not find media urls column of posts in the schema cache
-- CAUSA: Tabela posts não tem coluna media_urls para suportar múltiplas mídias

-- 1. Verificar estrutura atual
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'posts'
ORDER BY ordinal_position;

-- 2. Adicionar coluna media_urls (array de texto) se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE public.posts 
    ADD COLUMN media_urls TEXT[];
    
    -- Migrar dados de media_url para media_urls se houver dados
    UPDATE public.posts
    SET media_urls = ARRAY[media_url]
    WHERE media_url IS NOT NULL AND media_urls IS NULL;
    
    RAISE NOTICE '✅ Coluna media_urls ADICIONADA e dados migrados';
  ELSE
    RAISE NOTICE '✅ Coluna media_urls JÁ EXISTE';
  END IF;
END $$;

-- 3. Adicionar coluna mentions (array de UUID) se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'mentions'
  ) THEN
    ALTER TABLE public.posts 
    ADD COLUMN mentions UUID[];
    
    RAISE NOTICE '✅ Coluna mentions ADICIONADA';
  ELSE
    RAISE NOTICE '✅ Coluna mentions JÁ EXISTE';
  END IF;
END $$;

-- 4. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_posts_media_urls ON public.posts USING GIN(media_urls) WHERE media_urls IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_mentions ON public.posts USING GIN(mentions) WHERE mentions IS NOT NULL;

-- 5. Verificação final
SELECT 
  '✅ Colunas adicionadas!' as status,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'posts'
AND column_name IN ('media_url', 'media_urls', 'mentions')
ORDER BY column_name;




