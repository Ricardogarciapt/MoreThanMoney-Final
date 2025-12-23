-- ============================================
-- ADICIONAR COLUNAS TP/SL ÀS TABELAS ADMIN
-- ============================================
-- Este script adiciona suporte para TP/SL persistidos
-- validados por IA nas tabelas de portfolio admin
-- ============================================

-- Adicionar colunas TP/SL à tabela admin_crypto_portfolio
ALTER TABLE public.admin_crypto_portfolio
ADD COLUMN IF NOT EXISTS tp1_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp2_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp3_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stop_loss_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_validated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_last_analysis TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp1_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp2_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp3_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_recommendation TEXT DEFAULT NULL;

-- Adicionar colunas TP/SL à tabela admin_etf_portfolio
ALTER TABLE public.admin_etf_portfolio
ADD COLUMN IF NOT EXISTS tp1_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp2_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp3_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stop_loss_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_validated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_last_analysis TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp1_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp2_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp3_timeframe TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_recommendation TEXT DEFAULT NULL;

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_crypto_ai_validated ON public.admin_crypto_portfolio(ai_validated);
CREATE INDEX IF NOT EXISTS idx_crypto_symbol ON public.admin_crypto_portfolio(symbol);
CREATE INDEX IF NOT EXISTS idx_etf_ai_validated ON public.admin_etf_portfolio(ai_validated);
CREATE INDEX IF NOT EXISTS idx_etf_symbol ON public.admin_etf_portfolio(symbol);

-- Comentários nas colunas (documentação)
COMMENT ON COLUMN public.admin_crypto_portfolio.tp1_price IS 'Take Profit 1 - Alvo conservador (+30%)';
COMMENT ON COLUMN public.admin_crypto_portfolio.tp2_price IS 'Take Profit 2 - Alvo moderado (+75%)';
COMMENT ON COLUMN public.admin_crypto_portfolio.tp3_price IS 'Take Profit 3 - Alvo agressivo (+150%)';
COMMENT ON COLUMN public.admin_crypto_portfolio.stop_loss_price IS 'Stop Loss - Proteção -15%';
COMMENT ON COLUMN public.admin_crypto_portfolio.ai_validated IS 'TRUE se TP/SL foram validados por OpenAI';
COMMENT ON COLUMN public.admin_crypto_portfolio.ai_last_analysis IS 'Timestamp da última análise por IA';

COMMENT ON COLUMN public.admin_etf_portfolio.tp1_price IS 'Take Profit 1 - Alvo conservador (+30%)';
COMMENT ON COLUMN public.admin_etf_portfolio.tp2_price IS 'Take Profit 2 - Alvo moderado (+50%)';
COMMENT ON COLUMN public.admin_etf_portfolio.tp3_price IS 'Take Profit 3 - Alvo agressivo (+100%)';
COMMENT ON COLUMN public.admin_etf_portfolio.stop_loss_price IS 'Stop Loss - Proteção -10%';
COMMENT ON COLUMN public.admin_etf_portfolio.ai_validated IS 'TRUE se TP/SL foram validados por OpenAI';
COMMENT ON COLUMN public.admin_etf_portfolio.ai_last_analysis IS 'Timestamp da última análise por IA';

