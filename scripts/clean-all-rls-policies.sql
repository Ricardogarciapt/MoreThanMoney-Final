-- Script para limpar todas as políticas RLS antigas
-- Deixa apenas as políticas corretas para produção

-- 1. Listar todas as políticas existentes
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies 
ORDER BY tablename, policyname;

-- 2. Remover todas as políticas RLS existentes
-- Tabela users
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable update for users based on email" ON users;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON users;

-- Tabela products
DROP POLICY IF EXISTS "Enable read access for all users" ON products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON products;
DROP POLICY IF EXISTS "Enable update for users based on email" ON products;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON products;

-- Tabela materials
DROP POLICY IF EXISTS "Enable read access for all users" ON materials;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON materials;
DROP POLICY IF EXISTS "Enable update for users based on email" ON materials;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON materials;

-- Tabela commissions
DROP POLICY IF EXISTS "Enable read access for all users" ON commissions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON commissions;
DROP POLICY IF EXISTS "Enable update for users based on email" ON commissions;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON commissions;

-- Tabela videos
DROP POLICY IF EXISTS "Enable read access for all users" ON videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON videos;
DROP POLICY IF EXISTS "Enable update for users based on email" ON videos;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON videos;

-- Tabela testimonials
DROP POLICY IF EXISTS "Enable read access for all users" ON testimonials;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON testimonials;
DROP POLICY IF EXISTS "Enable update for users based on email" ON testimonials;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON testimonials;

-- Tabela telegram_config
DROP POLICY IF EXISTS "Enable read access for all users" ON telegram_config;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON telegram_config;
DROP POLICY IF EXISTS "Enable update for users based on email" ON telegram_config;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON telegram_config;

-- Tabela trading_ideas
DROP POLICY IF EXISTS "Enable read access for all users" ON trading_ideas;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON trading_ideas;
DROP POLICY IF EXISTS "Enable update for users based on email" ON trading_ideas;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON trading_ideas;

-- 3. Criar políticas RLS corretas para produção

-- Tabela users - Políticas corretas
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela products - Acesso público para leitura, admin para escrita
CREATE POLICY "Public read access" ON products
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write access" ON products
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela materials - Acesso público para leitura, admin para escrita
CREATE POLICY "Public read access" ON materials
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write access" ON materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela commissions - Apenas admin (removida referência a user_id)
CREATE POLICY "Admin full access" ON commissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela videos - Acesso público para leitura, admin para escrita
CREATE POLICY "Public read access" ON videos
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write access" ON videos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela testimonials - Acesso público para leitura, admin para escrita
CREATE POLICY "Public read access" ON testimonials
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write access" ON testimonials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela telegram_config - Apenas admin
CREATE POLICY "Admin only access" ON telegram_config
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Tabela trading_ideas - Acesso público para leitura, admin para escrita
CREATE POLICY "Public read access" ON trading_ideas
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write access" ON trading_ideas
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 4. Verificar políticas finais
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies 
ORDER BY tablename, policyname; 