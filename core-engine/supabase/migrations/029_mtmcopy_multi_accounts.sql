-- Permitir múltiplas contas MT5 por utilizador no MTMcopier
ALTER TABLE mtmcopy_connections DROP CONSTRAINT IF EXISTS mtmcopy_connections_user_id_key;

ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS account_label text;

CREATE UNIQUE INDEX IF NOT EXISTS mtmcopy_connections_user_login_server_uidx
  ON mtmcopy_connections (user_id, mt5_login, mt5_server)
  WHERE mt5_status IS DISTINCT FROM 'disconnected';

COMMENT ON COLUMN mtmcopy_connections.account_label IS 'Nome opcional da conta (ex: Conta principal)';
