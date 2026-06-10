ALTER TABLE mtmcopy_connections
  ADD COLUMN IF NOT EXISTS auto_trailing_stop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailing_stop_points integer NOT NULL DEFAULT 200;

COMMENT ON COLUMN mtmcopy_connections.auto_trailing_stop IS 'Activa trailing stop automático nas ordens MTMcopier (MetaAPI)';
COMMENT ON COLUMN mtmcopy_connections.trailing_stop_points IS 'Distância do trailing stop em RELATIVE_POINTS (MetaAPI)';
