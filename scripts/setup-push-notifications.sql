-- =====================================================
-- SETUP PUSH NOTIFICATIONS (FCM)
-- =====================================================

-- 1. TABELA: fcm_tokens
-- Armazena tokens FCM dos dispositivos dos usuários
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_info JSONB DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON public.fcm_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_last_used ON public.fcm_tokens(last_used_at DESC);

-- RLS Policies
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seus tokens" ON public.fcm_tokens;
CREATE POLICY "Usuários veem seus tokens" 
ON public.fcm_tokens FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam seus tokens" ON public.fcm_tokens;
CREATE POLICY "Usuários criam seus tokens" 
ON public.fcm_tokens FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam seus tokens" ON public.fcm_tokens;
CREATE POLICY "Usuários atualizam seus tokens" 
ON public.fcm_tokens FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus tokens" ON public.fcm_tokens;
CREATE POLICY "Usuários deletam seus tokens" 
ON public.fcm_tokens FOR DELETE 
USING (auth.uid() = user_id);

-- Policy para admin enviar notificações
DROP POLICY IF EXISTS "Admin vê todos tokens" ON public.fcm_tokens;
CREATE POLICY "Admin vê todos tokens" 
ON public.fcm_tokens FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- 2. TABELA: notification_history
-- Histórico de notificações push enviadas
CREATE TABLE IF NOT EXISTS public.notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'clicked', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_history_user_id ON public.notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON public.notification_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON public.notification_history(status);

-- RLS Policies
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seu histórico" ON public.notification_history;
CREATE POLICY "Usuários veem seu histórico" 
ON public.notification_history FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema cria histórico" ON public.notification_history;
CREATE POLICY "Sistema cria histórico" 
ON public.notification_history FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários atualizam seu histórico" ON public.notification_history;
CREATE POLICY "Usuários atualizam seu histórico" 
ON public.notification_history FOR UPDATE 
USING (auth.uid() = user_id);

-- 3. FUNÇÃO: Limpar tokens antigos (não usados há mais de 90 dias)
CREATE OR REPLACE FUNCTION clean_old_fcm_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM public.fcm_tokens 
  WHERE last_used_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. FUNÇÃO: Atualizar last_used_at automaticamente
CREATE OR REPLACE FUNCTION update_fcm_token_last_used()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_used_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fcm_token_last_used ON public.fcm_tokens;
CREATE TRIGGER trigger_update_fcm_token_last_used
  BEFORE UPDATE ON public.fcm_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_fcm_token_last_used();

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

SELECT 
  '✅ Tabelas de Push Notifications criadas!' as status,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('fcm_tokens', 'notification_history')) as tabelas_criadas;

SELECT 
  '✅ Políticas RLS ativas!' as status,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename IN ('fcm_tokens', 'notification_history');

