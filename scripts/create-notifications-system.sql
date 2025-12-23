-- =====================================================
-- NOTIFICATIONS SYSTEM - MoreThanMoney
-- Sistema completo de notificações push e email
-- =====================================================

-- 1. TABELA: notification_configs
-- Armazena configurações de notificações
CREATE TABLE IF NOT EXISTS public.notification_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'push', 'both')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  target_users TEXT DEFAULT 'all' CHECK (target_users IN ('all', 'members', 'vip', 'admin')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipients_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Adicionar colunas se não existirem (para compatibilidade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notification_configs' AND column_name = 'enabled'
  ) THEN
    ALTER TABLE public.notification_configs ADD COLUMN enabled BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notification_configs' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.notification_configs ADD COLUMN status TEXT DEFAULT 'draft';
  END IF;
END$$;

-- 2. TABELA: notification_logs
-- Log de envios de notificações
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.notification_configs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'push')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. TABELA: user_notification_preferences
-- Preferências de notificação dos utilizadores
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Preferências de email
  email_marketing BOOLEAN DEFAULT true,
  email_dca_alerts BOOLEAN DEFAULT true,
  email_system_updates BOOLEAN DEFAULT true,
  
  -- Preferências de push
  push_dca_alerts BOOLEAN DEFAULT true,
  push_price_alerts BOOLEAN DEFAULT false,
  push_system_updates BOOLEAN DEFAULT true,
  
  -- Dados técnicos
  fcm_token TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_notification_preferences' AND column_name = 'fcm_token'
  ) THEN
    ALTER TABLE public.user_notification_preferences ADD COLUMN fcm_token TEXT;
  END IF;
END$$;

-- RLS Policies
ALTER TABLE public.notification_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas para notification_configs
DROP POLICY IF EXISTS "Admins can manage notification configs" ON public.notification_configs;
CREATE POLICY "Admins can manage notification configs" ON public.notification_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.user_type = 'admin' 
      AND profiles.is_active = true
    )
  );

-- Políticas para notification_logs
DROP POLICY IF EXISTS "Users can view their notification logs" ON public.notification_logs;
CREATE POLICY "Users can view their notification logs" ON public.notification_logs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage notification logs" ON public.notification_logs;
CREATE POLICY "Admins can manage notification logs" ON public.notification_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.user_type = 'admin' 
      AND profiles.is_active = true
    )
  );

-- Políticas para user_notification_preferences
DROP POLICY IF EXISTS "Users can manage their notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can manage their notification preferences" ON public.user_notification_preferences
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Admins can view notification preferences" ON public.user_notification_preferences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.user_type = 'admin' 
      AND profiles.is_active = true
    )
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notification_configs_status ON public.notification_configs(status, enabled);
CREATE INDEX IF NOT EXISTS idx_notification_configs_target_users ON public.notification_configs(target_users);
CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_id ON public.notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON public.notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON public.user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_fcm_token ON public.user_notification_preferences(fcm_token) WHERE fcm_token IS NOT NULL;

-- Funções auxiliares

-- Função para buscar utilizadores baseado no target
CREATE OR REPLACE FUNCTION get_notification_users(target_type TEXT)
RETURNS TABLE(user_id UUID, email TEXT, fcm_token TEXT, user_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    unp.fcm_token,
    p.user_type
  FROM public.profiles p
  LEFT JOIN public.user_notification_preferences unp ON unp.user_id = p.id
  WHERE 
    p.is_active = true
    AND (
      target_type = 'all' OR
      (target_type = 'members' AND p.user_type IN ('member', 'vip')) OR
      (target_type = 'vip' AND p.user_type = 'vip') OR
      (target_type = 'admin' AND p.user_type = 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para atualizar preferências de notificação
CREATE OR REPLACE FUNCTION update_notification_preferences(
  user_uuid UUID,
  email_marketing BOOLEAN DEFAULT NULL,
  email_dca_alerts BOOLEAN DEFAULT NULL,
  push_dca_alerts BOOLEAN DEFAULT NULL,
  fcm_token_param TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  INSERT INTO public.user_notification_preferences (
    user_id,
    email_marketing,
    email_dca_alerts,
    push_dca_alerts,
    fcm_token
  ) VALUES (
    user_uuid,
    COALESCE(email_marketing, true),
    COALESCE(email_dca_alerts, true),
    COALESCE(push_dca_alerts, true),
    fcm_token_param
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    email_marketing = COALESCE(update_notification_preferences.email_marketing, user_notification_preferences.email_marketing),
    email_dca_alerts = COALESCE(update_notification_preferences.email_dca_alerts, user_notification_preferences.email_dca_alerts),
    push_dca_alerts = COALESCE(update_notification_preferences.push_dca_alerts, user_notification_preferences.push_dca_alerts),
    fcm_token = COALESCE(update_notification_preferences.fcm_token_param, user_notification_preferences.fcm_token),
    updated_at = NOW()
  RETURNING to_jsonb(user_notification_preferences) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dados iniciais - configurações de notificação padrão
INSERT INTO public.notification_configs (name, type, title, message, target_users, enabled) VALUES
  (
    'DCA Alert - Forte Compra',
    'both',
    '🚀 OPORTUNIDADE FORTE COMPRA DETECTADA!',
    'Uma oportunidade de DCA foi identificada no nosso sistema. Verifique os detalhes na plataforma.',
    'members',
    true
  ),
  (
    'Bem-vinda - Novo Membro',
    'email',
    'Bem-vindo à MoreThanMoney!',
    'Obrigado por se juntar à nossa comunidade. Comece a explorar as funcionalidades da plataforma.',
    'all',
    true
  ),
  (
    'Manutenção do Sistema',
    'both',
    '⏰ Manutenção Programada',
    'O sistema será atualizado em breve. Algumas funcionalidades podem estar temporariamente indisponíveis.',
    'all',
    false
  )
ON CONFLICT DO NOTHING;

-- Comentários nas tabelas
COMMENT ON TABLE public.notification_configs IS 'Configurações de notificações push e email';
COMMENT ON TABLE public.notification_logs IS 'Log de envios de notificações para tracking';
COMMENT ON TABLE public.user_notification_preferences IS 'Preferências de notificação dos utilizadores';

COMMENT ON FUNCTION get_notification_users(TEXT) IS 'Busca utilizadores baseado no tipo de target para notificações';
COMMENT ON FUNCTION update_notification_preferences(UUID, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) IS 'Atualiza preferências de notificação do utilizador';

-- Notificação de sucesso
DO $$
BEGIN
  RAISE NOTICE '✅ Sistema de Notificações criado com sucesso!';
  RAISE NOTICE '📋 Tabelas criadas: notification_configs, notification_logs, user_notification_preferences';
  RAISE NOTICE '🔐 RLS policies aplicadas';
  RAISE NOTICE '⚡ Índices de performance criados';
  RAISE NOTICE '🛠️ Funções auxiliares disponíveis';
END$$;
