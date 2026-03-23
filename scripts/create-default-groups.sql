-- =====================================================
-- SCRIPT: Criar Grupos Pré-definidos para App-Mobile
-- =====================================================
-- Este script cria os 4 grupos de chat pré-definidos:
-- - Social Chat, Crypto Chat, Forex Chat, Trade Chat

DO $$
DECLARE
  v_admin_id UUID;
  v_trade_chat_id UUID;
  v_crypto_chat_id UUID;
  v_forex_chat_id UUID;
  v_social_chat_id UUID;
BEGIN
  -- Tentar encontrar um admin primeiro
  SELECT u.id INTO v_admin_id
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE p.user_type = 'admin'
  LIMIT 1;
  
  -- Se não encontrar admin, usar o primeiro utilizador disponível
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- Criar Trade Chat
  INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
  VALUES ('Trade Chat', 'Discussões sobre trading e estratégias', TRUE, TRUE, v_admin_id)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_public = EXCLUDED.is_public,
    is_mobile_visible = EXCLUDED.is_mobile_visible,
    created_by = COALESCE(group_conversations.created_by, EXCLUDED.created_by);
  
  SELECT id INTO v_trade_chat_id FROM public.group_conversations WHERE name = 'Trade Chat' LIMIT 1;
  
  -- Criar Crypto Chat
  INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
  VALUES ('Crypto Chat', 'Conversas sobre criptomoedas e mercado', TRUE, TRUE, v_admin_id)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_public = EXCLUDED.is_public,
    is_mobile_visible = EXCLUDED.is_mobile_visible,
    created_by = COALESCE(group_conversations.created_by, EXCLUDED.created_by);
  
  SELECT id INTO v_crypto_chat_id FROM public.group_conversations WHERE name = 'Crypto Chat' LIMIT 1;
  
  -- Criar Forex Chat
  INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
  VALUES ('Forex Chat', 'Conversas sobre Forex e mercados de divisas', TRUE, TRUE, v_admin_id)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_public = EXCLUDED.is_public,
    is_mobile_visible = EXCLUDED.is_mobile_visible,
    created_by = COALESCE(group_conversations.created_by, EXCLUDED.created_by);
  
  SELECT id INTO v_forex_chat_id FROM public.group_conversations WHERE name = 'Forex Chat' LIMIT 1;
  
  -- Criar Social Chat
  INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
  VALUES ('Social Chat', 'Networking e conversas gerais', TRUE, TRUE, v_admin_id)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_public = EXCLUDED.is_public,
    is_mobile_visible = EXCLUDED.is_mobile_visible,
    created_by = COALESCE(group_conversations.created_by, EXCLUDED.created_by);
  
  SELECT id INTO v_social_chat_id FROM public.group_conversations WHERE name = 'Social Chat' LIMIT 1;
  
  -- Adicionar admin como membro admin de todos os grupos (se admin existe)
  IF v_admin_id IS NOT NULL THEN
    IF v_trade_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_trade_chat_id, v_admin_id, 'admin')
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
    
    IF v_crypto_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_crypto_chat_id, v_admin_id, 'admin')
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
    
    IF v_forex_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_forex_chat_id, v_admin_id, 'admin')
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
    
    IF v_social_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_social_chat_id, v_admin_id, 'admin')
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
    
    -- Adicionar todos os utilizadores existentes aos grupos públicos
    IF v_trade_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      SELECT v_trade_chat_id, u.id, 'member'
      FROM auth.users u
      WHERE u.id != v_admin_id
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
    
    IF v_crypto_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      SELECT v_crypto_chat_id, u.id, 'member'
      FROM auth.users u
      WHERE u.id != v_admin_id
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
    
    IF v_forex_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      SELECT v_forex_chat_id, u.id, 'member'
      FROM auth.users u
      WHERE u.id != v_admin_id
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
    
    IF v_social_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      SELECT v_social_chat_id, u.id, 'member'
      FROM auth.users u
      WHERE u.id != v_admin_id
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  RAISE NOTICE '✅ Grupos criados/atualizados:';
  RAISE NOTICE '   - Trade Chat: %', v_trade_chat_id;
  RAISE NOTICE '   - Crypto Chat: %', v_crypto_chat_id;
  RAISE NOTICE '   - Forex Chat: %', v_forex_chat_id;
  RAISE NOTICE '   - Social Chat: %', v_social_chat_id;
END $$;

-- Verificação final
SELECT 
  '✅ Grupos criados com sucesso!' as status,
  name,
  description,
  is_public,
  is_mobile_visible,
  (SELECT COUNT(*) FROM public.group_members WHERE group_id = group_conversations.id) as total_members
FROM public.group_conversations
WHERE name IN ('Trade Chat', 'Crypto Chat', 'Forex Chat', 'Social Chat')
ORDER BY name;




