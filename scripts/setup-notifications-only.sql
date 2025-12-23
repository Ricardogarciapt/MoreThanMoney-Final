-- Script SQL APENAS para Sistema de Notificações
-- Execute este script no Supabase SQL Editor

-- 1. Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários veem suas notificações" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Sistema cria notificações" ON notifications
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Usuários marcam como lida" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários deletam suas notificações" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Tabela de Alertas de Preço (se ainda não existir)
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id UUID,
  symbol VARCHAR(20) NOT NULL,
  alert_type VARCHAR(20) NOT NULL,
  target_value DECIMAL(20, 8) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Índices para Alertas
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol);

-- 6. RLS para Alertas
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus alertas" ON price_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam alertas" ON price_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam seus alertas" ON price_alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários deletam seus alertas" ON price_alerts
  FOR DELETE USING (auth.uid() = user_id);

-- ✅ PRONTO! Sistema de notificações ativo.

