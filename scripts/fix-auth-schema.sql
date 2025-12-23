-- ============================================
-- FIX AUTH SCHEMA - Google OAuth e Profiles
-- ============================================
-- Este script garante que o schema de autenticação
-- está correto para Google OAuth e criação automática de perfis

-- 1. Garantir que a tabela profiles existe com campos corretos
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT,
      full_name TEXT,
      username TEXT UNIQUE,
      avatar_url TEXT,
      user_type TEXT DEFAULT 'member' CHECK (user_type IN ('admin', 'member', 'trial', 'guest', 'pending')),
      member_category TEXT DEFAULT 'standard',
      is_active BOOLEAN DEFAULT true,
      phone TEXT,
      whatsapp TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- 2. Garantir índices
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);
CREATE INDEX IF NOT EXISTS profiles_user_type_idx ON public.profiles(user_type);
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles(is_active);

-- 3. Função para criar perfil automaticamente após signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_value TEXT;
BEGIN
  -- Gerar username único
  username_value := COALESCE(
    LOWER(REGEXP_REPLACE(NEW.raw_user_meta_data->>'full_name', '[^a-zA-Z0-9]', '', 'g')),
    LOWER(REGEXP_REPLACE(NEW.raw_user_meta_data->>'name', '[^a-zA-Z0-9]', '', 'g')),
    SPLIT_PART(NEW.email, '@', 1),
    'user' || EXTRACT(EPOCH FROM NOW())::TEXT
  );
  
  -- Garantir que username é único
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_value) LOOP
    username_value := username_value || '_' || FLOOR(RANDOM() * 1000)::TEXT;
  END LOOP;
  
  -- Criar perfil
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    avatar_url,
    user_type,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      'Utilizador'
    ),
    username_value,
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    'member',
    true,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Se já existe, apenas atualizar campos atualizáveis
    UPDATE public.profiles
    SET
      email = NEW.email,
      full_name = COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        full_name
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture',
        avatar_url
      ),
      updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao criar perfil para usuário %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger para criar perfil automaticamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. RLS Policies para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: Utilizadores podem ver seu próprio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Política: Utilizadores podem atualizar seu próprio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Política: Público pode ver perfis ativos (opcional, para listagens)
DROP POLICY IF EXISTS "Public can view active profiles" ON public.profiles;
CREATE POLICY "Public can view active profiles"
  ON public.profiles FOR SELECT
  USING (is_active = true);

-- Política: Service role pode fazer tudo (para API routes)
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;
CREATE POLICY "Service role can manage profiles"
  ON public.profiles FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 6. Função para verificar se utilizador é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_type = 'admin'
      AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Comentários
COMMENT ON TABLE public.profiles IS 'Perfis de utilizadores do sistema';
COMMENT ON FUNCTION public.handle_new_user() IS 'Cria perfil automaticamente após signup';
COMMENT ON FUNCTION public.is_admin() IS 'Verifica se utilizador atual é admin ativo';

-- ============================================
-- RESUMO
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Schema de autenticação configurado:';
  RAISE NOTICE '  - Tabela profiles criada/verificada';
  RAISE NOTICE '  - Trigger de criação automática de perfil ativo';
  RAISE NOTICE '  - RLS policies configuradas';
  RAISE NOTICE '  - Função is_admin() criada';
  RAISE NOTICE '';
  RAISE NOTICE '📋 PRÓXIMOS PASSOS:';
  RAISE NOTICE '1. Verificar configuração Google OAuth no Supabase Dashboard';
  RAISE NOTICE '2. Adicionar redirect URLs autorizadas:';
  RAISE NOTICE '   - http://localhost:3000/auth/callback (dev)';
  RAISE NOTICE '   - https://www.morethanmoney.pt/auth/callback (prod)';
  RAISE NOTICE '3. Testar login com Google';
END $$;
