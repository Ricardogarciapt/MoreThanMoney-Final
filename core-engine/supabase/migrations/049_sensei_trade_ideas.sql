-- Ideias Sensei X (Entry Alert) aguardam Entry Trigger Buy/Sell para activação
CREATE TABLE IF NOT EXISTS sensei_trade_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  symbol text NOT NULL,
  timeframe text,
  direction text CHECK (direction IN ('buy', 'sell') OR direction IS NULL),
  entry numeric,
  sl numeric,
  tp jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'expired', 'cancelled')),
  source_signal_id uuid,
  activated_at timestamptz,
  trigger_signal_id uuid,
  raw_message text,
  raw_payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_sensei_ideas_pending_lookup
  ON sensei_trade_ideas (symbol, timeframe, status, created_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE sensei_trade_ideas IS 'Entry Alert Sensei X → ideia pendente; Entry Trigger Buy/Sell → activação';
