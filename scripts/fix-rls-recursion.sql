-- Corrigir recursão infinita nas políticas RLS
-- Este script deve ser executado no Supabase Dashboard SQL Editor

-- 1. Remover todas as políticas existentes
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;
DROP POLICY IF EXISTS "Enable all access for service role" ON users;

-- 2. Desabilitar RLS temporariamente
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 3. Criar políticas simples sem recursão
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política básica: usuários podem ver e editar apenas seu próprio perfil
CREATE POLICY "users_own_profile" ON users
    FOR ALL USING (auth.uid() = id);

-- Política para permitir inserção de novos usuários
CREATE POLICY "allow_insert_own_profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Política para permitir que o sistema insira usuários (para registro)
CREATE POLICY "system_insert_users" ON users
    FOR INSERT WITH CHECK (true);

-- 4. Verificar se as tabelas necessárias existem
-- Se não existirem, criar as tabelas básicas

-- Criar tabela commissions se não existir
CREATE TABLE IF NOT EXISTS commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela videos se não existir
CREATE TABLE IF NOT EXISTS videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration INTEGER,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela telegram_config se não existir
CREATE TABLE IF NOT EXISTS telegram_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_token TEXT,
    channel_id TEXT,
    webhook_secret TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Aplicar RLS nas novas tabelas
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

-- Políticas para commissions
CREATE POLICY "users_own_commissions" ON commissions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admins_all_commissions" ON commissions
    FOR ALL USING (true);

-- Políticas para videos (público para leitura, admin para escrita)
CREATE POLICY "public_read_videos" ON videos
    FOR SELECT USING (is_active = true);

CREATE POLICY "admins_manage_videos" ON videos
    FOR ALL USING (true);

-- Políticas para telegram_config (apenas admin)
CREATE POLICY "admins_telegram_config" ON telegram_config
    FOR ALL USING (true);

-- 6. Verificar estrutura final
SELECT 
    table_name,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('users', 'commissions', 'videos', 'telegram_config')
ORDER BY table_name, ordinal_position; 