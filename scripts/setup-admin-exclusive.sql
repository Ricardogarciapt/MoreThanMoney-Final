-- ════════════════════════════════════════════════════════════════════════════
-- CONFIGURAÇÃO DO ADMIN EXCLUSIVO
-- ════════════════════════════════════════════════════════════════════════════
-- Este script configura ricardogarciapt@proton.me como ÚNICO admin
-- Execute este script no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Garantir que o perfil do admin existe e está configurado corretamente
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'ricardogarciapt@proton.me';
BEGIN
    -- Buscar o ID do usuário admin no auth.users
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = admin_email
    LIMIT 1;

    IF admin_user_id IS NOT NULL THEN
        -- Atualizar perfil do admin
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
            admin_email,
            'ricardogarciapt',
            'Ricardo Garcia',
            'admin',
            true,
            NOW(),
            NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET
            email = admin_email,
            username = 'ricardogarciapt',
            full_name = 'Ricardo Garcia',
            user_type = 'admin',
            is_active = true,
            updated_at = NOW();

        RAISE NOTICE '✅ Perfil do admin atualizado com sucesso!';
        
        -- Confirmar email se necessário
        UPDATE auth.users
        SET 
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            confirmed_at = COALESCE(confirmed_at, NOW()),
            banned_until = NULL,
            deleted_at = NULL
        WHERE email = admin_email;
        
        RAISE NOTICE '✅ Email confirmado e conta desbloqueada!';
    ELSE
        RAISE NOTICE '❌ ATENÇÃO: Usuário não encontrado em auth.users!';
        RAISE NOTICE '';
        RAISE NOTICE '📋 VOCÊ PRECISA CRIAR O USUÁRIO MANUALMENTE:';
        RAISE NOTICE '   1. Vá em Authentication > Users no Supabase Dashboard';
        RAISE NOTICE '   2. Clique em "Add User"';
        RAISE NOTICE '   3. Email: ricardogarciapt@proton.me';
        RAISE NOTICE '   4. Password: [sua senha segura]';
        RAISE NOTICE '   5. Marque "Auto Confirm User"';
        RAISE NOTICE '   6. Execute este script novamente';
    END IF;
END $$;

-- 2. REMOVER privilégios de admin de TODOS os outros usuários
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    admin_email TEXT := 'ricardogarciapt@proton.me';
    updated_count INTEGER;
BEGIN
    -- Converter todos os outros admins para membros
    UPDATE public.profiles
    SET 
        user_type = 'member',
        updated_at = NOW()
    WHERE user_type = 'admin'
    AND email != admin_email;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
        RAISE NOTICE '✅ Removidos privilégios de admin de % usuário(s)', updated_count;
    ELSE
        RAISE NOTICE 'ℹ️  Nenhum outro admin encontrado (já está correto)';
    END IF;
END $$;

-- 3. Verificação final
-- ────────────────────────────────────────────────────────────────────────────

DO $$ 
DECLARE
    admin_count INTEGER;
    admin_email TEXT := 'ricardogarciapt@proton.me';
    admin_exists BOOLEAN;
BEGIN
    -- Contar total de admins
    SELECT COUNT(*) INTO admin_count
    FROM public.profiles
    WHERE user_type = 'admin';
    
    -- Verificar se o admin correto existe
    SELECT EXISTS(
        SELECT 1 FROM public.profiles
        WHERE email = admin_email
        AND user_type = 'admin'
        AND is_active = true
    ) INTO admin_exists;
    
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '                    STATUS FINAL                               ';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Total de admins no sistema: %', admin_count;
    RAISE NOTICE 'Admin correto configurado: %', CASE WHEN admin_exists THEN '✅' ELSE '❌' END;
    RAISE NOTICE '';
    
    IF admin_count = 1 AND admin_exists THEN
        RAISE NOTICE '✅ PERFEITO! Apenas ricardogarciapt@proton.me tem acesso admin!';
    ELSIF admin_count > 1 THEN
        RAISE NOTICE '⚠️  ATENÇÃO: Ainda existem % admins no sistema!', admin_count;
    ELSIF NOT admin_exists THEN
        RAISE NOTICE '❌ ERRO: Admin ricardogarciapt@proton.me não está configurado!';
    END IF;
    
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

-- 4. Listar todos os admins (para verificação)
-- ────────────────────────────────────────────────────────────────────────────

SELECT 
    '👤 ADMIN' as tipo,
    email,
    username,
    user_type,
    is_active,
    created_at
FROM public.profiles
WHERE user_type = 'admin'
ORDER BY created_at DESC;

