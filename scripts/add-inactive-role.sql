-- ============================================
-- ADICIONAR ROLE "INATIVO" AO SISTEMA
-- ============================================
-- Usuários inativos têm acesso apenas a:
-- - Páginas desprotegidas (landing, login, register)
-- - /fast-start-jifu (início rápido)
-- ============================================

-- 0. PRIMEIRO: Verificar e corrigir valores existentes inválidos
-- Atualizar NULL para 'guest' (valor padrão)
UPDATE public.profiles
SET user_type = 'guest'
WHERE user_type IS NULL;

-- Atualizar valores inválidos para 'guest'
UPDATE public.profiles
SET user_type = 'guest'
WHERE user_type NOT IN ('admin', 'member', 'guest', 'vip', 'trial');

-- 1. Agora podemos remover o constraint antigo
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_user_type_check;

-- 2. Adicionar novo constraint com 'inactive' incluído
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_type_check
CHECK (user_type IN ('admin', 'member', 'guest', 'vip', 'trial', 'inactive'));

-- 2. Adicionar coluna de motivo de inativação (opcional)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS inactive_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inactive_since TIMESTAMPTZ DEFAULT NULL;

-- 3. Criar função para marcar usuário como inativo
CREATE OR REPLACE FUNCTION mark_user_inactive(
  user_id_param UUID,
  reason_param TEXT DEFAULT 'Sem acesso ativo'
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET 
    user_type = 'inactive',
    is_active = FALSE,
    inactive_reason = reason_param,
    inactive_since = NOW(),
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Criar função para reativar usuário
CREATE OR REPLACE FUNCTION reactivate_user(
  user_id_param UUID,
  new_user_type TEXT DEFAULT 'guest'
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET 
    user_type = new_user_type,
    is_active = TRUE,
    inactive_reason = NULL,
    inactive_since = NULL,
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Criar view para listar usuários inativos
CREATE OR REPLACE VIEW inactive_users AS
SELECT 
  id,
  email,
  full_name,
  inactive_reason,
  inactive_since,
  created_at,
  updated_at
FROM public.profiles
WHERE user_type = 'inactive'
ORDER BY inactive_since DESC;

-- 6. Comentários (documentação)
COMMENT ON COLUMN public.profiles.inactive_reason IS 'Motivo da inativação do usuário';
COMMENT ON COLUMN public.profiles.inactive_since IS 'Data/hora em que o usuário foi marcado como inativo';

-- 7. Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON public.profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_profiles_inactive ON public.profiles(user_type, inactive_since) WHERE user_type = 'inactive';

-- ============================================
-- EXEMPLO DE USO:
-- ============================================
-- Marcar usuário como inativo:
-- SELECT mark_user_inactive('user-uuid-aqui', 'Assinatura expirada');
--
-- Reativar usuário:
-- SELECT reactivate_user('user-uuid-aqui', 'member');
--
-- Listar inativos:
-- SELECT * FROM inactive_users;
-- ============================================

