-- =====================================================
-- SCRIPT DE SETUP DE NOTIFICAÇÕES (SEGURO)
-- Verifica existência antes de criar
-- =====================================================

-- 1. Criar tabela de notificações (se não existir)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('dca_opportunity', 'price_alert', 'system', 'portfolio')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Criar índices (se não existirem)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_user_id') THEN
    CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_created_at') THEN
    CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_user_read') THEN
    CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read);
  END IF;
END $$;

-- 3. Ativar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Remover políticas antigas (se existirem) e criar novas
DO $$ 
BEGIN
  -- Política 1: Usuários veem suas notificações
  DROP POLICY IF EXISTS "Usuários veem suas notificações" ON public.notifications;
  CREATE POLICY "Usuários veem suas notificações"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

  -- Política 2: Sistema cria notificações
  DROP POLICY IF EXISTS "Sistema cria notificações" ON public.notifications;
  CREATE POLICY "Sistema cria notificações"
    ON public.notifications
    FOR INSERT
    WITH CHECK (true);

  -- Política 3: Usuários atualizam suas notificações
  DROP POLICY IF EXISTS "Usuários atualizam suas notificações" ON public.notifications;
  CREATE POLICY "Usuários atualizam suas notificações"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

  -- Política 4: Usuários deletam suas notificações
  DROP POLICY IF EXISTS "Usuários deletam suas notificações" ON public.notifications;
  CREATE POLICY "Usuários deletam suas notificações"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);
END $$;

-- 5. Criar função para limpar notificações antigas (30 dias)
CREATE OR REPLACE FUNCTION clean_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND read = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Comentários para documentação
COMMENT ON TABLE public.notifications IS 'Tabela de notificações do sistema MTM';
COMMENT ON COLUMN public.notifications.type IS 'Tipos: dca_opportunity, price_alert, system, portfolio';
COMMENT ON COLUMN public.notifications.data IS 'Dados adicionais em JSON (asset, price, etc)';
COMMENT ON FUNCTION clean_old_notifications() IS 'Limpa notificações lidas com mais de 30 dias';

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

DO $$ 
DECLARE
  table_count INTEGER;
  policy_count INTEGER;
  index_count INTEGER;
BEGIN
  -- Verificar tabela
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'notifications';
  
  -- Verificar políticas
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'notifications';
  
  -- Verificar índices
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'notifications';
  
  RAISE NOTICE '✅ Setup de Notificações Concluído!';
  RAISE NOTICE '   - Tabela criada: %', CASE WHEN table_count > 0 THEN 'SIM' ELSE 'NÃO' END;
  RAISE NOTICE '   - Políticas RLS: % políticas', policy_count;
  RAISE NOTICE '   - Índices: % índices', index_count;
END $$;

-- =====================================================
-- Exemplo de uso (opcional - comentado)
-- =====================================================

/*
-- Criar notificação de teste
INSERT INTO public.notifications (user_id, type, title, message, data)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'system',
  'Sistema Atualizado',
  'Novas funcionalidades disponíveis!',
  '{"version": "3.0"}'::jsonb
);

-- Listar notificações
SELECT * FROM public.notifications ORDER BY created_at DESC LIMIT 10;

-- Marcar como lida
UPDATE public.notifications SET read = true WHERE id = 'seu-uuid-aqui';

-- Limpar notificações antigas
SELECT clean_old_notifications();
*/

