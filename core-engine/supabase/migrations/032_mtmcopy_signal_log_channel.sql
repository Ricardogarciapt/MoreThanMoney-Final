-- Metadados de canal para o log global de sinais (admin senders)

ALTER TABLE mtmcopy_signal_log
  ADD COLUMN IF NOT EXISTS channel_key text,
  ADD COLUMN IF NOT EXISTS telegram_message_id bigint;

CREATE INDEX IF NOT EXISTS idx_mtmcopy_signal_log_created
  ON mtmcopy_signal_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mtmcopy_signal_log_channel
  ON mtmcopy_signal_log (channel_key, created_at DESC);
