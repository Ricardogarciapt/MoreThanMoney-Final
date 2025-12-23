-- =====================================================
-- EMAIL MARKETING SYSTEM - MoreThanMoney
-- Sistema completo de campanhas, automações e tracking
-- =====================================================

-- 1. TABELA: email_campaigns
-- Armazena todas as campanhas de email
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, sending, sent, cancelled
  type TEXT NOT NULL DEFAULT 'broadcast', -- broadcast, automated, transactional
  segment TEXT, -- all, members, vip, trial, custom
  send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Estatísticas
  total_recipients INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  emails_unsubscribed INTEGER DEFAULT 0,
  
  -- Configurações
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Adicionar colunas se não existirem (para compatibilidade com tabelas existentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN type TEXT NOT NULL DEFAULT 'broadcast';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'segment'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN segment TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'send_at'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN send_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN sent_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'total_recipients'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN total_recipients INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_sent'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_sent INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_delivered'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_delivered INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_opened'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_opened INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_clicked'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_clicked INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_bounced'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_bounced INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'emails_unsubscribed'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN emails_unsubscribed INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'settings'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN settings JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.email_campaigns ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_type ON public.email_campaigns(type);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_send_at ON public.email_campaigns(send_at) WHERE send_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON public.email_campaigns(created_at DESC);

-- 2. TABELA: email_sends
-- Tracking individual de cada email enviado
CREATE TABLE IF NOT EXISTS public.email_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, delivered, bounced, failed
  
  -- Tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  first_clicked_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  
  -- Analytics
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  clicks JSONB DEFAULT '[]'::jsonb, -- Array de {url, timestamp}
  
  -- Metadata
  user_agent TEXT,
  ip_address INET,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'open_count'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN open_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'click_count'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN click_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'clicks'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN clicks JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN user_agent TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN ip_address INET;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sends' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.email_sends ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign_id ON public.email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_user_id ON public.email_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_email ON public.email_sends(email);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON public.email_sends(status);
CREATE INDEX IF NOT EXISTS idx_email_sends_opened_at ON public.email_sends(opened_at) WHERE opened_at IS NOT NULL;

-- 3. TABELA: email_sequences
-- Sequências automatizadas de onboarding
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- user_registered, user_approved, upgrade_vip, etc
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequences' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.email_sequences ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequences' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.email_sequences ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END$$;

-- Adicionar constraint UNIQUE na coluna name se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'email_sequences_name_key'
  ) THEN
    ALTER TABLE public.email_sequences ADD CONSTRAINT email_sequences_name_key UNIQUE (name);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_sequences_trigger ON public.email_sequences(trigger_event);
CREATE INDEX IF NOT EXISTS idx_email_sequences_active ON public.email_sequences(is_active) WHERE is_active = true;

-- 4. TABELA: email_sequence_steps
-- Passos individuais de cada sequência
CREATE TABLE IF NOT EXISTS public.email_sequence_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0, -- Dias após trigger ou passo anterior
  delay_hours INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(sequence_id, step_number)
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_steps' AND column_name = 'delay_hours'
  ) THEN
    ALTER TABLE public.email_sequence_steps ADD COLUMN delay_hours INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_steps' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.email_sequence_steps ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END$$;

-- Adicionar constraint UNIQUE se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'email_sequence_steps_sequence_id_step_number_key'
  ) THEN
    ALTER TABLE public.email_sequence_steps ADD CONSTRAINT email_sequence_steps_sequence_id_step_number_key UNIQUE (sequence_id, step_number);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_sequence_steps_sequence ON public.email_sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_sequence_steps_active ON public.email_sequence_steps(is_active) WHERE is_active = true;

-- 5. TABELA: email_sequence_enrollments
-- Usuários inscritos em sequências
CREATE TABLE IF NOT EXISTS public.email_sequence_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  current_step INTEGER DEFAULT 0,
  
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  
  UNIQUE(sequence_id, user_id)
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_enrollments' AND column_name = 'current_step'
  ) THEN
    ALTER TABLE public.email_sequence_enrollments ADD COLUMN current_step INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_enrollments' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.email_sequence_enrollments ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_enrollments' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.email_sequence_enrollments ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_sequence_enrollments' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.email_sequence_enrollments ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END$$;

-- Adicionar constraint UNIQUE se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'email_sequence_enrollments_sequence_id_user_id_key'
  ) THEN
    ALTER TABLE public.email_sequence_enrollments ADD CONSTRAINT email_sequence_enrollments_sequence_id_user_id_key UNIQUE (sequence_id, user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_sequence ON public.email_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_user ON public.email_sequence_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_status ON public.email_sequence_enrollments(status);

-- 6. TABELA: email_preferences
-- Preferências de email de cada usuário
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Preferências gerais
  marketing_emails BOOLEAN DEFAULT true,
  dca_notifications BOOLEAN DEFAULT true,
  product_updates BOOLEAN DEFAULT true,
  community_digest BOOLEAN DEFAULT true,
  educational_content BOOLEAN DEFAULT true,
  
  -- Frequência
  email_frequency TEXT DEFAULT 'daily', -- daily, weekly, monthly, never
  
  -- Unsubscribe
  unsubscribed_all BOOLEAN DEFAULT false,
  unsubscribed_at TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'marketing_emails'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN marketing_emails BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'dca_notifications'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN dca_notifications BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'product_updates'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN product_updates BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'community_digest'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN community_digest BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'educational_content'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN educational_content BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'email_frequency'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN email_frequency TEXT DEFAULT 'daily';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'unsubscribed_all'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN unsubscribed_all BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'email_preferences' AND column_name = 'unsubscribed_at'
  ) THEN
    ALTER TABLE public.email_preferences ADD COLUMN unsubscribed_at TIMESTAMPTZ;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_email_preferences_marketing ON public.email_preferences(marketing_emails) WHERE marketing_emails = true;
CREATE INDEX IF NOT EXISTS idx_email_preferences_unsubscribed ON public.email_preferences(unsubscribed_all) WHERE unsubscribed_all = true;

-- 7. TABELA: email_templates (metadata)
-- Metadados dos templates disponíveis

-- Dropar tabela antiga se tiver schema incompatível
DROP TABLE IF EXISTS public.email_templates CASCADE;

CREATE TABLE public.email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- welcome, onboarding, notification, marketing
  thumbnail_url TEXT,
  
  -- Preview
  preview_subject TEXT,
  preview_text TEXT,
  
  -- Variáveis necessárias
  required_vars JSONB DEFAULT '[]'::jsonb,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON public.email_templates(is_active) WHERE is_active = true;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Campaigns
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê todas campanhas" ON public.email_campaigns;
CREATE POLICY "Admin vê todas campanhas" 
ON public.email_campaigns FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin cria campanhas" ON public.email_campaigns;
CREATE POLICY "Admin cria campanhas" 
ON public.email_campaigns FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin edita campanhas" ON public.email_campaigns;
CREATE POLICY "Admin edita campanhas" 
ON public.email_campaigns FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- Email Sends (tracking)
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seus emails" ON public.email_sends;
CREATE POLICY "Usuários veem seus emails" 
ON public.email_sends FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin vê todos emails" ON public.email_sends;
CREATE POLICY "Admin vê todos emails" 
ON public.email_sends FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- Email Preferences
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem suas preferências" ON public.email_preferences;
CREATE POLICY "Usuários veem suas preferências" 
ON public.email_preferences FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam suas preferências" ON public.email_preferences;
CREATE POLICY "Usuários atualizam suas preferências" 
ON public.email_preferences FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Criar preferências automaticamente" ON public.email_preferences;
CREATE POLICY "Criar preferências automaticamente" 
ON public.email_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Sequences (admin only)
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê sequências" ON public.email_sequences;
CREATE POLICY "Admin vê sequências" 
ON public.email_sequences FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- Sequence Steps (admin only)
ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê passos" ON public.email_sequence_steps;
CREATE POLICY "Admin vê passos" 
ON public.email_sequence_steps FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- Sequence Enrollments
ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem suas inscrições" ON public.email_sequence_enrollments;
CREATE POLICY "Usuários veem suas inscrições" 
ON public.email_sequence_enrollments FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin vê todas inscrições" ON public.email_sequence_enrollments;
CREATE POLICY "Admin vê todas inscrições" 
ON public.email_sequence_enrollments FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- Templates (admin only)
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê templates" ON public.email_templates;
CREATE POLICY "Admin vê templates" 
ON public.email_templates FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_type = 'admin'
  )
);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Função: Inscrever usuário em sequência automaticamente
CREATE OR REPLACE FUNCTION enroll_user_in_sequence(
  p_user_id UUID,
  p_trigger_event TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Inserir em todas as sequências ativas com esse trigger
  INSERT INTO public.email_sequence_enrollments (sequence_id, user_id, status, enrolled_at)
  SELECT id, p_user_id, 'active', NOW()
  FROM public.email_sequences
  WHERE trigger_event = p_trigger_event
  AND is_active = true
  ON CONFLICT (sequence_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: Marcar email como aberto
CREATE OR REPLACE FUNCTION mark_email_opened(
  p_send_id UUID,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.email_sends
  SET 
    opened_at = COALESCE(opened_at, NOW()),
    open_count = open_count + 1,
    user_agent = COALESCE(p_user_agent, user_agent),
    ip_address = COALESCE(p_ip_address, ip_address)
  WHERE id = p_send_id;
  
  -- Atualizar estatísticas da campanha
  UPDATE public.email_campaigns
  SET emails_opened = (
    SELECT COUNT(DISTINCT user_id)
    FROM public.email_sends
    WHERE campaign_id = (SELECT campaign_id FROM public.email_sends WHERE id = p_send_id)
    AND opened_at IS NOT NULL
  )
  WHERE id = (SELECT campaign_id FROM public.email_sends WHERE id = p_send_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: Marcar email como clicado
CREATE OR REPLACE FUNCTION mark_email_clicked(
  p_send_id UUID,
  p_url TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.email_sends
  SET 
    first_clicked_at = COALESCE(first_clicked_at, NOW()),
    click_count = click_count + 1,
    clicks = clicks || jsonb_build_object('url', p_url, 'timestamp', NOW())
  WHERE id = p_send_id;
  
  -- Atualizar estatísticas da campanha
  UPDATE public.email_campaigns
  SET emails_clicked = (
    SELECT COUNT(DISTINCT user_id)
    FROM public.email_sends
    WHERE campaign_id = (SELECT campaign_id FROM public.email_sends WHERE id = p_send_id)
    AND first_clicked_at IS NOT NULL
  )
  WHERE id = (SELECT campaign_id FROM public.email_sends WHERE id = p_send_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

-- Templates disponíveis
INSERT INTO public.email_templates (name, display_name, description, category, preview_subject, required_vars) VALUES
('welcome', 'Bem-vindo', 'Email de boas-vindas para novos membros', 'welcome', 'Bem-vindo à MoreThanMoney!', '["userName", "userEmail", "username", "siteUrl"]'),
('onboarding_1', 'Onboarding - Dia 1', 'Introdução à plataforma', 'onboarding', 'Guia de Início - Passo 1', '["userName", "siteUrl"]'),
('onboarding_2', 'Onboarding - Dia 2', 'App Mobile e Notificações', 'onboarding', 'App Mobile MTM', '["userName", "siteUrl"]'),
('onboarding_3', 'Onboarding - Dia 3', 'Scanners e Portfolios', 'onboarding', 'Scanners & Portfolios', '["userName", "siteUrl"]'),
('onboarding_4', 'Onboarding - Dia 5', 'Comunidade Skool', 'onboarding', 'Junta-te ao Skool MTM', '["userName", "skoolUrl"]'),
('onboarding_schedule', 'Agendamento de Onboarding', 'Convite para agendar sessão 1-on-1 via Calendly', 'onboarding', 'Agende o Teu Onboarding Gratuito', '["userName", "calendlyUrl", "siteUrl"]'),
('vision_announcement', 'Visão Conjunta MTM', 'Email especial celebrando a comunidade e visão da MTM', 'marketing', 'A Nossa Jornada Juntos - MoreThanMoney', '["userName", "siteUrl"]'),
('dca_opportunity', 'Alerta DCA', 'Notificação de oportunidades DCA', 'notification', 'Novas Oportunidades DCA!', '["userName", "opportunities", "siteUrl"]')
ON CONFLICT (name) DO NOTHING;

-- Sequência de Onboarding padrão
INSERT INTO public.email_sequences (name, description, trigger_event, is_active) VALUES
('welcome_onboarding', 'Sequência de boas-vindas e onboarding para novos membros', 'user_approved', true)
ON CONFLICT (name) DO NOTHING;

-- Passos da sequência (assumindo que a sequência foi criada)
DO $$
DECLARE
  v_sequence_id UUID;
BEGIN
  SELECT id INTO v_sequence_id FROM public.email_sequences WHERE name = 'welcome_onboarding' LIMIT 1;
  
  IF v_sequence_id IS NOT NULL THEN
    INSERT INTO public.email_sequence_steps (sequence_id, step_number, name, subject, template_name, delay_days, delay_hours) VALUES
    (v_sequence_id, 1, 'Boas-vindas', 'Bem-vindo à MoreThanMoney!', 'welcome', 0, 0),
    (v_sequence_id, 2, 'Dia 1 - Plataforma', 'Guia de Início - Conhece a Plataforma', 'onboarding_1', 1, 0),
    (v_sequence_id, 3, 'Dia 2 - App Mobile', 'Teu Dashboard no Bolso', 'onboarding_2', 2, 0),
    (v_sequence_id, 4, 'Dia 3 - Scanners', 'Ferramentas Profissionais', 'onboarding_3', 3, 0),
    (v_sequence_id, 5, 'Dia 5 - Skool', 'Junta-te à Comunidade', 'onboarding_4', 5, 0)
    ON CONFLICT (sequence_id, step_number) DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

-- Índice composto para queries de analytics
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign_status ON public.email_sends(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign_opened ON public.email_sends(campaign_id, opened_at) WHERE opened_at IS NOT NULL;

-- Índice para processar sequências pendentes
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_active ON public.email_sequence_enrollments(sequence_id, current_step, status) WHERE status = 'active';

COMMENT ON TABLE public.email_campaigns IS 'Campanhas de email marketing';
COMMENT ON TABLE public.email_sends IS 'Tracking individual de emails enviados';
COMMENT ON TABLE public.email_sequences IS 'Sequências automatizadas de emails';
COMMENT ON TABLE public.email_sequence_steps IS 'Passos individuais de cada sequência';
COMMENT ON TABLE public.email_sequence_enrollments IS 'Usuários inscritos em sequências';
COMMENT ON TABLE public.email_preferences IS 'Preferências de email dos usuários';
COMMENT ON TABLE public.email_templates IS 'Metadados dos templates de email';

