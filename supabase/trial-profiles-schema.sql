-- ========================================
-- PERFIS DE TRIAL E APRESENTAÇÃO
-- ========================================

-- Adicionar novos tipos de utilizador
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_user_type_check 
CHECK (user_type IN ('member', 'admin', 'pending', 'guest', 'presentation'));

-- Adicionar coluna de expiração de trial
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para rastrear se o trial expirou
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_expired BOOLEAN DEFAULT false;

-- Função para criar utilizador Guest (7 dias)
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
    -- Calcular data de expiração (7 dias)
    expiry_date := NOW() + INTERVAL '7 days';
    
    -- Gerar ID
    new_user_id := gen_random_uuid();
    
    -- Inserir perfil Guest
    INSERT INTO profiles (
        id,
        email,
        username,
        full_name,
        user_type,
        membership_level,
        is_active,
        is_verified,
        trial_expires_at,
        trial_expired,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        p_email,
        p_username,
        p_full_name,
        'guest',
        'basic',
        true,
        true,
        expiry_date,
        false,
        NOW(),
        NOW()
    );
    
    -- Retornar resultado
    SELECT json_build_object(
        'id', new_user_id,
        'email', p_email,
        'username', p_username,
        'user_type', 'guest',
        'trial_expires_at', expiry_date,
        'days_remaining', 7
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar utilizador Apresentação (48 horas)
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
    -- Calcular data de expiração (48 horas)
    expiry_date := NOW() + INTERVAL '48 hours';
    
    -- Gerar ID
    new_user_id := gen_random_uuid();
    
    -- Inserir perfil Apresentação
    INSERT INTO profiles (
        id,
        email,
        username,
        full_name,
        user_type,
        membership_level,
        is_active,
        is_verified,
        trial_expires_at,
        trial_expired,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        p_email,
        p_username,
        p_full_name,
        'presentation',
        'basic',
        true,
        true,
        expiry_date,
        false,
        NOW(),
        NOW()
    );
    
    -- Retornar resultado
    SELECT json_build_object(
        'id', new_user_id,
        'email', p_email,
        'username', p_username,
        'user_type', 'presentation',
        'trial_expires_at', expiry_date,
        'hours_remaining', 48
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar e expirar trials automaticamente
CREATE OR REPLACE FUNCTION check_and_expire_trials()
RETURNS JSON AS $$
DECLARE
    expired_count INTEGER;
    result JSON;
BEGIN
    -- Atualizar utilizadores cujo trial expirou
    WITH expired_users AS (
        UPDATE profiles
        SET 
            is_active = false,
            trial_expired = true,
            updated_at = NOW()
        WHERE 
            user_type IN ('guest', 'presentation')
            AND trial_expires_at < NOW()
            AND trial_expired = false
        RETURNING id, email, user_type, trial_expires_at
    )
    SELECT COUNT(*), json_agg(expired_users.*) 
    INTO expired_count, result
    FROM expired_users;
    
    -- Retornar resultado
    RETURN json_build_object(
        'expired_count', COALESCE(expired_count, 0),
        'expired_users', COALESCE(result, '[]'::json),
        'checked_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter informações de trial de um utilizador
CREATE OR REPLACE FUNCTION get_trial_info(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    trial_info JSON;
BEGIN
    SELECT json_build_object(
        'user_type', user_type,
        'trial_expires_at', trial_expires_at,
        'trial_expired', trial_expired,
        'is_active', is_active,
        'days_remaining', CASE 
            WHEN trial_expires_at IS NOT NULL AND trial_expires_at > NOW() 
            THEN EXTRACT(DAY FROM (trial_expires_at - NOW()))
            ELSE 0
        END,
        'hours_remaining', CASE 
            WHEN trial_expires_at IS NOT NULL AND trial_expires_at > NOW() 
            THEN EXTRACT(HOUR FROM (trial_expires_at - NOW()))
            ELSE 0
        END,
        'minutes_remaining', CASE 
            WHEN trial_expires_at IS NOT NULL AND trial_expires_at > NOW() 
            THEN EXTRACT(MINUTE FROM (trial_expires_at - NOW()))
            ELSE 0
        END
    ) INTO trial_info
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN trial_info;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para renovar trial
CREATE OR REPLACE FUNCTION renew_trial(
    p_user_id UUID,
    p_days INTEGER DEFAULT 7
)
RETURNS JSON AS $$
DECLARE
    new_expiry TIMESTAMP WITH TIME ZONE;
    result JSON;
BEGIN
    -- Calcular nova data de expiração
    new_expiry := NOW() + (p_days || ' days')::INTERVAL;
    
    -- Atualizar perfil
    UPDATE profiles
    SET 
        trial_expires_at = new_expiry,
        trial_expired = false,
        is_active = true,
        updated_at = NOW()
    WHERE id = p_user_id
    AND user_type IN ('guest', 'presentation')
    RETURNING json_build_object(
        'id', id,
        'email', email,
        'trial_expires_at', trial_expires_at,
        'days_added', p_days
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para converter trial em membro permanente
CREATE OR REPLACE FUNCTION convert_trial_to_member(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    UPDATE profiles
    SET 
        user_type = 'member',
        trial_expires_at = NULL,
        trial_expired = false,
        is_active = true,
        updated_at = NOW()
    WHERE id = p_user_id
    AND user_type IN ('guest', 'presentation')
    RETURNING json_build_object(
        'id', id,
        'email', email,
        'user_type', user_type,
        'converted_at', NOW()
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para verificar expiração em cada acesso
CREATE OR REPLACE FUNCTION trigger_check_trial_expiration()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for trial e já expirou, marcar como inativo
    IF NEW.user_type IN ('guest', 'presentation') 
       AND NEW.trial_expires_at < NOW() 
       AND NEW.trial_expired = false THEN
        NEW.is_active := false;
        NEW.trial_expired := true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS check_trial_expiration_trigger ON profiles;
CREATE TRIGGER check_trial_expiration_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_trial_expiration();

-- Criar índice para melhor performance em queries de expiração
CREATE INDEX IF NOT EXISTS idx_profiles_trial_expiry 
ON profiles(trial_expires_at) 
WHERE user_type IN ('guest', 'presentation');

CREATE INDEX IF NOT EXISTS idx_profiles_user_type 
ON profiles(user_type);

-- Comentários
COMMENT ON COLUMN profiles.trial_expires_at IS 'Data de expiração para contas Guest (7 dias) e Apresentação (48h)';
COMMENT ON COLUMN profiles.trial_expired IS 'Indica se o trial já expirou';

-- Inserir exemplos de configuração
INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
('guest_trial_days', '7', 'Duração do trial Guest em dias'),
('presentation_trial_hours', '48', 'Duração do trial Apresentação em horas'),
('trial_auto_expire', 'true', 'Expirar trials automaticamente')
ON CONFLICT (setting_key) DO NOTHING;

-- ========================================
-- RESUMO DAS FUNCIONALIDADES
-- ========================================
-- ✅ Novo user_type: 'guest' (7 dias)
-- ✅ Novo user_type: 'presentation' (48 horas)
-- ✅ Coluna trial_expires_at para rastrear expiração
-- ✅ Coluna trial_expired para marcar expirados
-- ✅ Função create_guest_user()
-- ✅ Função create_presentation_user()
-- ✅ Função check_and_expire_trials()
-- ✅ Função get_trial_info()
-- ✅ Função renew_trial()
-- ✅ Função convert_trial_to_member()
-- ✅ Trigger automático de expiração
-- ✅ Índices para performance
-- ========================================
