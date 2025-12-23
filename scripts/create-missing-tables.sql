-- Criar tabela materials
CREATE TABLE IF NOT EXISTS materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50) DEFAULT 'pdf',
  category VARCHAR(100) DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  requires_membership BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela images
CREATE TABLE IF NOT EXISTS images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  alt_text VARCHAR(255),
  category VARCHAR(100) DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela metatrader_config
CREATE TABLE IF NOT EXISTS metatrader_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  server_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(50),
  password VARCHAR(255),
  api_key VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela special_offers
CREATE TABLE IF NOT EXISTS special_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  original_price DECIMAL(10,2) NOT NULL,
  offer_price DECIMAL(10,2) NOT NULL,
  features TEXT[],
  delay_seconds INTEGER DEFAULT 5,
  background_color VARCHAR(7) DEFAULT '#1f2937',
  text_color VARCHAR(7) DEFAULT '#ffffff',
  redirect_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir dados de exemplo na tabela materials
INSERT INTO materials (title, description, file_url, file_type, category, is_active, is_public, requires_membership, sort_order) VALUES
('Fast Start MTM', 'Guia completo para iniciar rapidamente no mundo do trading com a metodologia MTM', 'https://drive.google.com/file/d/1-2X3Y4Z5W6V7U8T9S0R1Q2P3O4N5M6L/view?usp=sharing', 'pdf', 'education', true, false, true, 1),
('Manual de Trading', 'Manual completo de estratégias de trading', 'https://drive.google.com/file/d/example2/view?usp=sharing', 'pdf', 'education', true, false, true, 2),
('Gestão de Risco', 'Guia de gestão de risco para traders', 'https://drive.google.com/file/d/example3/view?usp=sharing', 'pdf', 'education', true, false, true, 3);

-- Inserir dados de exemplo na tabela images
INSERT INTO images (title, description, image_url, alt_text, category, is_active, is_public, sort_order) VALUES
('Logo MTM', 'Logo da metodologia MoreThanMoney', '/images/mtm-logo.png', 'Logo MTM', 'branding', true, true, 1),
('Trading Chart', 'Gráfico de exemplo de trading', '/images/trading-chart.png', 'Gráfico de Trading', 'education', true, true, 2),
('Success Story', 'História de sucesso de trader', '/images/success-story.png', 'História de Sucesso', 'testimonials', true, true, 3);

-- Inserir dados de exemplo na tabela metatrader_config
INSERT INTO metatrader_config (server_name, account_number, is_active) VALUES
('MetaQuotes-Demo', '12345678', true),
('MetaQuotes-Live', '87654321', false);

-- Inserir dados de exemplo na tabela special_offers
INSERT INTO special_offers (title, description, original_price, offer_price, features, delay_seconds, background_color, text_color, redirect_url, is_active) VALUES
('Oferta Especial - Curso MTM', 'Aproveite esta oferta exclusiva por tempo limitado!', 3000.00, 2500.00, ARRAY['Acesso vitalício ao curso', 'Suporte premium incluído', 'Certificado de conclusão', 'Bónus exclusivos'], 5, '#1f2937', '#ffffff', '/checkout?offer=special', true);

-- Criar políticas RLS para materials
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Materials are viewable by authenticated users" ON materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Materials are insertable by admins" ON materials
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Materials are updatable by admins" ON materials
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Materials are deletable by admins" ON materials
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

-- Criar políticas RLS para images
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Images are viewable by everyone" ON images
  FOR SELECT USING (true);

CREATE POLICY "Images are insertable by admins" ON images
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Images are updatable by admins" ON images
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Images are deletable by admins" ON images
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

-- Criar políticas RLS para metatrader_config
ALTER TABLE metatrader_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Metatrader config is viewable by admins" ON metatrader_config
  FOR SELECT USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Metatrader config is insertable by admins" ON metatrader_config
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Metatrader config is updatable by admins" ON metatrader_config
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Metatrader config is deletable by admins" ON metatrader_config
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

-- Criar políticas RLS para special_offers
ALTER TABLE special_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Special offers are viewable by everyone" ON special_offers
  FOR SELECT USING (true);

CREATE POLICY "Special offers are insertable by admins" ON special_offers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Special offers are updatable by admins" ON special_offers
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Special offers are deletable by admins" ON special_offers
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  )); 