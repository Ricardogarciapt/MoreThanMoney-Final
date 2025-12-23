-- ===================================================================
-- Atualizar Liliana Faria para VIP
-- ===================================================================
-- Email: liliana.icfaria@gmail.com
-- Ação: Promover para VIP com categoria VIP
-- Data: Dezembro 2024
-- ===================================================================

UPDATE profiles
SET 
  user_type = 'vip',
  member_category = 'vip',
  updated_at = NOW()
WHERE email = 'liliana.icfaria@gmail.com'
RETURNING 
  id, 
  email, 
  full_name, 
  user_type, 
  member_category,
  updated_at;

