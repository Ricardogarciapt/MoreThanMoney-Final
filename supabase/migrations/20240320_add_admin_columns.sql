-- Adicionar novas colunas à tabela profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_login_attempt TIMESTAMP WITH TIME ZONE;

-- Criar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_profiles_user_type_is_active ON profiles(user_type, is_active);

-- Atualizar registros existentes
UPDATE profiles
SET is_active = true
WHERE is_active IS NULL;

-- Criar função para atualizar último login
CREATE OR REPLACE FUNCTION update_last_login(user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE profiles
    SET last_login = NOW(),
        login_attempts = 0
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar função para registrar tentativa de login
CREATE OR REPLACE FUNCTION record_login_attempt(user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE profiles
    SET login_attempts = login_attempts + 1,
        last_login_attempt = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION update_last_login(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt(UUID) TO authenticated; 