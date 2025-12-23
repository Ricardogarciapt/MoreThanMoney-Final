-- =====================================================
-- SISTEMA DE GESTÃO DE DOCUMENTOS
-- =====================================================
-- Para Educadores VIP e Admins compartilharem documentos
-- =====================================================

BEGIN;

-- =====================================================
-- TABELA: DOCUMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT, -- 'pdf', 'doc', 'xls', 'video', 'image', 'link', etc
  category TEXT, -- 'cripto', 'trading', 'estrategia', 'educacao', etc
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uploader_name TEXT, -- Nome do educador que fez upload
  is_archived BOOLEAN DEFAULT FALSE,
  views_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,
  tags TEXT[], -- Array de tags para busca
  is_public BOOLEAN DEFAULT TRUE, -- Se false, apenas VIPs/Admins veem
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar colunas se já existir tabela
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'views_count'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN views_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'downloads_count'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN downloads_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN tags TEXT[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN is_public BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'uploader_name'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN uploader_name TEXT;
  END IF;
END$$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_is_archived ON public.documents(is_archived) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON public.documents USING GIN(tags);

COMMENT ON TABLE public.documents IS 'Documentos compartilhados por Educadores VIP e Admins';

-- =====================================================
-- POLÍTICAS RLS - DOCUMENTS
-- =====================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- MEMBROS podem ver documentos PÚBLICOS não arquivados
DROP POLICY IF EXISTS "Members can view public documents" ON public.documents;
CREATE POLICY "Members can view public documents"
  ON public.documents FOR SELECT
  USING (
    is_public = TRUE 
    AND is_archived = FALSE
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('member', 'vip', 'admin')
      AND profiles.is_active = TRUE
    )
  );

-- VIPs e Admins podem ver TODOS os documentos (públicos + reservados + arquivados)
DROP POLICY IF EXISTS "VIPs and Admins can view all documents" ON public.documents;
CREATE POLICY "VIPs and Admins can view all documents"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('admin', 'vip')
      AND profiles.is_active = TRUE
    )
  );

-- Apenas VIPs e Admins podem criar documentos
DROP POLICY IF EXISTS "VIPs and Admins can create documents" ON public.documents;
CREATE POLICY "VIPs and Admins can create documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('admin', 'vip')
      AND profiles.is_active = TRUE
    )
  );

-- Apenas o criador, VIPs e Admins podem atualizar
DROP POLICY IF EXISTS "Creators VIPs and Admins can update documents" ON public.documents;
CREATE POLICY "Creators VIPs and Admins can update documents"
  ON public.documents FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('admin', 'vip')
      AND profiles.is_active = TRUE
    )
  );

-- Apenas Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete documents" ON public.documents;
CREATE POLICY "Admins can delete documents"
  ON public.documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
      AND profiles.is_active = TRUE
    )
  );

-- =====================================================
-- FUNÇÃO: INCREMENT_DOCUMENT_VIEWS
-- =====================================================

DROP FUNCTION IF EXISTS public.increment_document_views(UUID);

CREATE OR REPLACE FUNCTION public.increment_document_views(document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.documents
  SET 
    views_count = views_count + 1,
    updated_at = NOW()
  WHERE id = document_id;
END;
$$;

COMMENT ON FUNCTION public.increment_document_views IS 'Incrementa contador de visualizações de um documento';

-- =====================================================
-- FUNÇÃO: INCREMENT_DOCUMENT_DOWNLOADS
-- =====================================================

DROP FUNCTION IF EXISTS public.increment_document_downloads(UUID);

CREATE OR REPLACE FUNCTION public.increment_document_downloads(document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.documents
  SET 
    downloads_count = downloads_count + 1,
    updated_at = NOW()
  WHERE id = document_id;
END;
$$;

COMMENT ON FUNCTION public.increment_document_downloads IS 'Incrementa contador de downloads de um documento';

-- =====================================================
-- VIEW: DOCUMENTS_STATS
-- =====================================================

DROP VIEW IF EXISTS public.documents_stats;

CREATE VIEW public.documents_stats AS
SELECT
  (SELECT COUNT(*) FROM public.documents WHERE is_archived = FALSE) AS total_active,
  (SELECT COUNT(*) FROM public.documents WHERE is_archived = TRUE) AS total_archived,
  (SELECT COUNT(DISTINCT uploaded_by) FROM public.documents) AS total_uploaders,
  (SELECT SUM(views_count) FROM public.documents) AS total_views,
  (SELECT SUM(downloads_count) FROM public.documents) AS total_downloads,
  (SELECT COUNT(*) FROM public.documents WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week,
  (SELECT COUNT(*) FROM public.documents WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month;

COMMENT ON VIEW public.documents_stats IS 'Estatísticas do sistema de documentos';

-- =====================================================
-- DADOS EXEMPLO (OPCIONAL)
-- =====================================================

-- Inserir documento exemplo (apenas se não existir nenhum)
DO $$
DECLARE
  admin_id UUID;
  doc_count INTEGER;
BEGIN
  -- Buscar primeiro admin
  SELECT id INTO admin_id
  FROM public.profiles
  WHERE user_type = 'admin'
  AND is_active = TRUE
  LIMIT 1;

  -- Verificar se já existem documentos
  SELECT COUNT(*) INTO doc_count FROM public.documents;

  -- Se não existem documentos e temos um admin, criar exemplo
  IF doc_count = 0 AND admin_id IS NOT NULL THEN
    INSERT INTO public.documents (
      title,
      description,
      file_url,
      file_type,
      category,
      uploaded_by,
      uploader_name,
      tags,
      is_public
    ) VALUES (
      '📚 Guia de Introdução ao Trading',
      'Documento introdutório sobre conceitos básicos de trading e investimentos em criptomoedas. Material de apoio para iniciantes.',
      'https://drive.google.com/file/d/exemplo/view',
      'pdf',
      'educacao',
      admin_id,
      'MoreThanMoney Team',
      ARRAY['trading', 'cripto', 'iniciantes', 'guia'],
      TRUE
    );

    RAISE NOTICE '✅ Documento exemplo criado!';
  ELSE
    RAISE NOTICE '⏭️  Documentos já existem ou admin não encontrado';
  END IF;
END$$;

COMMIT;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✅ SISTEMA DE DOCUMENTOS CRIADO!';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 TABELA CRIADA:';
  RAISE NOTICE '   • documents (com RLS)';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 FUNÇÕES CRIADAS:';
  RAISE NOTICE '   • increment_document_views()';
  RAISE NOTICE '   • increment_document_downloads()';
  RAISE NOTICE '';
  RAISE NOTICE '👁️ VIEW CRIADA:';
  RAISE NOTICE '   • documents_stats';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 PERMISSÕES (RLS):';
  RAISE NOTICE '   • Todos: Ver documentos públicos';
  RAISE NOTICE '   • VIP/Admin: Ver todos + privados';
  RAISE NOTICE '   • VIP/Admin: Criar documentos';
  RAISE NOTICE '   • Criador/VIP/Admin: Editar';
  RAISE NOTICE '   • Apenas Admin: Deletar';
  RAISE NOTICE '';
  RAISE NOTICE '✅ PRONTO PARA USAR!';
  RAISE NOTICE '══════════════════════════════════════════════';
END$$;

-- Mostrar estatísticas
SELECT * FROM public.documents_stats;

