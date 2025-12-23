-- =====================================================
-- SCRIPT: Corrigir Trigger de Contador de Comentários
-- =====================================================

-- Verificar se a tabela post_comments existe
DO $$
BEGIN
  -- Criar função de trigger se não existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_post_comments_count_posts'
  ) THEN
    CREATE OR REPLACE FUNCTION update_post_comments_count_posts()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE public.posts
        SET comments_count = COALESCE(comments_count, 0) + 1
        WHERE id = NEW.post_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts
        SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1)
        WHERE id = OLD.post_id;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    RAISE NOTICE '✅ Função update_post_comments_count_posts criada';
  ELSE
    RAISE NOTICE 'ℹ️ Função update_post_comments_count_posts já existe';
  END IF;
END $$;

-- Criar ou substituir trigger
DROP TRIGGER IF EXISTS trigger_update_comments_count_posts ON public.post_comments;
CREATE TRIGGER trigger_update_comments_count_posts
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count_posts();

-- Verificar se o trigger foi criado
SELECT 
  '✅ Trigger criado com sucesso!' as status,
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname = 'trigger_update_comments_count_posts';

-- Atualizar contadores existentes (caso estejam desatualizados)
DO $$
BEGIN
  UPDATE public.posts p
  SET comments_count = (
    SELECT COUNT(*) 
    FROM public.post_comments pc 
    WHERE pc.post_id = p.id
  )
  WHERE EXISTS (
    SELECT 1 FROM public.post_comments pc WHERE pc.post_id = p.id
  );
  
  RAISE NOTICE '✅ Contadores de comentários atualizados';
END $$;

