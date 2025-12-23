-- =====================================================
-- SCRIPT: Adicionar Sistema de Menções (@mentions)
-- =====================================================

-- 1. Adicionar coluna mentions na tabela posts
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS mentions UUID[];

-- 2. Adicionar coluna mentions na tabela post_comments
ALTER TABLE post_comments 
ADD COLUMN IF NOT EXISTS mentions UUID[];

-- 3. Criar índice para busca rápida de menções
CREATE INDEX IF NOT EXISTS idx_posts_mentions ON posts USING GIN(mentions);
CREATE INDEX IF NOT EXISTS idx_post_comments_mentions ON post_comments USING GIN(mentions);

-- 4. Função para buscar posts onde o usuário foi mencionado
CREATE OR REPLACE FUNCTION get_user_mentions(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  content TEXT,
  category TEXT,
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  mention_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Posts onde o usuário foi mencionado
  SELECT 
    p.id,
    p.user_id,
    p.user_name,
    p.content,
    p.category,
    p.media_url,
    p.created_at,
    'post'::TEXT as mention_type
  FROM posts p
  WHERE p.mentions @> ARRAY[p_user_id]::UUID[]
  
  UNION ALL
  
  -- Comentários onde o usuário foi mencionado (com info do post)
  SELECT 
    p.id,
    p.user_id,
    p.user_name,
    pc.content as content,
    p.category,
    p.media_url,
    pc.created_at,
    'comment'::TEXT as mention_type
  FROM post_comments pc
  JOIN posts p ON p.id = pc.post_id
  WHERE pc.mentions @> ARRAY[p_user_id]::UUID[]
  
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Comentário na função
COMMENT ON FUNCTION get_user_mentions(UUID) IS 'Retorna todos os posts e comentários onde o usuário foi mencionado';

-- Verificação
SELECT 
  'posts' as tabela,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'posts' AND column_name = 'mentions'

UNION ALL

SELECT 
  'post_comments' as tabela,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'post_comments' AND column_name = 'mentions';

