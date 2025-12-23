-- ============================================================================
-- FIX AUTENTICAÇÃO COMPLETO
-- ============================================================================
-- Este script corrige problemas de autenticação no Supabase
-- 1. Lista todos os usuários no auth.users
-- 2. Lista todos os perfis
-- 3. Confirma emails não confirmados
-- 4. Cria perfis faltantes
-- ============================================================================

-- 1. VERIFICAR USUÁRIOS NO AUTH
DO $$
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'USUÁRIOS NO AUTH.USERS:';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

SELECT 
    id,
    email,
    email_confirmed_at IS NOT NULL as "confirmado",
    created_at,
    raw_user_meta_data->>'full_name' as "nome"
FROM auth.users
ORDER BY created_at DESC;

-- 2. VERIFICAR PERFIS
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'PERFIS NA TABELA PROFILES:';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

SELECT 
    id,
    email,
    full_name,
    username,
    user_type,
    is_active,
    created_at
FROM profiles
ORDER BY created_at DESC;

-- 3. VERIFICAR USUÁRIOS SEM PERFIL
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'USUÁRIOS SEM PERFIL:';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

SELECT 
    au.id,
    au.email,
    au.created_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;

-- 4. CONFIRMAR TODOS OS EMAILS NÃO CONFIRMADOS
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Contar quantos emails precisam ser confirmados
    SELECT COUNT(*) INTO v_count
    FROM auth.users
    WHERE email_confirmed_at IS NULL;

    IF v_count > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '═══════════════════════════════════════════════════════════════';
        RAISE NOTICE 'CONFIRMANDO % EMAILS...', v_count;
        RAISE NOTICE '═══════════════════════════════════════════════════════════════';
        
        -- Confirmar todos os emails
        UPDATE auth.users
        SET 
            email_confirmed_at = NOW(),
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE email_confirmed_at IS NULL;
        
        RAISE NOTICE '✅ % emails confirmados com sucesso!', v_count;
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '✅ Todos os emails já estão confirmados!';
    END IF;
END $$;

-- 5. CRIAR PERFIS PARA USUÁRIOS QUE NÃO TÊM
DO $$
DECLARE
    v_user RECORD;
    v_username TEXT;
    v_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'CRIANDO PERFIS FALTANTES...';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    
    FOR v_user IN 
        SELECT 
            au.id,
            au.email,
            au.raw_user_meta_data->>'full_name' as full_name,
            au.raw_user_meta_data->>'name' as name
        FROM auth.users au
        LEFT JOIN profiles p ON au.id = p.id
        WHERE p.id IS NULL
    LOOP
        -- Gerar username a partir do email
        v_username := SPLIT_PART(v_user.email, '@', 1);
        v_username := REGEXP_REPLACE(v_username, '[^a-z0-9]', '', 'gi');
        v_username := LOWER(v_username);
        
        -- Se username está vazio, gerar um aleatório
        IF v_username = '' OR LENGTH(v_username) < 3 THEN
            v_username := 'user' || EXTRACT(EPOCH FROM NOW())::BIGINT;
        END IF;
        
        -- Verificar se username já existe e adicionar número se necessário
        WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
            v_username := v_username || FLOOR(RANDOM() * 100)::TEXT;
        END LOOP;
        
        -- Inserir perfil
        INSERT INTO profiles (
            id,
            email,
            full_name,
            username,
            user_type,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            v_user.id,
            v_user.email,
            COALESCE(v_user.full_name, v_user.name, 'Utilizador'),
            v_username,
            'member',
            true,
            NOW(),
            NOW()
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ Perfil criado para: % (username: %)', v_user.email, v_username;
    END LOOP;
    
    IF v_count > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ % perfis criados com sucesso!', v_count;
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '✅ Todos os usuários já possuem perfis!';
    END IF;
END $$;

-- 6. VERIFICAÇÃO FINAL
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'VERIFICAÇÃO FINAL:';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

SELECT 
    (SELECT COUNT(*) FROM auth.users) as "total_users_auth",
    (SELECT COUNT(*) FROM profiles) as "total_profiles",
    (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL) as "emails_confirmados",
    (SELECT COUNT(*) FROM auth.users au LEFT JOIN profiles p ON au.id = p.id WHERE p.id IS NULL) as "users_sem_perfil";

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ SCRIPT CONCLUÍDO COM SUCESSO!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

