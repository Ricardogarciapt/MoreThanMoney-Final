-- ========================================
-- SCRIPT COMPLETO PARA RECRIAR TABELAS SUPABASE
-- COM VERIFICAÇÃO DE EXISTÊNCIA
-- ========================================

-- 1. HABILITAR EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CRIAR TABELA DE USUÁRIOS (PROFILES)
DROP TABLE IF EXISTS profiles CASCADE;
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    full_name TEXT,
    phone TEXT,
    whatsapp TEXT,
    social_media TEXT,
    jifu_id TEXT UNIQUE,
    jifu_affiliate_link TEXT,
    birth_date DATE,
    avatar_url TEXT,
    user_type TEXT DEFAULT 'member' CHECK (user_type IN ('member', 'affiliate', 'admin')),
    membership_level TEXT DEFAULT 'basic' CHECK (membership_level IN ('basic', 'premium', 'vip')),
    package TEXT DEFAULT 'basic' CHECK (package IN ('basic', 'education', 'automation')),
    affiliate_code TEXT UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CRIAR TABELA DE PRODUTOS
DROP TABLE IF EXISTS products CASCADE;
CREATE TABLE products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    stripe_price_id TEXT,
    image_url TEXT,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CRIAR TABELA DE PEDIDOS
DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'failed')),
    total_amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. CRIAR TABELA DE ITENS DO PEDIDO
DROP TABLE IF EXISTS order_items CASCADE;
CREATE TABLE order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. CRIAR TABELA DE COMISSÕES DE AFILIADOS
DROP TABLE IF EXISTS affiliate_commissions CASCADE;
CREATE TABLE affiliate_commissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    affiliate_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    commission_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. CRIAR TABELA DE IDEIAS DE TRADING
DROP TABLE IF EXISTS trading_ideas CASCADE;
CREATE TABLE trading_ideas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    symbol TEXT NOT NULL,
    type TEXT CHECK (type IN ('buy', 'sell', 'hold')),
    entry_price DECIMAL(10,4),
    target_price DECIMAL(10,4),
    stop_loss DECIMAL(10,4),
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
    telegram_message_id TEXT,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. CRIAR TABELA DE COMENTÁRIOS NAS IDEIAS
DROP TABLE IF EXISTS trading_idea_comments CASCADE;
CREATE TABLE trading_idea_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    idea_id UUID REFERENCES trading_ideas(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. CRIAR TABELA DE LIKES NAS IDEIAS
DROP TABLE IF EXISTS trading_idea_likes CASCADE;
CREATE TABLE trading_idea_likes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    idea_id UUID REFERENCES trading_ideas(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(idea_id, user_id)
);

-- 10. CRIAR TABELA DE CONFIGURAÇÕES DO SITE
DROP TABLE IF EXISTS site_settings CASCADE;
CREATE TABLE site_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. CRIAR TABELA DE TESTEMUNHOS
DROP TABLE IF EXISTS testimonials CASCADE;
CREATE TABLE testimonials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    company TEXT,
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. CRIAR TABELA DE CONTEÚDO
DROP TABLE IF EXISTS content CASCADE;
CREATE TABLE content (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT CHECK (type IN ('page', 'post', 'video', 'document')),
    slug TEXT UNIQUE,
    meta_description TEXT,
    is_published BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. CRIAR TABELA DE ESTATÍSTICAS
DROP TABLE IF EXISTS statistics CASCADE;
CREATE TABLE statistics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    page_visited TEXT,
    session_duration INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- FUNÇÕES E TRIGGERS
-- ========================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Remover triggers existentes se existirem
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
DROP TRIGGER IF EXISTS update_affiliate_commissions_updated_at ON affiliate_commissions;
DROP TRIGGER IF EXISTS update_trading_ideas_updated_at ON trading_ideas;
DROP TRIGGER IF EXISTS update_site_settings_updated_at ON site_settings;
DROP TRIGGER IF EXISTS update_content_updated_at ON content;

-- Aplicar trigger a todas as tabelas com updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_affiliate_commissions_updated_at BEFORE UPDATE ON affiliate_commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trading_ideas_updated_at BEFORE UPDATE ON trading_ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para buscar email por username
DROP FUNCTION IF EXISTS get_user_email_by_username(TEXT);
CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
RETURNS TEXT AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email
    FROM profiles
    WHERE username = username_param;
    
    RETURN user_email;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
-- ========================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_idea_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_idea_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE statistics ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can view active products" ON products;
DROP POLICY IF EXISTS "Admins can manage products" ON products;
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
DROP POLICY IF EXISTS "Users can create orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users can view trading ideas" ON trading_ideas;
DROP POLICY IF EXISTS "Admins can manage trading ideas" ON trading_ideas;
DROP POLICY IF EXISTS "Anyone can view active testimonials" ON testimonials;
DROP POLICY IF EXISTS "Admins can manage testimonials" ON testimonials;

-- Políticas para profiles
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- Políticas para products (público pode ver, admin pode editar)
CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage products" ON products FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- Políticas para orders
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create orders" ON orders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all orders" ON orders FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- Políticas para trading_ideas (membros logados podem ver)
CREATE POLICY "Authenticated users can view trading ideas" ON trading_ideas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage trading ideas" ON trading_ideas FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- Políticas para testimonials (público pode ver)
CREATE POLICY "Anyone can view active testimonials" ON testimonials FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage testimonials" ON testimonials FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- ========================================
-- DADOS INICIAIS
-- ========================================

-- Inserir admin padrão
INSERT INTO profiles (id, email, username, full_name, user_type, is_active) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ricardogarciapt@proton.me',
    'admin',
    'Ricardo Garcia',
    'admin',
    true
) ON CONFLICT (id) DO NOTHING;

-- Inserir produtos de exemplo
INSERT INTO products (name, description, price, category, is_active) VALUES
('Bootcamp Redes Sociais', 'Curso completo de marketing digital', 97.00, 'education', true),
('Bootcamp Distribuidores', 'Formação para distribuidores JIFU', 147.00, 'education', true),
('Scanner MTM Gold Killer', 'Scanner avançado para trading', 197.00, 'automation', true),
('Pacote Copytrading', 'Acesso ao sistema de copytrading', 297.00, 'automation', true)
ON CONFLICT DO NOTHING;

-- Inserir testemunhos de exemplo
INSERT INTO testimonials (name, role, company, content, rating, is_active) VALUES
('André Dias', 'Trader', 'MoreThanMoney', 'O scanner mudou completamente a minha forma de trading. Resultados incríveis!', 5, true),
('Gonçalo Vania', 'Investidor', 'Freelancer', 'Os cursos são excepcionais. Aprendi mais em 1 mês do que em 1 ano.', 5, true),
('Liliana Faria', 'Empresária', 'Startup', 'A plataforma é intuitiva e os resultados falam por si. Recomendo!', 5, true)
ON CONFLICT DO NOTHING;

-- Inserir configurações do site
INSERT INTO site_settings (key, value, description) VALUES
('site_name', '"MoreThanMoney"', 'Nome do site'),
('site_description', '"A GamePlan para o seu sucesso financeiro"', 'Descrição do site'),
('contact_email', '"info@morethanmoney.pt"', 'Email de contacto'),
('telegram_channel', '"@morethanmoney"', 'Canal do Telegram')
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_trading_ideas_symbol ON trading_ideas(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_ideas_status ON trading_ideas(status);
CREATE INDEX IF NOT EXISTS idx_content_slug ON content(slug);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);

-- ========================================
-- FIM DO SCRIPT
-- ======================================== 