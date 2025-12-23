-- =====================================================
-- FIX: Estrutura da tabela notifications
-- Adiciona colunas faltantes e corrige estrutura
-- =====================================================

-- 1. Adicionar coluna 'data' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'data'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN data JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✅ Coluna "data" adicionada';
  ELSE
    RAISE NOTICE 'ℹ️ Coluna "data" já existe';
  END IF;
END $$;

-- 2. Verificar e adicionar outras colunas se necessário
DO $$ 
BEGIN
  -- Coluna 'type'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'system';
    RAISE NOTICE '✅ Coluna "type" adicionada';
  END IF;
  
  -- Coluna 'title'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'title'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN title TEXT NOT NULL DEFAULT 'Notificação';
    RAISE NOTICE '✅ Coluna "title" adicionada';
  END IF;
  
  -- Coluna 'message'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'message'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN message TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Coluna "message" adicionada';
  END IF;
  
  -- Coluna 'read'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN read BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Coluna "read" adicionada';
  END IF;
  
  -- Coluna 'user_id'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE '✅ Coluna "user_id" adicionada';
  END IF;
END $$;

-- 3. Adicionar constraint de CHECK para 'type' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'notifications' 
    AND constraint_name = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('dca_opportunity', 'price_alert', 'system', 'portfolio'));
    RAISE NOTICE '✅ Constraint de tipo adicionada';
  ELSE
    RAISE NOTICE 'ℹ️ Constraint de tipo já existe';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'ℹ️ Constraint de tipo já existe';
END $$;

-- 4. Criar índices se não existirem
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_user_id') THEN
    CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
    RAISE NOTICE '✅ Índice "idx_notifications_user_id" criado';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_created_at') THEN
    CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
    RAISE NOTICE '✅ Índice "idx_notifications_created_at" criado';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_user_read') THEN
    CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read);
    RAISE NOTICE '✅ Índice "idx_notifications_user_read" criado';
  END IF;
END $$;

-- 5. Ativar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 6. Recriar políticas RLS (remove antigas e cria novas)
DO $$ 
BEGIN
  -- Política 1: Usuários veem suas notificações
  DROP POLICY IF EXISTS "Usuários veem suas notificações" ON public.notifications;
  CREATE POLICY "Usuários veem suas notificações"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);
  RAISE NOTICE '✅ Política "Usuários veem suas notificações" criada';

  -- Política 2: Sistema cria notificações
  DROP POLICY IF EXISTS "Sistema cria notificações" ON public.notifications;
  CREATE POLICY "Sistema cria notificações"
    ON public.notifications
    FOR INSERT
    WITH CHECK (true);
  RAISE NOTICE '✅ Política "Sistema cria notificações" criada';

  -- Política 3: Usuários atualizam suas notificações
  DROP POLICY IF EXISTS "Usuários atualizam suas notificações" ON public.notifications;
  CREATE POLICY "Usuários atualizam suas notificações"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);
  RAISE NOTICE '✅ Política "Usuários atualizam suas notificações" criada';

  -- Política 4: Usuários deletam suas notificações
  DROP POLICY IF EXISTS "Usuários deletam suas notificações" ON public.notifications;
  CREATE POLICY "Usuários deletam suas notificações"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);
  RAISE NOTICE '✅ Política "Usuários deletam suas notificações" criada';
END $$;

-- 7. Criar função para limpar notificações antigas (30 dias)
CREATE OR REPLACE FUNCTION clean_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND read = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION clean_old_notifications() IS 'Limpa notificações lidas com mais de 30 dias';

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

DO $$ 
DECLARE
  columns_count INTEGER;
  policies_count INTEGER;
  indexes_count INTEGER;
BEGIN
  -- Verificar colunas
  SELECT COUNT(*) INTO columns_count
  FROM information_schema.columns
  WHERE table_schema = 'public' 
  AND table_name = 'notifications'
  AND column_name IN ('id', 'user_id', 'type', 'title', 'message', 'data', 'read', 'created_at');
  
  -- Verificar políticas
  SELECT COUNT(*) INTO policies_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'notifications';
  
  -- Verificar índices
  SELECT COUNT(*) INTO indexes_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'notifications';
  
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ FIX da tabela notifications concluído!';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '   📊 Colunas: % de 8 esperadas', columns_count;
  RAISE NOTICE '   🔒 Políticas RLS: %', policies_count;
  RAISE NOTICE '   📈 Índices: %', indexes_count;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '';
  
  -- Mostrar estrutura final
  RAISE NOTICE '📋 Estrutura da tabela:';
END $$;

-- Mostrar todas as colunas
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;

