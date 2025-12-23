-- Criar tabela admin_crypto_portfolio
CREATE TABLE IF NOT EXISTS public.admin_crypto_portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,
  criptomoeda TEXT NOT NULL,
  symbol TEXT NOT NULL UNIQUE,
  percentual NUMERIC NOT NULL DEFAULT 0,
  investimento_inicial NUMERIC NOT NULL DEFAULT 0,
  reforco_mensal NUMERIC NOT NULL DEFAULT 0,
  reforco_anual NUMERIC NOT NULL DEFAULT 0,
  potencial_crescimento_percent NUMERIC NOT NULL DEFAULT 0,
  potencial_crescimento_valor NUMERIC NOT NULL DEFAULT 0,
  entry_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar tabela admin_etf_portfolio
CREATE TABLE IF NOT EXISTS public.admin_etf_portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,
  etf TEXT NOT NULL,
  symbol TEXT NOT NULL UNIQUE,
  percentual NUMERIC NOT NULL DEFAULT 0,
  investimento_inicial NUMERIC NOT NULL DEFAULT 0,
  reforco_semanal NUMERIC NOT NULL DEFAULT 0,
  reforco_total_5anos NUMERIC NOT NULL DEFAULT 0,
  crescimento_esperado_percent NUMERIC NOT NULL DEFAULT 0,
  crescimento_esperado_valor NUMERIC NOT NULL DEFAULT 0,
  entry_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.admin_crypto_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_etf_portfolio ENABLE ROW LEVEL SECURITY;

-- Todos podem ler
DROP POLICY IF EXISTS "Todos podem ler crypto portfolio" ON public.admin_crypto_portfolio;
CREATE POLICY "Todos podem ler crypto portfolio"
  ON public.admin_crypto_portfolio
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Todos podem ler ETF portfolio" ON public.admin_etf_portfolio;
CREATE POLICY "Todos podem ler ETF portfolio"
  ON public.admin_etf_portfolio
  FOR SELECT
  USING (true);

-- Apenas ADMIN pode editar
DROP POLICY IF EXISTS "Admin pode gerir crypto" ON public.admin_crypto_portfolio;
CREATE POLICY "Admin pode gerir crypto"
  ON public.admin_crypto_portfolio
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin pode gerir ETF" ON public.admin_etf_portfolio;
CREATE POLICY "Admin pode gerir ETF"
  ON public.admin_etf_portfolio
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

-- Inserir dados iniciais
INSERT INTO public.admin_crypto_portfolio (categoria, criptomoeda, symbol, percentual, investimento_inicial, reforco_mensal, reforco_anual, potencial_crescimento_percent, potencial_crescimento_valor, entry_price)
VALUES
  ('Medias Capitalizacoes', 'Cardano', 'ADAUSDT', 5, 25, 10, 130, 200, 315, 0.52),
  ('Medias Capitalizacoes', 'XRP', 'XRPUSDT', 15, 75, 30, 390, 400, 1860, 2.10),
  ('Medias Capitalizacoes', 'Polkadot', 'DOTUSDT', 5, 25, 10, 130, 300, 405, 3.80),
  ('Pequenas Capitalizacoes', 'Polygon', 'MATICUSDT', 5, 25, 10, 130, 200, 315, 0.42),
  ('Pequenas Capitalizacoes', 'Chainlink', 'LINKUSDT', 10, 50, 20, 260, 350, 1085, 18.50),
  ('Pequenas Capitalizacoes', 'Avalanche', 'AVAXUSDT', 10, 50, 20, 260, 400, 1150, 25.00),
  ('Pequenas Capitalizacoes', 'VeChain', 'VETUSDT', 10, 50, 20, 260, 500, 1550, 0.018),
  ('Projetos Emergentes', 'Arbitrum', 'ARBUSDT', 5, 25, 10, 130, 600, 805, 0.48),
  ('Projetos Emergentes', 'Optimism', 'OPUSDT', 5, 25, 10, 130, 700, 935, 0.75),
  ('Projetos Emergentes', 'The Graph', 'GRTUSDT', 5, 25, 10, 130, 800, 1065, 0.09),
  ('Projetos Emergentes', 'Hedera', 'HBARUSDT', 5, 25, 10, 130, 500, 775, 0.18),
  ('Projetos Emergentes', 'Kaspa', 'KASUSDT', 10, 50, 20, 260, 1000, 3100, 0.12),
  ('Projetos Emergentes', 'Jupiter', 'JUPUSDT', 10, 50, 20, 260, 1000, 3100, 0.50),
  ('Projetos Emergentes', 'Algorand', 'ALGOUSDT', 5, 25, 10, 130, 300, 405, 0.19),
  ('Projetos Emergentes', 'Immutable', 'IMXUSDT', 5, 25, 10, 130, 700, 935, 0.72),
  ('Projetos Emergentes', 'ONDO', 'ONDOUSDT', 5, 25, 10, 130, 700, 935, 0.78),
  ('Projetos Emergentes', 'JTO', 'JTOUSDT', 5, 25, 10, 130, 800, 1065, 1.80),
  ('Projetos Emergentes', 'Aero', 'AEROUSDT', 5, 25, 10, 130, 700, 935, 0.85),
  ('Projetos Emergentes', 'ILV', 'ILVUSDT', 10, 25, 10, 130, 800, 1065, 18.00),
  ('Projetos Emergentes', 'Flow', 'FLOWUSDT', 5, 25, 10, 130, 600, 805, 0.40),
  ('Stablecoins', 'Tether', 'USDTUSDT', 15, 75, 10, 130, 0, 185, 1.00)
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO public.admin_etf_portfolio (categoria, etf, symbol, percentual, investimento_inicial, reforco_semanal, reforco_total_5anos, crescimento_esperado_percent, crescimento_esperado_valor, entry_price)
VALUES
  ('Tecnologia e Inovacao', 'ARK Innovation ETF', 'ARKK', 20, 20, 5, 1300, 300, 5200, 75.00),
  ('Inteligencia Artificial', 'Global X Robotics & AI', 'BOTZ', 15, 15, 3.75, 975, 200, 2925, 35.00),
  ('Blockchain e Cripto', 'Amplify Transformational Data', 'BLOK', 15, 15, 3.75, 975, 300, 3900, 28.00),
  ('Indice Geral USA', 'SPDR S&P 500 ETF Trust', 'SPY', 15, 15, 3.75, 975, 100, 1950, 620.00),
  ('Mercados Emergentes', 'iShares MSCI Emerging Markets', 'EEM', 15, 15, 3.75, 975, 150, 2437.50, 42.00),
  ('Energia Limpa', 'iShares Global Clean Energy', 'ICLN', 10, 10, 2.50, 650, 250, 2275, 18.00),
  ('Seguranca Cibernetica', 'First Trust Cybersecurity', 'CIBR', 5, 5, 1.25, 325, 150, 812.50, 52.00),
  ('Infraestrutura Global', 'iShares Global Infrastructure', 'IGF', 5, 5, 1.25, 325, 100, 650, 48.00)
ON CONFLICT (symbol) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_crypto_symbol ON public.admin_crypto_portfolio(symbol);
CREATE INDEX IF NOT EXISTS idx_admin_etf_symbol ON public.admin_etf_portfolio(symbol);
CREATE INDEX IF NOT EXISTS idx_admin_crypto_categoria ON public.admin_crypto_portfolio(categoria);
CREATE INDEX IF NOT EXISTS idx_admin_etf_categoria ON public.admin_etf_portfolio(categoria);

