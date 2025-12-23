-- =====================================================
-- FIX: Adicionar colunas de mídia na tabela social_posts
-- =====================================================

-- ERRO: column social_posts.image_url does not exist
-- CAUSA: Tabela foi criada com nomes diferentes

-- 1. Verificar estrutura atual
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'social_posts'
ORDER BY ordinal_position;

-- 2. Adicionar colunas se não existirem
ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 3. Se a tabela tem media_url mas não image_url/video_url, migrar dados
-- (safe - não faz nada se colunas não existirem)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_posts' 
    AND column_name = 'media_url'
  ) THEN
    -- Migrar media_url para image_url ou video_url baseado no tipo
    UPDATE public.social_posts
    SET 
      image_url = CASE WHEN media_type = 'image' THEN media_url END,
      video_url = CASE WHEN media_type = 'video' THEN media_url END
    WHERE media_url IS NOT NULL;
    
    RAISE NOTICE '✅ Dados migrados de media_url para image_url/video_url';
  END IF;
END $$;

-- 4. Remover coluna antiga se existir (opcional)
-- ALTER TABLE public.social_posts DROP COLUMN IF EXISTS media_url;
-- ALTER TABLE public.social_posts DROP COLUMN IF EXISTS media_type;

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_social_posts_image_url ON public.social_posts(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_video_url ON public.social_posts(video_url) WHERE video_url IS NOT NULL;

-- 6. Verificação final
SELECT 
  '✅ Colunas adicionadas!' as status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'social_posts' AND column_name = 'image_url') as has_image_url,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'social_posts' AND column_name = 'video_url') as has_video_url;

-- 7. Ver estrutura final
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'social_posts'
ORDER BY ordinal_position;

