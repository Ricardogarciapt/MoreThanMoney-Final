-- =====================================================
-- Sistema de mensagens: compatibilidade grupo + Realtime
-- (Inspirado no modelo Rocket.Chat; dados em Supabase)
-- =====================================================
-- Executar após create-messages-system.sql e create-group-messages-system.sql

-- 1. Permitir conversation_id NULL para mensagens de grupo
-- (Mensagens de grupo usam group_id; mensagens DM usam conversation_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE public.messages ALTER COLUMN conversation_id DROP NOT NULL;
  END IF;
END $$;

-- 2. Ativar Realtime na tabela messages (Supabase)
-- Permite que o cliente subscreva postgres_changes (INSERT/UPDATE/DELETE)
-- Nota: No dashboard Supabase, Realtime pode também ser ativado em Database > Replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Publicação supabase_realtime pode não existir em projetos antigos
    NULL;
END $$;

-- 3. REPLICA IDENTITY para Realtime enviar o payload completo nas mudanças
ALTER TABLE public.messages REPLICA IDENTITY FULL;
