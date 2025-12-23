-- Script para verificar a estrutura atual da tabela users
-- Execute este script no Supabase Dashboard > SQL Editor

-- 1. Verificar estrutura da tabela users
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Verificar se existem colunas VIP
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public'
AND column_name LIKE '%vip%';

-- 3. Verificar dados de exemplo da tabela users
SELECT 
    id,
    email,
    full_name,
    role,
    user_type,
    is_active,
    created_at,
    updated_at
FROM users 
LIMIT 5;

-- 4. Verificar se existe algum usuário com o email específico
SELECT 
    id,
    email,
    full_name,
    role,
    user_type,
    is_active,
    created_at,
    updated_at
FROM users 
WHERE email = 'ricardogarciapt@proton.me'; 