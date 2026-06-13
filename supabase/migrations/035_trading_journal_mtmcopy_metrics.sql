-- Conta auditada (tipo MyFXBook) para métricas transparentes
ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS is_audited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_label text;

ALTER TABLE trading_plan_trades
  ADD COLUMN IF NOT EXISTS trade_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'analysis',
  ADD COLUMN IF NOT EXISTS mtmcopy_connection_id uuid REFERENCES mtmcopy_connections(id) ON DELETE SET NULL;

ALTER TABLE trading_plan_trades DROP CONSTRAINT IF EXISTS trading_plan_trades_trade_source_check;
ALTER TABLE trading_plan_trades ADD CONSTRAINT trading_plan_trades_trade_source_check
  CHECK (trade_source IN ('manual', 'copy', 'audited'));

ALTER TABLE trading_plan_trades DROP CONSTRAINT IF EXISTS trading_plan_trades_execution_mode_check;
ALTER TABLE trading_plan_trades ADD CONSTRAINT trading_plan_trades_execution_mode_check
  CHECK (execution_mode IN ('executed', 'analysis'));

CREATE INDEX IF NOT EXISTS trading_plan_trades_user_execution_idx
  ON trading_plan_trades (user_id, execution_mode, opened_at DESC);

CREATE INDEX IF NOT EXISTS trading_plan_trades_connection_idx
  ON trading_plan_trades (mtmcopy_connection_id)
  WHERE mtmcopy_connection_id IS NOT NULL;
