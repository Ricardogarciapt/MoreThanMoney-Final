-- ========================================
-- FIX COMPLETO: POSTS, LIKES E COMENTÁRIOS
-- ========================================

-- 1. Verificar/criar tabela posts_comments
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criar índices
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC);

-- 3. Habilitar RLS
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- 4. Verificar/criar RLS Policies
DROP POLICY IF EXISTS "Anyone can view comments" ON post_comments;
CREATE POLICY "Anyone can view comments" ON post_comments
  FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can add comments" ON post_comments;
CREATE POLICY "Authenticated users can add comments" ON post_comments
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can edit own comments" ON post_comments;
CREATE POLICY "Users can edit own comments" ON post_comments
  FOR UPDATE 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON post_comments;
CREATE POLICY "Users can delete own comments" ON post_comments
  FOR DELETE 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can delete any comment" ON post_comments;
CREATE POLICY "Admins can delete any comment" ON post_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- 5. Verificar/criar trigger para contador
CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts 
    SET comments_count = COALESCE(comments_count, 0) + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts 
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_comments_count ON post_comments;
CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_count();

-- 6. Verificar/criar tabela post_likes
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 7. Criar índices para post_likes
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

-- 8. Habilitar RLS em post_likes
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- 9. Verificar/criar RLS Policies para post_likes
DROP POLICY IF EXISTS "Anyone can view likes" ON post_likes;
CREATE POLICY "Anyone can view likes" ON post_likes
  FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can add likes" ON post_likes;
CREATE POLICY "Authenticated users can add likes" ON post_likes
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own likes" ON post_likes;
CREATE POLICY "Users can delete own likes" ON post_likes
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 10. Verificar/criar trigger para contador de likes
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts 
    SET likes_count = COALESCE(likes_count, 0) + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts 
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_likes_count ON post_likes;
CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW
EXECUTE FUNCTION update_likes_count();

-- 11. Adicionar colunas de contador se não existirem
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- 12. Sincronizar contadores existentes
UPDATE posts SET likes_count = (
  SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id
) WHERE EXISTS (SELECT 1 FROM post_likes WHERE post_id = posts.id);

UPDATE posts SET comments_count = (
  SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id
) WHERE EXISTS (SELECT 1 FROM post_comments WHERE post_id = posts.id);

-- ========================================
-- RESUMO
-- ========================================
-- ✅ Tabela post_comments criada/verificada
-- ✅ Tabela post_likes criada/verificada
-- ✅ RLS Policies configuradas
-- ✅ Triggers para contadores automáticos
-- ✅ Contadores sincronizados

