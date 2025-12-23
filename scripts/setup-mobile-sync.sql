-- Script para criar tabelas de sincronização entre app mobile e site

-- Tabela de posts sociais
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type VARCHAR(20), -- 'image' ou 'video'
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de likes em posts
CREATE TABLE IF NOT EXISTS social_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Tabela de comentários em posts
CREATE TABLE IF NOT EXISTS social_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de portfólio pessoal
CREATE TABLE IF NOT EXISTS personal_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  buy_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8) NOT NULL,
  asset_type VARCHAR(20) DEFAULT 'crypto', -- 'crypto', 'stock', 'forex', 'commodity'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de alertas de preço
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES personal_portfolio(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  alert_type VARCHAR(20) NOT NULL, -- 'price_above', 'price_below', 'percent_change'
  target_value DECIMAL(20, 8) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_id ON social_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_likes_user_id ON social_post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_id ON social_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_comments_user_id ON social_post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_portfolio_user_id ON personal_portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = TRUE;

-- Funções para incrementar/decrementar contadores
CREATE OR REPLACE FUNCTION increment_likes_count(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE social_posts
  SET likes_count = likes_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_likes_count(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE social_posts
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_comments_count(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE social_posts
  SET comments_count = comments_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_comments_count(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE social_posts
  SET comments_count = GREATEST(0, comments_count - 1)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers se existirem antes de criar
DROP TRIGGER IF EXISTS update_social_posts_updated_at ON social_posts;
CREATE TRIGGER update_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_social_post_comments_updated_at ON social_post_comments;
CREATE TRIGGER update_social_post_comments_updated_at
  BEFORE UPDATE ON social_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_personal_portfolio_updated_at ON personal_portfolio;
CREATE TRIGGER update_personal_portfolio_updated_at
  BEFORE UPDATE ON personal_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_alerts_updated_at ON price_alerts;
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Social Posts: todos podem ler, apenas VIP e Admin podem criar
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Drop policies se existirem antes de criar
DROP POLICY IF EXISTS "Todos podem ler posts" ON social_posts;
CREATE POLICY "Todos podem ler posts" ON social_posts
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "VIP e Admin podem criar posts" ON social_posts;
CREATE POLICY "VIP e Admin podem criar posts" ON social_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (user_type = 'admin' OR member_category = 'vip')
      )
    )
  );

DROP POLICY IF EXISTS "VIP, Admin e autor podem deletar posts" ON social_posts;
CREATE POLICY "VIP, Admin e autor podem deletar posts" ON social_posts
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (user_type = 'admin' OR member_category = 'vip')
    )
  );

-- Social Post Likes: todos podem criar/deletar seus próprios likes
ALTER TABLE social_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler likes" ON social_post_likes;
CREATE POLICY "Todos podem ler likes" ON social_post_likes
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Usuários podem criar seus likes" ON social_post_likes;
CREATE POLICY "Usuários podem criar seus likes" ON social_post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar seus likes" ON social_post_likes;
CREATE POLICY "Usuários podem deletar seus likes" ON social_post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Social Post Comments: todos podem criar, apenas autor pode deletar
ALTER TABLE social_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler comentários" ON social_post_comments;
CREATE POLICY "Todos podem ler comentários" ON social_post_comments
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Usuários autenticados podem comentar" ON social_post_comments;
CREATE POLICY "Usuários autenticados podem comentar" ON social_post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar seus comentários" ON social_post_comments;
CREATE POLICY "Usuários podem deletar seus comentários" ON social_post_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Personal Portfolio: apenas o dono pode acessar
ALTER TABLE personal_portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seu próprio portfólio" ON personal_portfolio;
CREATE POLICY "Usuários podem ver seu próprio portfólio" ON personal_portfolio
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar em seu portfólio" ON personal_portfolio;
CREATE POLICY "Usuários podem criar em seu portfólio" ON personal_portfolio
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seu portfólio" ON personal_portfolio;
CREATE POLICY "Usuários podem atualizar seu portfólio" ON personal_portfolio
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar de seu portfólio" ON personal_portfolio;
CREATE POLICY "Usuários podem deletar de seu portfólio" ON personal_portfolio
  FOR DELETE USING (auth.uid() = user_id);

-- Price Alerts: apenas o dono pode acessar
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus alertas" ON price_alerts;
CREATE POLICY "Usuários podem ver seus alertas" ON price_alerts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar alertas" ON price_alerts;
CREATE POLICY "Usuários podem criar alertas" ON price_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seus alertas" ON price_alerts;
CREATE POLICY "Usuários podem atualizar seus alertas" ON price_alerts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar seus alertas" ON price_alerts;
CREATE POLICY "Usuários podem deletar seus alertas" ON price_alerts
  FOR DELETE USING (auth.uid() = user_id);

-- Adicionar campos na tabela profiles se não existirem
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'price_alert', 'dca_opportunity', 'take_profit', 'stop_loss'
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS para notificações
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas notificações" ON notifications;
CREATE POLICY "Usuários podem ver suas notificações" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema pode criar notificações" ON notifications;
CREATE POLICY "Sistema pode criar notificações" ON notifications
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Usuários podem marcar como lida" ON notifications;
CREATE POLICY "Usuários podem marcar como lida" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
