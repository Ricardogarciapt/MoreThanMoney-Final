ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS telegram_groups text[] DEFAULT '{}';

COMMENT ON COLUMN mtmcopy_connections.telegram_groups IS 'Grupos Telegram activos: premium, trade_ideas (pode incluir ambos)';
