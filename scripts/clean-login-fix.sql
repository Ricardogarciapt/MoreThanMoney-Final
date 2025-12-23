-- Script limpo e seguro para corrigir problemas de login
-- Remove todas as políticas antigas e cria apenas as necessárias

-- 1. Garantir que a tabela users tem as colunas necessárias
DO $$
BEGIN
  -- Adicionar coluna user_type se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'user_type') THEN
    ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT 'member';
  END IF;

  -- Adicionar coluna is_active se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'is_active') THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;

  -- Adicionar coluna username se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'username') THEN
    ALTER TABLE users ADD COLUMN username TEXT;
  END IF;

  -- Adicionar coluna full_name se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'full_name') THEN
    ALTER TABLE users ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- 2. Atualizar dados existentes para garantir consistência
UPDATE users 
SET 
  user_type = COALESCE(user_type, 
    CASE 
      WHEN role = 'admin' THEN 'admin'
      WHEN role = 'affiliate' THEN 'affiliate'
      ELSE 'member'
    END
  ),
  is_active = COALESCE(is_active, true),
  username = COALESCE(username, email),
  full_name = COALESCE(full_name, email)
WHERE user_type IS NULL OR is_active IS NULL OR username IS NULL OR full_name IS NULL;

-- 3. Remover TODAS as políticas RLS da tabela users de forma dinâmica
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Remover todas as políticas existentes na tabela users
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
    END LOOP;
END $$;

-- 4. Criar políticas RLS corretas e seguras
-- Política para usuários verem apenas seu próprio perfil
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Política para usuários atualizarem apenas seu próprio perfil
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE
    USING (auth.uid() = id);

-- Política para admins verem todos os usuários
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR user_type = 'admin')
            AND is_active = true
        )
    );

-- Política para admins atualizarem todos os usuários
CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR user_type = 'admin')
            AND is_active = true
        )
    );

-- Política para inserção de novos usuários (apenas durante registro)
CREATE POLICY "Allow user registration" ON users
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 5. Garantir que RLS está habilitado
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 6. Verificar e corrigir usuários admin
UPDATE users 
SET 
  role = 'admin',
  user_type = 'admin',
  is_active = true
WHERE email IN ('admin@morethanmoney.pt', 'admin@morethanmoney.com', 'ricardogarciapt@proton.me')
AND (role != 'admin' OR user_type != 'admin' OR is_active != true);

-- 7. Verificar políticas criadas
SELECT 
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname; 