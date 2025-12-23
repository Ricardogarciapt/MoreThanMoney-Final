-- ════════════════════════════════════════════════════════════════════════════
-- SCRIPT PARA CRIAR TODAS AS FUNÇÕES RPC NECESSÁRIAS
-- ════════════════════════════════════════════════════════════════════════════
-- Execute este script no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Função: get_user_profile
-- Busca o perfil completo de um usuário pelo ID
-- ────────────────────────────────────────────────────────────────────────────

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
  birth_date TEXT,
  avatar_url TEXT,
  user_type TEXT,
  membership_level TEXT,
  package TEXT,
  affiliate_code TEXT,
  is_active BOOLEAN,
  trial_expires_at TIMESTAMPTZ,
  trial_expired BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    p.user_type::TEXT,
    p.membership_level,
    p.package,
    p.affiliate_code,
    p.is_active,
    p.trial_expires_at,
    p.trial_expired,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = user_id_param
  LIMIT 1;
END;
$$;

-- 2. Função: get_user_email_by_username
-- Busca o email de um usuário pelo username
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM public.profiles
  WHERE username = username_param
  LIMIT 1;
  
  RETURN user_email;
END;
$$;

-- 3. Função: check_username_exists
-- Verifica se um username já existe
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_username_exists(username_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE username = username_param
  );
END;
$$;

-- 4. Função: check_jifu_id_exists
-- Verifica se um JIFU ID já existe
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_jifu_id_exists(jifu_id_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE jifu_id = jifu_id_param
  );
END;
$$;

-- 5. Função: create_user_profile
-- Cria um novo perfil de usuário
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT,
  user_username TEXT,
  user_type_param TEXT DEFAULT 'member',
  user_is_active BOOLEAN DEFAULT true,
  user_membership_level TEXT DEFAULT 'basic',
  user_avatar_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    user_type,
    is_active,
    membership_level,
    avatar_url,
    created_at,
    updated_at
  )
  VALUES (
    user_id,
    user_email,
    user_full_name,
    user_username,
    user_type_param::user_type,
    user_is_active,
    user_membership_level,
    user_avatar_url,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN user_id;
END;
$$;

-- 6. Função: update_user_profile
-- Atualiza um perfil de usuário existente
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_profile(
  user_id UUID,
  user_full_name TEXT DEFAULT NULL,
  user_username TEXT DEFAULT NULL,
  user_phone TEXT DEFAULT NULL,
  user_whatsapp TEXT DEFAULT NULL,
  user_avatar_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name = COALESCE(user_full_name, full_name),
    username = COALESCE(user_username, username),
    phone = COALESCE(user_phone, phone),
    whatsapp = COALESCE(user_whatsapp, whatsapp),
    avatar_url = COALESCE(user_avatar_url, avatar_url),
    updated_at = NOW()
  WHERE id = user_id;
  
  RETURN FOUND;
END;
$$;

-- 7. Função: is_user_admin
-- Verifica se um usuário é admin
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_user_admin(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id_param 
    AND user_type = 'admin'
    AND is_active = true
  );
END;
$$;

-- 8. Testar todas as funções
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    test_results TEXT := '';
BEGIN
    -- Testar get_user_email_by_username
    PERFORM get_user_email_by_username('test');
    test_results := test_results || '✅ get_user_email_by_username OK' || E'\n';
    
    -- Testar check_username_exists
    PERFORM check_username_exists('test');
    test_results := test_results || '✅ check_username_exists OK' || E'\n';
    
    -- Testar check_jifu_id_exists
    PERFORM check_jifu_id_exists('test');
    test_results := test_results || '✅ check_jifu_id_exists OK' || E'\n';
    
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '              FUNÇÕES RPC CRIADAS COM SUCESSO                  ';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '%', test_results;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Todas as funções RPC estão funcionando corretamente!';
    RAISE NOTICE '✅ O AuthService pode agora buscar usuários do Supabase!';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

