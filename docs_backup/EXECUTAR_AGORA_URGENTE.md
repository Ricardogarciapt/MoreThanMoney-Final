# 🚨 EXECUTAR AGORA - CORREÇÕES URGENTES

## ❌ **Problemas Detectados:**

1. ✅ **Google OAuth funcionando** (perfil criado: `ricardo.subtilgarcia@gmail.com`)
2. ❌ **Social posts não carrega:** `column social_posts.image_url does not exist`
3. ⚠️ **Protected page timeout de 3s** (mas funciona depois)

---

## 🔧 **SOLUÇÃO: Executar 2 SQLs no Supabase**

### 🔗 **Link direto:**
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql

---

## ✅ **SQL 1: Fix Social Posts Schema** (CRÍTICO!)

**Clica em "New query" → Cola isto:**

```sql
-- =====================================================
-- FIX: Adicionar colunas de mídia na tabela social_posts
-- =====================================================

-- 1. Adicionar colunas se não existirem
ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_social_posts_image_url 
ON public.social_posts(image_url) WHERE image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_video_url 
ON public.social_posts(video_url) WHERE video_url IS NOT NULL;

-- 3. Verificação
SELECT 
  '✅ Colunas adicionadas!' as status,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'social_posts' 
AND column_name IN ('image_url', 'video_url')
ORDER BY column_name;
```

**Clica em RUN** ✅

**Resultado esperado:**
```
✅ Colunas adicionadas!
image_url | text
video_url | text
```

---

## ✅ **SQL 2: Fix Google OAuth** (Acelerar login)

**Nova query → Cola isto:**

```sql
-- =====================================================
-- FIX: Criar perfis automaticamente para Google OAuth
-- =====================================================

-- 1. Função para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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

-- 2. Trigger após novo usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Corrigir usuários existentes sem perfil
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

-- 4. Políticas RLS para permitir sistema criar perfis
DROP POLICY IF EXISTS "Sistema cria perfis automaticamente" ON public.profiles;
CREATE POLICY "Sistema cria perfis automaticamente"
ON public.profiles FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema atualiza perfis automaticamente" ON public.profiles;
CREATE POLICY "Sistema atualiza perfis automaticamente"
ON public.profiles FOR UPDATE
USING (true);

-- 5. Verificação
SELECT 
  '✅ Triggers criados!' as status,
  COUNT(*) as usuarios_sem_perfil
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

**Clica em RUN** ✅

**Resultado esperado:**
```
✅ Triggers criados!
usuarios_sem_perfil: 0
```

---

## 🧪 **TESTAR AGORA:**

Depois de executar os 2 SQLs:

1. **Recarrega a página** (F5)
2. **Abre DevTools** (F12) → Console
3. **Vai ao app-mobile** → Tab Social

**Logs esperados:**
```
🔄 [SOCIAL FEED] Carregando posts do Supabase...
✅ [SOCIAL FEED] Posts carregados: 0
```

**NÃO deve aparecer:**
```
❌ column social_posts.image_url does not exist  ← Este erro deve sumir!
```

---

## ⏱️ **Tempo:** 2 minutos

---

## 🎯 **Depois de funcionar:**

1. Tenta criar um post com texto
2. Tenta criar um post com imagem
3. Tenta dar like
4. Tenta comentar

**Tudo deve funcionar! ✅**

---

**AGORA:** Executa os 2 SQLs no Supabase! 🚀

