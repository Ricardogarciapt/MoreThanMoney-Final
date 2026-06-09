-- ==================================================
-- MIGRATION: TABELAS PARA MÓDULOS DE ADMIN
-- ==================================================

-- 1. TABELA DE VÍDEOS (Videos Manager)
CREATE TABLE IF NOT EXISTS videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    youtube_url VARCHAR(500) NOT NULL,
    location VARCHAR(100) NOT NULL DEFAULT 'home',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABELA DE CONFIGURAÇÃO TELEGRAM (Telegram Manager)
CREATE TABLE IF NOT EXISTS telegram_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_token VARCHAR(255),
    channel_id VARCHAR(255),
    webhook_url VARCHAR(500),
    auto_signals BOOLEAN DEFAULT false,
    signal_keywords TEXT[] DEFAULT ARRAY['BUY', 'SELL', '🚀', '🔻', 'LONG', 'SHORT'],
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABELA DE SINAIS TELEGRAM (Telegram Manager)
CREATE TABLE IF NOT EXISTS telegram_signals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    type VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT false,
    metadata JSONB
);

-- 4. TABELA DE CURSOS (Courses Manager)
CREATE TABLE IF NOT EXISTS courses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    duration VARCHAR(100),
    level VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABELA DE AFILIADOS (Affiliate Manager)
CREATE TABLE IF NOT EXISTS affiliates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    affiliate_code VARCHAR(50) UNIQUE,
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    total_earnings DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABELA DE HISTÓRICO DE COMISSÕES (Affiliate Manager)
CREATE TABLE IF NOT EXISTS commission_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
    order_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABELA DE IDEIAS DE TRADING (Trading Ideas)
CREATE TABLE IF NOT EXISTS trading_ideas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    symbol VARCHAR(20),
    direction VARCHAR(10),
    entry_price DECIMAL(10,4),
    target_price DECIMAL(10,4),
    stop_loss DECIMAL(10,4),
    risk_level VARCHAR(20),
    author_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABELA DE PAGAMENTOS (Payments)
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    stripe_payment_intent_id VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TABELA DE CONFIGURAÇÕES DO SITE (Site Settings)
CREATE TABLE IF NOT EXISTS site_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    type VARCHAR(50) DEFAULT 'string',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. TABELA DE VARIÁVEIS DE AMBIENTE (Environment Variables)
CREATE TABLE IF NOT EXISTS environment_variables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================================================
-- INSERIR DADOS INICIAIS
-- ==================================================

-- Inserir configurações padrão do site
INSERT INTO site_settings (key, value, description, type, is_public) VALUES
('site_name', 'More Than Money', 'Nome do site', 'string', true),
('site_description', 'Educação financeira e trading', 'Descrição do site', 'string', true),
('contact_email', 'info@morethanmoney.pt', 'Email de contato', 'string', true),
('maintenance_mode', 'false', 'Modo de manutenção', 'boolean', false),
('registration_enabled', 'true', 'Registro de usuários habilitado', 'boolean', true),
('max_upload_size', '10485760', 'Tamanho máximo de upload (bytes)', 'number', false)
ON CONFLICT (key) DO NOTHING;

-- Inserir vídeos padrão
INSERT INTO videos (title, description, youtube_url, location, active) VALUES
('Introdução ao Trading', 'Aprenda os fundamentos do trading', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'home', true),
('Análise Técnica Básica', 'Conceitos fundamentais de análise técnica', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'education', true),
('Gestão de Risco', 'Como gerenciar riscos no trading', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'education', true)
ON CONFLICT DO NOTHING;

-- Inserir configuração padrão do Telegram
INSERT INTO telegram_config (bot_token, channel_id, auto_signals, is_active) VALUES
('', '', false, false)
ON CONFLICT DO NOTHING;

-- ==================================================
-- CRIAR ÍNDICES PARA PERFORMANCE
-- ==================================================

CREATE INDEX IF NOT EXISTS idx_videos_location ON videos(location);
CREATE INDEX IF NOT EXISTS idx_videos_active ON videos(active);
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_history_affiliate_id ON commission_history(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_trading_ideas_author_id ON trading_ideas(author_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);
CREATE INDEX IF NOT EXISTS idx_environment_variables_key ON environment_variables(key);

-- ==================================================
-- CRIAR FUNÇÕES DE TRIGGER PARA UPDATED_AT
-- ==================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar triggers nas tabelas
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_telegram_config_updated_at BEFORE UPDATE ON telegram_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_affiliates_updated_at BEFORE UPDATE ON affiliates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trading_ideas_updated_at BEFORE UPDATE ON trading_ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environment_variables_updated_at BEFORE UPDATE ON environment_variables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- CONFIGURAR RLS (Row Level Security)
-- ==================================================

-- Habilitar RLS nas tabelas
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_variables ENABLE ROW LEVEL SECURITY;

-- Políticas para admin (acesso total)
CREATE POLICY "Admin full access on videos" ON videos FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on telegram_config" ON telegram_config FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on telegram_signals" ON telegram_signals FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on courses" ON courses FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on affiliates" ON affiliates FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on commission_history" ON commission_history FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on trading_ideas" ON trading_ideas FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on payments" ON payments FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on site_settings" ON site_settings FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

CREATE POLICY "Admin full access on environment_variables" ON environment_variables FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.user_type = 'admin'
    )
);

-- Políticas para usuários comuns (leitura de dados públicos)
CREATE POLICY "Public read access on videos" ON videos FOR SELECT USING (active = true);
CREATE POLICY "Public read access on courses" ON courses FOR SELECT USING (is_active = true);
CREATE POLICY "Public read access on site_settings" ON site_settings FOR SELECT USING (is_public = true);

-- Políticas para usuários autenticados
CREATE POLICY "Authenticated users can create trading_ideas" ON trading_ideas FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authenticated users can read own trading_ideas" ON trading_ideas FOR SELECT USING (auth.uid() = author_id OR is_active = true);
CREATE POLICY "Authenticated users can update own trading_ideas" ON trading_ideas FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can read own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own payments" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own affiliate data" ON affiliates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own commission history" ON commission_history FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM affiliates 
        WHERE affiliates.id = commission_history.affiliate_id 
        AND affiliates.user_id = auth.uid()
    )
); 