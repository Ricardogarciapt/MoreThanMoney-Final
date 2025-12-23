-- Adicionar coluna is_verified à tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Atualizar utilizadores existentes para is_verified = true se tiverem email confirmado
UPDATE profiles 
SET is_verified = true 
WHERE id IN (
    SELECT au.id::uuid 
    FROM auth.users au 
    WHERE au.email_confirmed_at IS NOT NULL
);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_verified 
ON profiles(is_verified);

-- Comentário
COMMENT ON COLUMN profiles.is_verified IS 'Indica se o email do utilizador foi verificado';

-- Verificar resultado
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_verified = true) as verified,
    COUNT(*) FILTER (WHERE is_verified = false) as not_verified
FROM profiles;
