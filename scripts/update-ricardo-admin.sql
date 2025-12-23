-- ===================================================================
-- Atualizar Ricardo Garcia para Admin
-- ===================================================================
-- Email: ricardogarciapt@proton.me
-- Ação: Promover para Admin
-- Data: Dezembro 2024
-- ===================================================================

UPDATE profiles
SET 
  user_type = 'admin',
  member_category = 'standard',
  updated_at = NOW()
WHERE email = 'ricardogarciapt@proton.me'
RETURNING 
  id, 
  email, 
  full_name, 
  user_type, 
  member_category,
  updated_at;

