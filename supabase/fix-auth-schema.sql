-- ========================================
-- CORREÇÃO DE PROBLEMAS DE AUTENTICAÇÃO
-- ========================================

-- 1. Adicionar coluna is_verified se não existir
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 2. Atualizar utilizadores existentes para is_verified = true se tiverem email confirmado
UPDATE profiles 
SET is_verified = true 
WHERE id IN (
    SELECT au.id::uuid 
    FROM auth.users au 
    WHERE au.email_confirmed_at IS NOT NULL
);

-- 3. Garantir que a função get_user_email_by_username existe e funciona
CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
RETURNS TEXT AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email
    FROM profiles
    WHERE username = username_param;
    
    RETURN user_email;
END;
$$ LANGUAGE plpgsql;

-- 4. Verificar e corrigir políticas RLS para profiles
-- Desabilitar RLS temporariamente para correções
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Recriar políticas RLS corretas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política para utilizadores verem o próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Política para utilizadores atualizarem o próprio perfil
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Política para admins verem todos os perfis
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles admin_profile
            WHERE admin_profile.id = auth.uid() 
            AND admin_profile.user_type = 'admin'
        )
    );

-- Política para admins atualizarem todos os perfis
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles admin_profile
            WHERE admin_profile.id = auth.uid() 
            AND admin_profile.user_type = 'admin'
        )
    );

-- Política para inserção de novos perfis (apenas para o próprio utilizador)
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 5. Garantir que todas as funções RPC necessárias existem

-- Função para verificar se username existe
CREATE OR REPLACE FUNCTION check_username_exists(username_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE username = username_param
    );
END;
$$ LANGUAGE plpgsql;

-- Função para verificar se JIFU ID existe
CREATE OR REPLACE FUNCTION check_jifu_id_exists(jifu_id_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE jifu_id = jifu_id_param
    );
END;
$$ LANGUAGE plpgsql;

-- Função para buscar perfil do usuário (atualizada com is_verified)
CREATE OR REPLACE FUNCTION get_user_profile(user_id_param UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    whatsapp TEXT,
    social_media TEXT,
    jifu_id TEXT,
    jifu_affiliate_link TEXT,
    birth_date DATE,
    avatar_url TEXT,
    user_type TEXT,
    membership_level TEXT,
    package TEXT,
    affiliate_code TEXT,
    is_active BOOLEAN,
    is_verified BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.email,
        p.username,
        p.full_name,
        p.phone,
        p.whatsapp,
        p.social_media,
        p.jifu_id,
        p.jifu_affiliate_link,
        p.birth_date,
        p.avatar_url,
        p.user_type,
        p.membership_level,
        p.package,
        p.affiliate_code,
        p.is_active,
        p.is_verified,
        p.created_at,
        p.updated_at
    FROM profiles p
    WHERE p.id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Função para criar perfil do usuário (atualizada com is_verified)
CREATE OR REPLACE FUNCTION create_user_profile(
    user_id_param UUID,
    profile_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    INSERT INTO profiles (
        id,
        email,
        username,
        full_name,
        phone,
        whatsapp,
        social_media,
        jifu_id,
        jifu_affiliate_link,
        birth_date,
        avatar_url,
        user_type,
        membership_level,
        package,
        affiliate_code,
        is_active,
        is_verified,
        created_at,
        updated_at
    ) VALUES (
        user_id_param,
        (profile_data->>'email')::TEXT,
        (profile_data->>'username')::TEXT,
        (profile_data->>'full_name')::TEXT,
        (profile_data->>'phone')::TEXT,
        (profile_data->>'whatsapp')::TEXT,
        (profile_data->>'social_media')::TEXT,
        (profile_data->>'jifu_id')::TEXT,
        (profile_data->>'jifu_affiliate_link')::TEXT,
        (profile_data->>'birth_date')::DATE,
        (profile_data->>'avatar_url')::TEXT,
        COALESCE((profile_data->>'user_type')::TEXT, 'member'),
        COALESCE((profile_data->>'membership_level')::TEXT, 'basic'),
        COALESCE((profile_data->>'package')::TEXT, 'basic'),
        (profile_data->>'affiliate_code')::TEXT,
        COALESCE((profile_data->>'is_active')::BOOLEAN, true),
        COALESCE((profile_data->>'is_verified')::BOOLEAN, false),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        full_name = EXCLUDED.username,
        phone = EXCLUDED.phone,
        whatsapp = EXCLUDED.whatsapp,
        social_media = EXCLUDED.social_media,
        jifu_id = EXCLUDED.jifu_id,
        jifu_affiliate_link = EXCLUDED.jifu_affiliate_link,
        birth_date = EXCLUDED.birth_date,
        avatar_url = EXCLUDED.avatar_url,
        user_type = EXCLUDED.user_type,
        membership_level = EXCLUDED.membership_level,
        package = EXCLUDED.package,
        affiliate_code = EXCLUDED.affiliate_code,
        is_active = EXCLUDED.is_active,
        is_verified = EXCLUDED.is_verified,
        updated_at = NOW();

    -- Retornar o perfil criado/atualizado
    SELECT to_jsonb(p.*) INTO result
    FROM profiles p
    WHERE p.id = user_id_param;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar perfil do usuário (atualizada com is_verified)
CREATE OR REPLACE FUNCTION update_user_profile(
    user_id_param UUID,
    updates_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    UPDATE profiles SET
        email = COALESCE((updates_data->>'email')::TEXT, email),
        username = COALESCE((updates_data->>'username')::TEXT, username),
        full_name = COALESCE((updates_data->>'full_name')::TEXT, full_name),
        phone = COALESCE((updates_data->>'phone')::TEXT, phone),
        whatsapp = COALESCE((updates_data->>'whatsapp')::TEXT, whatsapp),
        social_media = COALESCE((updates_data->>'social_media')::TEXT, social_media),
        jifu_id = COALESCE((updates_data->>'jifu_id')::TEXT, jifu_id),
        jifu_affiliate_link = COALESCE((updates_data->>'jifu_affiliate_link')::TEXT, jifu_affiliate_link),
        birth_date = COALESCE((updates_data->>'birth_date')::DATE, birth_date),
        avatar_url = COALESCE((updates_data->>'avatar_url')::TEXT, avatar_url),
        user_type = COALESCE((updates_data->>'user_type')::TEXT, user_type),
        membership_level = COALESCE((updates_data->>'membership_level')::TEXT, membership_level),
        package = COALESCE((updates_data->>'package')::TEXT, package),
        affiliate_code = COALESCE((updates_data->>'affiliate_code')::TEXT, affiliate_code),
        is_active = COALESCE((updates_data->>'is_active')::BOOLEAN, is_active),
        is_verified = COALESCE((updates_data->>'is_verified')::BOOLEAN, is_verified),
        updated_at = NOW()
    WHERE id = user_id_param;

    -- Retornar o perfil atualizado
    SELECT to_jsonb(p.*) INTO result
    FROM profiles p
    WHERE p.id = user_id_param;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. Atualizar tipos TypeScript para incluir is_verified
-- (Isso será feito no arquivo lib/admin-types.ts)

-- 7. Verificar se a tabela activity_logs existe (para o sistema de admin)
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('login', 'logout', 'content_created', 'content_updated', 'content_deleted', 'user_approved', 'user_role_changed', 'email_verified', 'registration_notification')),
  details TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Verificar se a tabela admin_settings existe
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Verificar se a tabela site_content existe
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

-- 10. Função para logs de atividade
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

-- 11. Função para obter estatísticas do admin
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_users', (SELECT COUNT(*) FROM profiles),
        'active_users', (SELECT COUNT(*) FROM profiles WHERE is_active = true),
        'pending_users', (SELECT COUNT(*) FROM profiles WHERE user_type = 'pending'),
        'total_content', (SELECT COUNT(*) FROM site_content),
        'active_content', (SELECT COUNT(*) FROM site_content WHERE is_active = true),
        'recent_activity', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', id,
                    'user_email', user_email,
                    'action', action,
                    'details', details,
                    'timestamp', timestamp
                ) ORDER BY timestamp DESC
            ), '[]'::json)
            FROM activity_logs 
            WHERE timestamp >= NOW() - INTERVAL '7 days'
            LIMIT 50
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Inserir configurações padrão se não existirem
INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
('site_name', '"MoreThanMoney"', 'Nome do site'),
('site_description', '"Plataforma de Trading e Educação Financeira"', 'Descrição do site'),
('maintenance_mode', 'false', 'Modo de manutenção ativado/desativado'),
('registration_enabled', 'true', 'Registo de novos utilizadores ativado/desativado'),
('auto_approve_users', 'false', 'Aprovação automática de utilizadores ativada/desativada'),
('email_notifications', 'true', 'Notificações por email ativadas/desativadas'),
('default_user_role', '"member"', 'Role padrão para novos utilizadores')
ON CONFLICT (setting_key) DO NOTHING;

-- 13. Comentários finais
COMMENT ON TABLE profiles IS 'Tabela de perfis de utilizadores com autenticação completa';
COMMENT ON COLUMN profiles.is_verified IS 'Indica se o email do utilizador foi verificado';
COMMENT ON TABLE activity_logs IS 'Logs de atividade para sistema de administração';
COMMENT ON TABLE admin_settings IS 'Configurações do sistema de administração';
COMMENT ON TABLE site_content IS 'Conteúdo dinâmico do site gerido pelo admin';

-- ========================================
-- RESUMO DAS CORREÇÕES APLICADAS:
-- ========================================
-- ✅ Adicionada coluna is_verified à tabela profiles
-- ✅ Atualizadas todas as funções RPC para incluir is_verified
-- ✅ Corrigidas políticas RLS para melhor segurança
-- ✅ Criadas tabelas necessárias para sistema de admin
-- ✅ Configurações padrão inseridas
-- ✅ Funções de log e estatísticas criadas
-- ========================================
