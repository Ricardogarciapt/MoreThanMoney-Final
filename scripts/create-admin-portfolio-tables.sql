-- ============================================
-- TABELAS ADMIN PORTFOLIO
-- ============================================

-- 1. Tabela Crypto Portfolio Admin
CREATE TABLE IF NOT EXISTS admin_crypto_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL,
  criptomoeda TEXT NOT NULL,
  symbol TEXT NOT NULL,
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

-- 2. Tabela ETF Portfolio Admin
CREATE TABLE IF NOT EXISTS admin_etf_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL,
  etf TEXT NOT NULL,
  symbol TEXT NOT NULL,
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

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_crypto_symbol ON admin_crypto_portfolio(symbol);
CREATE INDEX IF NOT EXISTS idx_admin_crypto_percentual ON admin_crypto_portfolio(percentual DESC);
CREATE INDEX IF NOT EXISTS idx_admin_etf_symbol ON admin_etf_portfolio(symbol);
CREATE INDEX IF NOT EXISTS idx_admin_etf_percentual ON admin_etf_portfolio(percentual DESC);

-- 4. RLS Policies (apenas admin pode ler/editar)
ALTER TABLE admin_crypto_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_etf_portfolio ENABLE ROW LEVEL SECURITY;

-- Drop policies existentes
DROP POLICY IF EXISTS "Admins podem ler crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem inserir crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem atualizar crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem apagar crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem ler ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem inserir ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem atualizar ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem apagar ETF" ON admin_etf_portfolio;

-- Policies para Crypto
CREATE POLICY "Admins podem ler crypto" ON admin_crypto_portfolio
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem inserir crypto" ON admin_crypto_portfolio
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem atualizar crypto" ON admin_crypto_portfolio
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem apagar crypto" ON admin_crypto_portfolio
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

-- Policies para ETF
CREATE POLICY "Admins podem ler ETF" ON admin_etf_portfolio
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem inserir ETF" ON admin_etf_portfolio
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem atualizar ETF" ON admin_etf_portfolio
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins podem apagar ETF" ON admin_etf_portfolio
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

-- 5. Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_admin_portfolio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Triggers para updated_at
DROP TRIGGER IF EXISTS trigger_admin_crypto_updated_at ON admin_crypto_portfolio;
CREATE TRIGGER trigger_admin_crypto_updated_at
  BEFORE UPDATE ON admin_crypto_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_portfolio_updated_at();

DROP TRIGGER IF EXISTS trigger_admin_etf_updated_at ON admin_etf_portfolio;
CREATE TRIGGER trigger_admin_etf_updated_at
  BEFORE UPDATE ON admin_etf_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_portfolio_updated_at();

-- ============================================
-- DADOS INICIAIS
-- ============================================

-- Limpar dados existentes (se houver)
TRUNCATE admin_crypto_portfolio, admin_etf_portfolio CASCADE;

-- Inserir Crypto Portfolio
INSERT INTO admin_crypto_portfolio (categoria, criptomoeda, symbol, percentual, investimento_inicial, reforco_mensal, reforco_anual, potencial_crescimento_percent, potencial_crescimento_valor, entry_price) VALUES
('Médias Capitalizações', 'Cardano', 'ADAUSDT', 5, 25, 10, 130, 200, 315, 0.52),
('Médias Capitalizações', 'XRP', 'XRPUSDT', 15, 75, 30, 390, 400, 1860, 2.10),
('Médias Capitalizações', 'Polkadot', 'DOTUSDT', 5, 25, 10, 130, 300, 405, 3.80),
('Pequenas Capitalizações', 'Polygon', 'MATICUSDT', 5, 25, 10, 130, 200, 315, 0.42),
('Pequenas Capitalizações', 'Chainlink', 'LINKUSDT', 10, 50, 20, 260, 350, 1085, 18.50),
('Pequenas Capitalizações', 'Avalanche', 'AVAXUSDT', 10, 50, 20, 260, 400, 1150, 25.00),
('Pequenas Capitalizações', 'VeChain', 'VETUSDT', 10, 50, 20, 260, 500, 1550, 0.018),
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
('Stablecoins', 'Tether', 'USDTUSDT', 15, 75, 10, 130, 0, 185, 1.00);

-- Inserir ETF Portfolio
INSERT INTO admin_etf_portfolio (categoria, etf, symbol, percentual, investimento_inicial, reforco_semanal, reforco_total_5anos, crescimento_esperado_percent, crescimento_esperado_valor, entry_price) VALUES
('Tecnologia e Inovação', 'ARK Innovation ETF', 'ARKK', 20, 20, 5, 1300, 300, 5200, 75.00),
('Inteligência Artificial', 'Global X Robotics & AI', 'BOTZ', 15, 15, 3.75, 975, 200, 2925, 35.00),
('Blockchain e Cripto', 'Amplify Transformational Data', 'BLOK', 15, 15, 3.75, 975, 300, 3900, 28.00),
('Índice Geral (USA)', 'SPDR S&P 500 ETF Trust', 'SPY', 15, 15, 3.75, 975, 100, 1950, 620.00),
('Mercados Emergentes', 'iShares MSCI Emerging Markets', 'EEM', 15, 15, 3.75, 975, 150, 2437.50, 42.00),
('Energia Limpa', 'iShares Global Clean Energy', 'ICLN', 10, 10, 2.50, 650, 250, 2275, 18.00),
('Segurança Cibernética', 'First Trust Cybersecurity', 'CIBR', 5, 5, 1.25, 325, 150, 812.50, 52.00),
('Infraestrutura Global', 'iShares Global Infrastructure', 'IGF', 5, 5, 1.25, 325, 100, 650, 48.00);

-- ============================================
-- CONFIRMAÇÃO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Tabelas admin_crypto_portfolio e admin_etf_portfolio criadas!';
  RAISE NOTICE '📊 Crypto assets inseridos: %', (SELECT COUNT(*) FROM admin_crypto_portfolio);
  RAISE NOTICE '📈 ETF assets inseridos: %', (SELECT COUNT(*) FROM admin_etf_portfolio);
  RAISE NOTICE '🔒 RLS Policies configuradas (apenas admin)';
END $$;


