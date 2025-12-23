-- Criar apenas as funções que NÃO existem (sem deletar nada)

-- Função para verificar se usuário é admin (se não existir)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
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

-- Função para obter estatísticas de usuários trial (se não existir)
CREATE OR REPLACE FUNCTION public.get_trial_stats()
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

-- Função para limpar trials expirados (se não existir)
CREATE OR REPLACE FUNCTION public.cleanup_expired_trials()
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

-- Conceder permissões (safe para executar mesmo que já existam)
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_trials() TO authenticated;
