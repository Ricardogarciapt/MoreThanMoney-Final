-- Script para adicionar/atualizar usuário com perfil VIP e admin
-- Usuário: ricardogarciapt@proton.me
-- Senha: Superacao2022#

-- 1. Primeiro, verificar se o usuário já existe
DO $$
DECLARE
    user_exists BOOLEAN;
    user_id UUID;
BEGIN
    -- Verificar se o usuário existe na tabela auth.users
    SELECT EXISTS(
        SELECT 1 FROM auth.users 
        WHERE email = 'ricardogarciapt@proton.me'
    ) INTO user_exists;
    
    IF user_exists THEN
        -- Usuário existe, obter o ID
        SELECT id INTO user_id FROM auth.users WHERE email = 'ricardogarciapt@proton.me';
        
        -- Atualizar dados do usuário na tabela users
        UPDATE users 
        SET 
            email = 'ricardogarciapt@proton.me',
            full_name = 'Ricardo Garcia',
            role = 'admin',
            is_active = true,
            is_vip = true,
            vip_expires_at = NOW() + INTERVAL '1 year',
            updated_at = NOW()
        WHERE id = user_id;
        
        -- Se não existir registro na tabela users, criar
        IF NOT FOUND THEN
            INSERT INTO users (
                id, email, full_name, role, is_active, is_vip, 
                vip_expires_at, created_at, updated_at
            ) VALUES (
                user_id, 'ricardogarciapt@proton.me', 'Ricardo Garcia', 
                'admin', true, true, NOW() + INTERVAL '1 year', NOW(), NOW()
            );
        END IF;
        
        RAISE NOTICE 'Usuário atualizado com sucesso: %', user_id;
        
    ELSE
        -- Usuário não existe, criar novo
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            'ricardogarciapt@proton.me',
            crypt('Superacao2022#', gen_salt('bf')),
            NOW(),
            NULL,
            NOW(),
            '{"provider": "email", "providers": ["email"]}',
            '{}',
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        ) RETURNING id INTO user_id;
        
        -- Criar registro na tabela users
        INSERT INTO users (
            id, email, full_name, role, is_active, is_vip, 
            vip_expires_at, created_at, updated_at
        ) VALUES (
            user_id, 'ricardogarciapt@proton.me', 'Ricardo Garcia', 
            'admin', true, true, NOW() + INTERVAL '1 year', NOW(), NOW()
        );
        
        RAISE NOTICE 'Novo usuário criado com sucesso: %', user_id;
    END IF;
END $$;

-- 2. Verificar se o usuário foi criado/atualizado corretamente
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.is_active,
    u.is_vip,
    u.vip_expires_at,
    u.created_at,
    u.updated_at
FROM users u 
WHERE u.email = 'ricardogarciapt@proton.me';

-- 3. Verificar na tabela auth.users também
SELECT 
    id,
    email,
    role,
    email_confirmed_at,
    created_at,
    updated_at
FROM auth.users 
WHERE email = 'ricardogarciapt@proton.me'; 