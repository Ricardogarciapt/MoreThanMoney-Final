-- Script para criar sistema de tracking de visualizações dos destaques
-- Permite rastrear quais categorias de posts o usuário já visualizou

-- Tabela para rastrear visualizações de categorias por usuário
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_story_views_user_id ON public.story_views(user_id);
CREATE INDEX IF NOT EXISTS idx_story_views_category ON public.story_views(category_id);
CREATE INDEX IF NOT EXISTS idx_story_views_user_category ON public.story_views(user_id, category_id);

-- Habilitar RLS
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Política: Usuários só podem ver suas próprias visualizações
DROP POLICY IF EXISTS "Users can view own story views" ON public.story_views;
CREATE POLICY "Users can view own story views"
  ON public.story_views
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuários podem inserir suas próprias visualizações
DROP POLICY IF EXISTS "Users can insert own story views" ON public.story_views;
CREATE POLICY "Users can insert own story views"
  ON public.story_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar suas próprias visualizações
DROP POLICY IF EXISTS "Users can update own story views" ON public.story_views;
CREATE POLICY "Users can update own story views"
  ON public.story_views
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comentários para documentação
COMMENT ON TABLE public.story_views IS 'Rastreia quais categorias de posts o usuário já visualizou nos destaques';
COMMENT ON COLUMN public.story_views.category_id IS 'ID da categoria (updates, forex, crypto, etc)';
COMMENT ON COLUMN public.story_views.viewed_at IS 'Timestamp da primeira visualização da categoria';

