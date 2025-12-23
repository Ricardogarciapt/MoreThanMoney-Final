-- ============================================
-- CRIAR USUÁRIO DO SISTEMA PARA POSTS AUTOMÁTICOS
-- ============================================
-- Este script cria um perfil especial "sistema@morethanmoney.pt"
-- que será usado para criar posts automáticos diários com
-- oportunidades DCA no feed social.
--
-- EXECUTAR NO: Supabase Dashboard > SQL Editor
-- ============================================

-- Inserir perfil do sistema (se não existir)
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  avatar_url,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'sistema@morethanmoney.pt',
  'MTM Sistema Automático',
  'https://api.dicebear.com/7.x/bottts/svg?seed=mtm-system&backgroundColor=D2A63C',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Confirmar criação
SELECT 
  id, 
  email, 
  full_name,
  created_at
FROM public.profiles 
WHERE email = 'sistema@morethanmoney.pt';

-- ============================================
-- NOTAS:
-- ============================================
-- 1. Este usuário NÃO tem acesso de login (não está em auth.users)
-- 2. Serve apenas para criar posts automáticos no feed
-- 3. Os posts aparecem como "MTM Sistema Automático"
-- 4. Avatar é um bot dourado
-- ============================================

