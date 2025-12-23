-- ========================================
-- SISTEMA COMPLETO DE ALERTAS DE PREÇO
-- ========================================

-- 1. Criar tabela de alertas de preço
DROP TABLE IF EXISTS price_alerts CASCADE;

CREATE TABLE price_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  symbol_type TEXT CHECK (symbol_type IN ('crypto', 'forex', 'stock', 'index')) NOT NULL,
  alert_type TEXT CHECK (alert_type IN ('price_above', 'price_below', 'take_profit', 'stop_loss', 'dca_opportunity')) NOT NULL,
  target_value DECIMAL(18,8) NOT NULL,
  current_price DECIMAL(18,8) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  triggered BOOLEAN DEFAULT false,
  triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criar índices
CREATE INDEX idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX idx_price_alerts_symbol ON price_alerts(symbol);
CREATE INDEX idx_price_alerts_active ON price_alerts(is_active, triggered);
CREATE INDEX idx_price_alerts_type ON price_alerts(symbol_type);

-- 3. Habilitar RLS
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view own alerts" ON price_alerts
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own alerts" ON price_alerts
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON price_alerts
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts" ON price_alerts
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 5. Criar função para notificar quando alerta é acionado
CREATE OR REPLACE FUNCTION notify_alert_triggered()
RETURNS TRIGGER AS $$
BEGIN
  -- Se alerta foi acionado, enviar notificação
  IF NEW.triggered = true AND OLD.triggered = false THEN
    -- Inserir notificação
    INSERT INTO notifications (user_id, type, title, message, data, read)
    VALUES (
      NEW.user_id,
      'price_alert',
      '🎯 Alerta Acionado: ' || NEW.symbol,
      'O ativo ' || NEW.symbol || ' atingiu o valor de $' || NEW.target_value,
      jsonb_build_object(
        'symbol', NEW.symbol,
        'alert_type', NEW.alert_type,
        'target_value', NEW.target_value,
        'current_price', NEW.current_price,
        'url', '/app-mobile'
      ),
      false
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Criar trigger
DROP TRIGGER IF EXISTS trigger_notify_alert_triggered ON price_alerts;
CREATE TRIGGER trigger_notify_alert_triggered
AFTER UPDATE ON price_alerts
FOR EACH ROW
EXECUTE FUNCTION notify_alert_triggered();

-- 7. Comentários
COMMENT ON TABLE price_alerts IS 'Alertas de preço configurados pelos utilizadores';
COMMENT ON COLUMN price_alerts.alert_type IS 'Tipo: price_above (quando sobe acima), price_below (quando cai abaixo), take_profit, stop_loss';

-- ========================================
-- RESUMO
-- ========================================
-- ✅ Tabela price_alerts criada
-- ✅ RLS Policies configuradas
-- ✅ Trigger para criar notificação quando acionado
-- ✅ Índices para performance
-- ✅ Suporta crypto, forex, stock, index
-- ✅ Suporta múltiplos tipos de alerta
