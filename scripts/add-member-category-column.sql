-- ========================================
-- ADICIONAR COLUNA member_category
-- ========================================

-- Adicionar coluna member_category se não existir
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS member_category TEXT DEFAULT 'standard' 
CHECK (member_category IN ('standard', 'iq', 'skool', 'vip', 'inactive'));

-- Adicionar comentário
COMMENT ON COLUMN profiles.member_category IS 'Categoria do membro: standard (padrão), iq (Membro IQ), skool (Membro Skool), vip (VIP), inactive (Inativo)';

-- Atualizar constraint de user_type para incluir todos os tipos
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_user_type_check 
CHECK (user_type IN ('member', 'admin', 'pending', 'guest', 'presentation', 'inactive'));

-- Nota: VIP não é user_type, mas member_category='vip'
-- user_type='member' + member_category='vip' = VIP

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_member_category ON profiles(member_category);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type_category ON profiles(user_type, member_category);

-- ========================================
-- NOTAS DE USO
-- ========================================
-- member_category funciona em conjunto com user_type:
-- - user_type='member' + member_category='iq' → Membro IQ
-- - user_type='member' + member_category='skool' → Membro Skool  
-- - user_type='member' + member_category='vip' → Membro VIP
-- - user_type='inactive' → Sem acesso premium
-- - user_type='guest' → Trial 7 dias
-- - user_type='presentation' → Demo 48h

