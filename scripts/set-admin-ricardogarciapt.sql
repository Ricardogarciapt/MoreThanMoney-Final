-- ====================================================================
-- CONFIGURAR ricardogarciapt@proton.me COMO ADMIN
-- ====================================================================
-- Este script garante que o email ricardogarciapt@proton.me seja admin
-- Data: 26 de Outubro de 2025
-- ====================================================================

-- 1. Verificar perfil atual
SELECT 
  id,
  email,
  user_type,
  member_category,
  is_active,
  created_at
FROM profiles
WHERE email = 'ricardogarciapt@proton.me';

-- 2. Atualizar para admin (se existir)
UPDATE profiles 
SET 
  user_type = 'admin',
  member_category = 'vip',
  is_active = true,
  updated_at = NOW()
WHERE email = 'ricardogarciapt@proton.me';

-- 3. Se não existir, criar (com ID do auth.users se tiver feito login)
-- NOTA: Apenas executar se o UPDATE acima retornar 0 linhas afetadas
-- INSERT INTO profiles (
--   id,
--   email,
--   full_name,
--   username,
--   user_type,
--   member_category,
--   is_active,
--   created_at,
--   updated_at
-- )
-- SELECT 
--   id,
--   email,
--   COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', 'Ricardo Garcia'),
--   'ricardogarcia',
--   'admin',
--   'vip',
--   true,
--   NOW(),
--   NOW()
-- FROM auth.users
-- WHERE email = 'ricardogarciapt@proton.me'
-- ON CONFLICT (id) DO NOTHING;

-- 4. Verificar ricardo.subtilgarcia@gmail.com também
UPDATE profiles 
SET 
  user_type = 'admin',
  member_category = 'vip',
  is_active = true,
  updated_at = NOW()
WHERE email = 'ricardo.subtilgarcia@gmail.com';

-- 5. Verificação final
SELECT 
  email,
  user_type,
  member_category,
  is_active
FROM profiles
WHERE email IN ('ricardogarciapt@proton.me', 'ricardo.subtilgarcia@gmail.com')
ORDER BY email;

-- 6. Resultado esperado
DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ Emails configurados como ADMIN:';
  RAISE NOTICE '   - ricardogarciapt@proton.me';
  RAISE NOTICE '   - ricardo.subtilgarcia@gmail.com';
  RAISE NOTICE '====================================';
  RAISE NOTICE '📊 Verificar resultado acima';
  RAISE NOTICE '🔐 Ambos devem ter user_type = admin';
  RAISE NOTICE '====================================';
END $$;



