-- ========================================
-- FUNÇÕES RPC NECESSÁRIAS PARA O AUTH-SERVICE
-- ========================================

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

-- Função para buscar perfil do usuário
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
        p.created_at,
        p.updated_at
    FROM profiles p
    WHERE p.id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Função para criar perfil do usuário
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
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
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
        updated_at = NOW();

    -- Retornar o perfil criado/atualizado
    SELECT to_jsonb(p.*) INTO result
    FROM profiles p
    WHERE p.id = user_id_param;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar perfil do usuário
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
        updated_at = NOW()
    WHERE id = user_id_param;

    -- Retornar o perfil atualizado
    SELECT to_jsonb(p.*) INTO result
    FROM profiles p
    WHERE p.id = user_id_param;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
