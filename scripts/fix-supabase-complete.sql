-- ========================================
-- SCRIPT COMPLETO E CORRIGIDO PARA SUPABASE
-- ========================================

-- PARTE 1: ADICIONAR COLUNAS EM PROFILES
-- ========================================

-- Adicionar is_verified
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Adicionar trial_expires_at
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP WITH TIME ZONE;

-- Adicionar trial_expired
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_expired BOOLEAN DEFAULT false;

-- Atualizar constraint de user_type
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_user_type_check 
CHECK (user_type IN ('member', 'admin', 'pending', 'guest', 'presentation'));

-- Atualizar utilizadores existentes
UPDATE profiles 
SET is_verified = true 
WHERE id IN (
    SELECT au.id::uuid 
    FROM auth.users au 
    WHERE au.email_confirmed_at IS NOT NULL
);

-- PARTE 2: CRIAR TABELAS DE ADMIN
-- ========================================

-- Tabela site_content
CREATE TABLE IF NOT EXISTS site_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('link', 'video', 'file', 'text', 'image')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('navbar', 'footer', 'landing', 'education', 'trading', 'general')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT,
  content TEXT,
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'admin'
);

-- Tabela activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela admin_settings
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PARTE 3: CRIAR FUNÇÕES
-- ========================================

-- Função para logs
CREATE OR REPLACE FUNCTION log_activity(
    p_user_email VARCHAR(255),
    p_action VARCHAR(50),
    p_details TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO activity_logs (user_email, action, details)
    VALUES (p_user_email, p_action, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar Guest
CREATE OR REPLACE FUNCTION create_guest_user(
    p_email TEXT,
    p_full_name TEXT,
    p_username TEXT
)
RETURNS JSON AS $$
DECLARE
    new_user_id UUID;
    expiry_date TIMESTAMP WITH TIME ZONE;
    result JSON;
BEGIN
    expiry_date := NOW() + INTERVAL '7 days';
    new_user_id := gen_random_uuid();
    
    INSERT INTO profiles (
        id, email, username, full_name, user_type, membership_level,
        is_active, is_verified, trial_expires_at, trial_expired, created_at, updated_at
    ) VALUES (
        new_user_id, p_email, p_username, p_full_name, 'guest', 'basic',
        true, true, expiry_date, false, NOW(), NOW()
    );
    
    SELECT json_build_object(
        'id', new_user_id,
        'email', p_email,
        'trial_expires_at', expiry_date,
        'days_remaining', 7
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar Apresentação
CREATE OR REPLACE FUNCTION create_presentation_user(
    p_email TEXT,
    p_full_name TEXT,
    p_username TEXT
)
RETURNS JSON AS $$
DECLARE
    new_user_id UUID;
    expiry_date TIMESTAMP WITH TIME ZONE;
    result JSON;
BEGIN
    expiry_date := NOW() + INTERVAL '48 hours';
    new_user_id := gen_random_uuid();
    
    INSERT INTO profiles (
        id, email, username, full_name, user_type, membership_level,
        is_active, is_verified, trial_expires_at, trial_expired, created_at, updated_at
    ) VALUES (
        new_user_id, p_email, p_username, p_full_name, 'presentation', 'basic',
        true, true, expiry_date, false, NOW(), NOW()
    );
    
    SELECT json_build_object(
        'id', new_user_id,
        'email', p_email,
        'trial_expires_at', expiry_date,
        'hours_remaining', 48
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PARTE 4: POLÍTICAS RLS (Apenas se não existirem)
-- ========================================

-- Habilitar RLS nas novas tabelas
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para site_content (Criar apenas se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'site_content' AND policyname = 'Admins can manage site content'
    ) THEN
        CREATE POLICY "Admins can manage site content" ON site_content
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.user_type = 'admin'
            )
        );
    END IF;
END $$;

-- Políticas para activity_logs
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Admins can view activity logs'
    ) THEN
        CREATE POLICY "Admins can view activity logs" ON activity_logs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.user_type = 'admin'
            )
        );
    END IF;
END $$;

-- Políticas para admin_settings
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'admin_settings' AND policyname = 'Admins can manage settings'
    ) THEN
        CREATE POLICY "Admins can manage settings" ON admin_settings
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.user_type = 'admin'
            )
        );
    END IF;
END $$;

-- PARTE 5: INSERIR CONFIGURAÇÕES PADRÃO
-- ========================================

INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
('site_name', '"MoreThanMoney"', 'Nome do site'),
('site_description', '"Plataforma de Trading e Educação Financeira"', 'Descrição do site'),
('maintenance_mode', 'false', 'Modo de manutenção'),
('registration_enabled', 'true', 'Registo de utilizadores'),
('auto_approve_users', 'false', 'Aprovação automática'),
('email_notifications', 'true', 'Notificações por email'),
('default_user_role', '"member"', 'Role padrão'),
('guest_trial_days', '7', 'Duração trial Guest'),
('presentation_trial_hours', '48', 'Duração trial Apresentação')
ON CONFLICT (setting_key) DO NOTHING;

-- PARTE 6: CRIAR ÍNDICES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_profiles_is_verified ON profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_profiles_trial_expiry ON profiles(trial_expires_at) WHERE user_type IN ('guest', 'presentation');
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_site_content_category ON site_content(category);

-- PARTE 7: VERIFICAÇÃO FINAL
-- ========================================

-- Mostrar resultado
SELECT 
    'Tabelas criadas' as status,
    COUNT(*) FILTER (WHERE table_name = 'profiles') as profiles,
    COUNT(*) FILTER (WHERE table_name = 'site_content') as site_content,
    COUNT(*) FILTER (WHERE table_name = 'activity_logs') as activity_logs,
    COUNT(*) FILTER (WHERE table_name = 'admin_settings') as admin_settings
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'site_content', 'activity_logs', 'admin_settings');

-- Mostrar colunas de profiles
SELECT 
    'Colunas adicionadas' as status,
    COUNT(*) FILTER (WHERE column_name = 'is_verified') as is_verified,
    COUNT(*) FILTER (WHERE column_name = 'trial_expires_at') as trial_expires_at,
    COUNT(*) FILTER (WHERE column_name = 'trial_expired') as trial_expired
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('is_verified', 'trial_expires_at', 'trial_expired');

-- ========================================
-- SUCESSO! 
-- ========================================
-- Próximo passo: Sincronizar utilizadores em /admin
-- ========================================
