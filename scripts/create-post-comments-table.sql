-- ========================================
-- CRIAR TABELA DE COMENTÁRIOS EM POSTS
-- ========================================

-- Criar tabela de comentários
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC);

-- Habilitar RLS
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Qualquer pessoa pode ver comentários
CREATE POLICY "Anyone can view comments" ON post_comments
  FOR SELECT 
  USING (true);

-- Policy: Utilizadores autenticados podem adicionar comentários
CREATE POLICY "Authenticated users can add comments" ON post_comments
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Utilizador pode editar seu próprio comentário
CREATE POLICY "Users can edit own comments" ON post_comments
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Policy: Utilizador pode apagar seu próprio comentário
CREATE POLICY "Users can delete own comments" ON post_comments
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Policy: Admin pode apagar qualquer comentário
CREATE POLICY "Admins can delete any comment" ON post_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Função para atualizar contador de comentários
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

-- Criar trigger para atualizar contador
DROP TRIGGER IF EXISTS trigger_update_comments_count ON post_comments;
CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_count();

-- Adicionar comentário descritivo
COMMENT ON TABLE post_comments IS 'Comentários nos posts do social feed';
COMMENT ON COLUMN post_comments.post_id IS 'ID do post comentado';
COMMENT ON COLUMN post_comments.user_id IS 'ID do utilizador que comentou';
COMMENT ON COLUMN post_comments.user_name IS 'Nome do utilizador (cache para não fazer join)';

-- ========================================
-- NOTAS
-- ========================================
-- Esta tabela permite que qualquer utilizador autenticado comente em posts
-- O contador de comentários é atualizado automaticamente via trigger
-- Comentários são deletados em cascata quando o post é apagado

