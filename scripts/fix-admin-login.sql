-- ════════════════════════════════════════════════════════════════════════════
-- SCRIPT PARA CORRIGIR LOGIN DO ADMIN
-- ════════════════════════════════════════════════════════════════════════════
-- Este script garante que o admin ricardogarciapt@proton.me pode fazer login
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Verificar e atualizar o perfil do admin
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    admin_user_id UUID;
BEGIN
    -- Buscar o ID do usuário admin no auth.users
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = 'ricardogarciapt@proton.me'
    LIMIT 1;

    IF admin_user_id IS NOT NULL THEN
        -- Atualizar ou inserir perfil do admin
        INSERT INTO public.profiles (
            id,
            email,
            username,
            full_name,
            user_type,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            admin_user_id,
            'ricardogarciapt@proton.me',
            'ricardogarciapt',
            'Ricardo Garcia',
            'admin',
            true,
            NOW(),
            NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET
            email = 'ricardogarciapt@proton.me',
            username = 'ricardogarciapt',
            full_name = 'Ricardo Garcia',
            user_type = 'admin',
            is_active = true,
            updated_at = NOW();

        RAISE NOTICE '✅ Perfil do admin atualizado com sucesso!';
        RAISE NOTICE 'User ID: %', admin_user_id;
    ELSE
        RAISE NOTICE '❌ Usuário ricardogarciapt@proton.me não encontrado em auth.users';
        RAISE NOTICE '⚠️ Você precisa criar o usuário primeiro no Supabase Auth';
    END IF;
END $$;

-- 2. Verificar se o usuário pode fazer login
-- ────────────────────────────────────────────────────────────────────────────

SELECT 
    'AUTH USER' as tipo,
    u.id,
    u.email,
    u.email_confirmed_at,
    u.confirmed_at,
    u.banned_until,
    u.deleted_at
FROM auth.users u
WHERE u.email = 'ricardogarciapt@proton.me';

SELECT 
    'PROFILE' as tipo,
    p.id,
    p.email,
    p.username,
    p.user_type,
    p.is_active
FROM public.profiles p
WHERE p.email = 'ricardogarciapt@proton.me';

-- 3. Garantir que o email está confirmado
-- ────────────────────────────────────────────────────────────────────────────

UPDATE auth.users
SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmed_at = COALESCE(confirmed_at, NOW())
WHERE email = 'ricardogarciapt@proton.me'
AND (email_confirmed_at IS NULL OR confirmed_at IS NULL);

-- 4. Remover qualquer ban ou soft delete
-- ────────────────────────────────────────────────────────────────────────────

UPDATE auth.users
SET 
    banned_until = NULL,
    deleted_at = NULL
WHERE email = 'ricardogarciapt@proton.me';

-- 5. Verificar RLS policies
-- ────────────────────────────────────────────────────────────────────────────

-- Garantir que admins podem ler seus próprios perfis
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Garantir que admins podem atualizar seus próprios perfis
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

-- 6. Status final
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    auth_count INTEGER;
    profile_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO auth_count
    FROM auth.users
    WHERE email = 'ricardogarciapt@proton.me'
    AND email_confirmed_at IS NOT NULL
    AND deleted_at IS NULL;

    SELECT COUNT(*) INTO profile_count
    FROM public.profiles
    WHERE email = 'ricardogarciapt@proton.me'
    AND user_type = 'admin'
    AND is_active = true;

    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '                    STATUS FINAL DO ADMIN                       ';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Auth User OK: %', CASE WHEN auth_count > 0 THEN '✅' ELSE '❌' END;
    RAISE NOTICE 'Profile OK: %', CASE WHEN profile_count > 0 THEN '✅' ELSE '❌' END;
    RAISE NOTICE '';
    
    IF auth_count > 0 AND profile_count > 0 THEN
        RAISE NOTICE '✅ Admin ricardogarciapt@proton.me está pronto para login!';
    ELSE
        RAISE NOTICE '❌ Ainda há problemas com o admin!';
        IF auth_count = 0 THEN
            RAISE NOTICE '   - Usuário não existe ou não está confirmado em auth.users';
        END IF;
        IF profile_count = 0 THEN
            RAISE NOTICE '   - Perfil não existe ou não está ativo em profiles';
        END IF;
    END IF;
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

