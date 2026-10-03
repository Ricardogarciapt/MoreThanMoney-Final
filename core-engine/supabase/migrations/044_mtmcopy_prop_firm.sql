-- Prop firm + gestão subscritor MTMcopier
ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS prop_firm_type text
    CHECK (prop_firm_type IS NULL OR prop_firm_type IN ('ftmo', 'fundednext')),
  ADD COLUMN IF NOT EXISTS copy_as_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS baseline_balance numeric;

COMMENT ON COLUMN mtmcopy_connections.prop_firm_type IS 'Preset prop firm: ftmo | fundednext';
COMMENT ON COLUMN mtmcopy_connections.copy_as_manual IS 'Trades directos com comment MTM-M (compliance prop)';
COMMENT ON COLUMN mtmcopy_connections.baseline_balance IS 'Saldo inicial para cálculo de P&L %';
