-- =====================================================
-- SCRIPT: Sistema de Grupos de Conversa
-- =====================================================

-- 1. Tabela de grupos de conversa
CREATE TABLE IF NOT EXISTS public.group_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  is_mobile_visible BOOLEAN DEFAULT FALSE, -- Se aparece na tab Chats do app-mobile
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Permite NULL para grupos pré-definidos
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar constraint UNIQUE em name se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'group_conversations_name_key'
    AND conrelid = 'public.group_conversations'::regclass
  ) THEN
    ALTER TABLE public.group_conversations 
    ADD CONSTRAINT group_conversations_name_key UNIQUE (name);
  END IF;
END $$;

-- 2. Tabela de membros do grupo
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- 3. Tabela de mensagens de grupo (reutiliza a tabela messages com conversation_id NULL e group_id)
-- Vamos adicionar coluna group_id à tabela messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'messages'
    AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.messages
    ADD COLUMN group_id UUID REFERENCES public.group_conversations(id) ON DELETE CASCADE;
    
    -- Adicionar constraint: mensagem deve ter conversation_id OU group_id, não ambos
    ALTER TABLE public.messages
    ADD CONSTRAINT messages_conversation_or_group_check
    CHECK (
      (conversation_id IS NOT NULL AND group_id IS NULL) OR
      (conversation_id IS NULL AND group_id IS NOT NULL)
    );
  END IF;
END $$;

-- 4. Índices para grupos
CREATE INDEX IF NOT EXISTS idx_group_conversations_created_by ON public.group_conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_group_conversations_mobile_visible ON public.group_conversations(is_mobile_visible) WHERE is_mobile_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_group_conversations_last_message ON public.group_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON public.messages(group_id) WHERE group_id IS NOT NULL;

-- 5. Função para atualizar last_message_at de grupos
CREATE OR REPLACE FUNCTION update_group_last_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE public.group_conversations
    SET last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger para atualizar last_message_at de grupos
DROP TRIGGER IF EXISTS trigger_update_group_last_message ON public.messages;
CREATE TRIGGER trigger_update_group_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.group_id IS NOT NULL)
  EXECUTE FUNCTION update_group_last_message();

-- 7. Trigger para updated_at de grupos
DROP TRIGGER IF EXISTS trigger_update_group_conversations_updated_at ON public.group_conversations;
CREATE TRIGGER trigger_update_group_conversations_updated_at
  BEFORE UPDATE ON public.group_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 8. RLS Policies para grupos
ALTER TABLE public.group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Políticas para group_conversations
DROP POLICY IF EXISTS "Anyone can view public groups" ON public.group_conversations;
CREATE POLICY "Anyone can view public groups" ON public.group_conversations
  FOR SELECT
  USING (
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_conversations.id
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can view their groups" ON public.group_conversations;
CREATE POLICY "Members can view their groups" ON public.group_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_conversations.id
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.group_conversations;
CREATE POLICY "Authenticated users can create groups" ON public.group_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL); -- Permite grupos sem created_by (pré-definidos)

DROP POLICY IF EXISTS "Admins can update their groups" ON public.group_conversations;
CREATE POLICY "Admins can update their groups" ON public.group_conversations
  FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_conversations.id
      AND user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- Políticas para group_members
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_members;
CREATE POLICY "Users can view members of their groups" ON public.group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;
CREATE POLICY "Group admins can add members" ON public.group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_members.group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Users can join public groups" ON public.group_members;
CREATE POLICY "Users can join public groups" ON public.group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
      AND is_public = TRUE
    )
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
CREATE POLICY "Users can leave groups" ON public.group_members
  FOR DELETE
  USING (user_id = auth.uid());

-- Atualizar política de mensagens para incluir grupos
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT
  USING (
    -- Mensagens de conversas diretas
    (
      conversation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = messages.conversation_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
      )
    )
    OR
    -- Mensagens de grupos
    (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = messages.group_id
        AND user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
CREATE POLICY "Users can send messages in their conversations" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- Mensagens de conversas diretas
      (
        conversation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.conversations
          WHERE id = conversation_id
          AND (user1_id = auth.uid() OR user2_id = auth.uid())
        )
      )
      OR
      -- Mensagens de grupos
      (
        group_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.group_members
          WHERE group_id = group_id
          AND user_id = auth.uid()
        )
      )
    )
  );

-- 9. Criar grupos pré-definidos para app-mobile
DO $$
DECLARE
  v_admin_id UUID;
  v_trade_chat_id UUID;
  v_crypto_chat_id UUID;
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
  
  -- Criar grupos (com ou sem created_by)
  IF v_admin_id IS NOT NULL THEN
    -- Criar grupos com created_by válido
    INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
    VALUES
      ('Trade Chat', 'Discussões sobre trading e estratégias', TRUE, TRUE, v_admin_id),
      ('Crypto Chat', 'Conversas sobre criptomoedas e mercado', TRUE, TRUE, v_admin_id),
      ('Social Chat', 'Networking e conversas gerais', TRUE, TRUE, v_admin_id)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      is_public = EXCLUDED.is_public,
      is_mobile_visible = EXCLUDED.is_mobile_visible
    RETURNING id INTO v_trade_chat_id;
    
    -- Obter IDs dos grupos criados/atualizados
    SELECT id INTO v_trade_chat_id FROM public.group_conversations WHERE name = 'Trade Chat' LIMIT 1;
    SELECT id INTO v_crypto_chat_id FROM public.group_conversations WHERE name = 'Crypto Chat' LIMIT 1;
    SELECT id INTO v_social_chat_id FROM public.group_conversations WHERE name = 'Social Chat' LIMIT 1;
    
    -- Adicionar admin como membro admin de todos os grupos
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
    
    IF v_social_chat_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_social_chat_id, v_admin_id, 'admin')
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
    
    -- Adicionar todos os utilizadores existentes aos grupos públicos
    INSERT INTO public.group_members (group_id, user_id, role)
    SELECT v_trade_chat_id, u.id, 'member'
    FROM auth.users u
    WHERE u.id != v_admin_id
    ON CONFLICT (group_id, user_id) DO NOTHING;
    
    INSERT INTO public.group_members (group_id, user_id, role)
    SELECT v_crypto_chat_id, u.id, 'member'
    FROM auth.users u
    WHERE u.id != v_admin_id
    ON CONFLICT (group_id, user_id) DO NOTHING;
    
    INSERT INTO public.group_members (group_id, user_id, role)
    SELECT v_social_chat_id, u.id, 'member'
    FROM auth.users u
    WHERE u.id != v_admin_id
    ON CONFLICT (group_id, user_id) DO NOTHING;
  ELSE
    -- Criar grupos sem created_by (será atualizado depois quando houver utilizadores)
    INSERT INTO public.group_conversations (name, description, is_public, is_mobile_visible, created_by)
    VALUES
      ('Trade Chat', 'Discussões sobre trading e estratégias', TRUE, TRUE, NULL),
      ('Crypto Chat', 'Conversas sobre criptomoedas e mercado', TRUE, TRUE, NULL),
      ('Social Chat', 'Networking e conversas gerais', TRUE, TRUE, NULL)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      is_public = EXCLUDED.is_public,
      is_mobile_visible = EXCLUDED.is_mobile_visible;
  END IF;
END $$;

-- Verificação
SELECT 
  '✅ Sistema de grupos criado!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'group_conversations') as groups_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'group_members') as members_table,
  (SELECT COUNT(*) FROM public.group_conversations WHERE is_mobile_visible = TRUE) as mobile_groups;

