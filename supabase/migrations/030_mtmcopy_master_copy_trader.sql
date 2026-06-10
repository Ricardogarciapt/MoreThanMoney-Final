ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS account_role text NOT NULL DEFAULT 'slave',
  ADD COLUMN IF NOT EXISTS sender_mode text NOT NULL DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS copyfactory_strategy_id text;

ALTER TABLE mtmcopy_connections DROP CONSTRAINT IF EXISTS mtmcopy_connections_account_role_check;
ALTER TABLE mtmcopy_connections ADD CONSTRAINT mtmcopy_connections_account_role_check
  CHECK (account_role IN ('slave', 'master'));

ALTER TABLE mtmcopy_connections DROP CONSTRAINT IF EXISTS mtmcopy_connections_sender_mode_check;
ALTER TABLE mtmcopy_connections ADD CONSTRAINT mtmcopy_connections_sender_mode_check
  CHECK (sender_mode IN ('telegram', 'master_account'));

CREATE UNIQUE INDEX IF NOT EXISTS mtmcopy_connections_user_master_uidx
  ON mtmcopy_connections (user_id)
  WHERE account_role = 'master' AND mt5_status IS DISTINCT FROM 'disconnected';

COMMENT ON COLUMN mtmcopy_connections.account_role IS 'master = conta sender (PROVIDER CopyFactory); slave = conta que recebe cópia';
COMMENT ON COLUMN mtmcopy_connections.sender_mode IS 'telegram = sinais MTM; master_account = copy trader conta mestre → slaves';
COMMENT ON COLUMN mtmcopy_connections.copyfactory_strategy_id IS 'Estratégia CopyFactory da conta mestre do utilizador';
