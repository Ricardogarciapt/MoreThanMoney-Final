-- Primeiro, deletar todas as funções existentes
DROP FUNCTION IF EXISTS public.get_user_email_by_username(TEXT);
DROP FUNCTION IF EXISTS public.create_user_profile(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.is_admin(UUID);
DROP FUNCTION IF EXISTS public.get_trial_stats();
DROP FUNCTION IF EXISTS public.cleanup_expired_trials();

-- Agora criar as funções novamente

-- Função para buscar email por username
CREATE FUNCTION public.get_user_email_by_username(p_username TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT email 
    FROM public.profiles 
    WHERE username = p_username 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar perfil de usuário
CREATE FUNCTION public.create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_user_type TEXT DEFAULT 'member'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    user_type,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_email,
    p_full_name,
    COALESCE(p_username, SPLIT_PART(p_email, '@', 1)),
    p_user_type,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para atualizar perfil de usuário
CREATE FUNCTION public.update_user_profile(
  p_user_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_whatsapp TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    username = COALESCE(p_username, username),
    phone = COALESCE(p_phone, phone),
    whatsapp = COALESCE(p_whatsapp, whatsapp),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se usuário é admin
CREATE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT user_type = 'admin'
    FROM public.profiles
    WHERE id = p_user_id
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter estatísticas de usuários trial
CREATE FUNCTION public.get_trial_stats()
RETURNS TABLE(
  active_trials BIGINT,
  expired_trials BIGINT,
  total_guests BIGINT,
  total_trials BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE user_type = 'trial' AND (trial_expires_at IS NULL OR trial_expires_at > NOW())) as active_trials,
    COUNT(*) FILTER (WHERE user_type = 'trial' AND trial_expires_at IS NOT NULL AND trial_expires_at <= NOW()) as expired_trials,
    COUNT(*) FILTER (WHERE user_type = 'guest') as total_guests,
    COUNT(*) FILTER (WHERE user_type IN ('trial', 'guest')) as total_trials
  FROM public.profiles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para limpar trials expirados
CREATE FUNCTION public.cleanup_expired_trials()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.profiles
    WHERE user_type IN ('trial', 'guest')
    AND trial_expires_at IS NOT NULL
    AND trial_expires_at < NOW() - INTERVAL '30 days'
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION public.get_user_email_by_username(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_trials() TO authenticated;

