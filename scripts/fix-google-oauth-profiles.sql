-- =====================================================
-- FIX: Criar perfis automaticamente para Google OAuth
-- =====================================================

-- 1. FUNÇÃO: Criar perfil automaticamente após signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserir novo perfil na tabela profiles
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    avatar_url,
    user_type,
    membership_level,
    package,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'member'),
    'basic',
    'basic',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. TRIGGER: Executar função após novo usuário ser criado
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. FUNÇÃO: Atualizar perfil quando metadata do auth mudar
CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar perfil quando metadata do Google OAuth mudar
  UPDATE public.profiles SET
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', profiles.full_name),
    avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', profiles.avatar_url),
    updated_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. TRIGGER: Executar função quando usuário for atualizado
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_user_metadata_update();

-- 5. CRIAR PERFIS PARA USUÁRIOS EXISTENTES SEM PERFIL
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  avatar_url,
  user_type,
  membership_level,
  package,
  is_active,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  split_part(u.email, '@', 1),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  'member',
  'basic',
  'basic',
  true,
  u.created_at,
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 6. VERIFICAÇÃO
SELECT 
  '✅ Triggers criados!' as status,
  COUNT(*) as usuarios_sem_perfil_corrigidos
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

SELECT 
  '✅ Perfis existentes' as status,
  COUNT(*) as total_perfis
FROM public.profiles;

-- 7. GARANTIR QUE RLS NÃO BLOQUEIA CRIAÇÃO DE PERFIS
-- Política para permitir inserção automática via trigger
DROP POLICY IF EXISTS "Sistema cria perfis automaticamente" ON public.profiles;
CREATE POLICY "Sistema cria perfis automaticamente"
ON public.profiles FOR INSERT
WITH CHECK (true);

-- Política para permitir atualização automática via trigger
DROP POLICY IF EXISTS "Sistema atualiza perfis automaticamente" ON public.profiles;
CREATE POLICY "Sistema atualiza perfis automaticamente"
ON public.profiles FOR UPDATE
USING (true);

