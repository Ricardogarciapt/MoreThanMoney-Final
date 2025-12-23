-- ===================================================================
-- ADICIONAR CAMPOS DE JOURNALING À TABELA TRADING_PLAN_TRADES
-- ===================================================================
-- Adiciona campos adicionais para journaling profissional
-- ===================================================================

-- Adicionar campos de journaling
ALTER TABLE public.trading_plan_trades 
ADD COLUMN IF NOT EXISTS market_context TEXT,
ADD COLUMN IF NOT EXISTS setup_type TEXT,
ADD COLUMN IF NOT EXISTS entry_reason TEXT,
ADD COLUMN IF NOT EXISTS emotions TEXT,
ADD COLUMN IF NOT EXISTS lessons_learned TEXT,
ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS timeframe TEXT;

-- Criar função para calcular métricas mensais
CREATE OR REPLACE FUNCTION public.get_trading_metrics(user_uuid UUID, start_date DATE, end_date DATE)
RETURNS JSONB AS $$
DECLARE
    v_metrics JSONB;
    v_total_trades INTEGER;
    v_winning_trades INTEGER;
    v_total_pnl DECIMAL;
    v_total_risk DECIMAL;
    v_avg_rr DECIMAL;
    v_profit_factor DECIMAL;
    v_win_rate DECIMAL;
BEGIN
    -- Total de trades no período
    SELECT COUNT(*)
    INTO v_total_trades
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date;

    -- Trades vencedores
    SELECT COUNT(*)
    INTO v_winning_trades
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date
      AND pnl > 0;

    -- PnL total
    SELECT COALESCE(SUM(pnl), 0)
    INTO v_total_pnl
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date;

    -- Total arriscado
    SELECT COALESCE(SUM(risk_amount), 0)
    INTO v_total_risk
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date;

    -- R:R médio
    SELECT COALESCE(AVG(risk_reward_ratio), 0)
    INTO v_avg_rr
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date
      AND risk_reward_ratio IS NOT NULL;

    -- Win rate
    IF v_total_trades > 0 THEN
        v_win_rate := (v_winning_trades::DECIMAL / v_total_trades::DECIMAL) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    -- Profit Factor (gains / losses)
    SELECT 
        CASE 
            WHEN SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) > 0 
            THEN SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END)
            ELSE 0
        END
    INTO v_profit_factor
    FROM public.trading_plan_trades
    WHERE user_id = user_uuid
      AND status IN ('closed', 'stopped', 'hit_tp')
      AND closed_at >= start_date
      AND closed_at < end_date;

    -- Retornar métricas
    v_metrics := jsonb_build_object(
        'total_trades', v_total_trades,
        'winning_trades', v_winning_trades,
        'losing_trades', v_total_trades - v_winning_trades,
        'win_rate', ROUND(v_win_rate, 2),
        'total_pnl', v_total_pnl,
        'total_risk', v_total_risk,
        'avg_rr', ROUND(v_avg_rr, 2),
        'profit_factor', ROUND(v_profit_factor, 2),
        'net_pnl', v_total_pnl
    );

    RETURN v_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTA: Índice em DATE() não é suportado (não imutável)
-- Queries de data usam o índice existente em closed_at

-- Comentários nas colunas
COMMENT ON COLUMN public.trading_plan_trades.market_context IS 'Contexto do mercado durante o trade (ex: tendência, lateral, notícias)';
COMMENT ON COLUMN public.trading_plan_trades.setup_type IS 'Tipo de setup usado (ex: breakout, pullback, reversal)';
COMMENT ON COLUMN public.trading_plan_trades.entry_reason IS 'Razão específica para a entrada';
COMMENT ON COLUMN public.trading_plan_trades.emotions IS 'Estado emocional durante o trade';
COMMENT ON COLUMN public.trading_plan_trades.lessons_learned IS 'Lições aprendidas com este trade';
COMMENT ON COLUMN public.trading_plan_trades.screenshot_url IS 'URL para screenshot do trade';
COMMENT ON COLUMN public.trading_plan_trades.timeframe IS 'Timeframe principal do trade';

-- Verificar colunas adicionadas
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'trading_plan_trades' 
  AND column_name IN ('market_context', 'setup_type', 'entry_reason', 'emotions', 'lessons_learned', 'screenshot_url', 'timeframe')
ORDER BY ordinal_position;

