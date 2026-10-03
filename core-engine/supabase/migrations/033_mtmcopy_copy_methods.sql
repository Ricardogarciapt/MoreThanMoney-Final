-- Métodos de cópia, grupo Telegram e alocação por exit (Premium)
ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS copy_method text DEFAULT 'telegram_group',
  ADD COLUMN IF NOT EXISTS telegram_group text,
  ADD COLUMN IF NOT EXISTS exit_pct_tp1 numeric DEFAULT 33,
  ADD COLUMN IF NOT EXISTS exit_pct_tp2 numeric DEFAULT 33,
  ADD COLUMN IF NOT EXISTS exit_pct_tp3 numeric DEFAULT 34,
  ADD COLUMN IF NOT EXISTS copyfactory_strategy_pick text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mtmcopy_subscription_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mtmcopy_subscription_expires_at timestamptz;

COMMENT ON COLUMN mtmcopy_connections.copy_method IS 'telegram_group | strategy | master_slave';
COMMENT ON COLUMN mtmcopy_connections.telegram_group IS 'premium | trade_ideas';
COMMENT ON COLUMN mtmcopy_connections.exit_pct_tp1 IS 'Percentagem da posição fechada no TP1 (Premium)';
