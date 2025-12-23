-- ===================================================================
-- INSTALAÇÃO COMPLETA DO SISTEMA DE TRADING PLANS + JOURNALING
-- ===================================================================
-- Execute este script TODO de uma vez no Supabase SQL Editor
-- ===================================================================

-- ===================================================================
-- PARTE 1: SISTEMA DE PLANOS DE TRADING PROFISSIONAL
-- ===================================================================

-- 1. Criar tabela de planos de trading
CREATE TABLE IF NOT EXISTS public.trading_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Informações básicas
    plan_name TEXT NOT NULL DEFAULT 'Meu Plano de Trading',
    trader_name TEXT,
    
    -- Estilo de Trading
    trading_style TEXT NOT NULL CHECK (trading_style IN ('scalping', 'day_trading', 'swing', 'position', 'algorithmic')),
    
    -- Par de Moedas Favoritos
    favorite_pairs JSONB DEFAULT '[]'::jsonb,
    
    -- Horários de Trading
    trading_sessions JSONB DEFAULT '{
        "london": false,
        "new_york": false,
        "tokyo": false,
        "asian": false
    }'::jsonb,
    
    -- Gerenciamento de Risco
    max_risk_per_trade DECIMAL(5,2) DEFAULT 1.00 CHECK (max_risk_per_trade >= 0 AND max_risk_per_trade <= 10),
    max_daily_loss DECIMAL(10,2) DEFAULT 500.00 CHECK (max_daily_loss >= 0),
    max_concurrent_positions INTEGER DEFAULT 3 CHECK (max_concurrent_positions > 0),
    
    -- Objetivos
    daily_profit_target DECIMAL(10,2) DEFAULT 0.00,
    weekly_profit_target DECIMAL(10,2) DEFAULT 0.00,
    monthly_profit_target DECIMAL(10,2) DEFAULT 0.00,
    
    -- Riscos e Recompensas
    min_risk_reward_ratio DECIMAL(5,2) DEFAULT 1.5 CHECK (min_risk_reward_ratio > 0),
    max_risk_reward_ratio DECIMAL(5,2) DEFAULT 3.0 CHECK (max_risk_reward_ratio > 0),
    
    -- Estratégias
    entry_rules TEXT,
    exit_rules TEXT,
    stop_loss_rules TEXT,
    take_profit_rules TEXT,
    
    -- Regras Adicionais
    additional_rules TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_trading BOOLEAN DEFAULT false,
    
    -- Metadados
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criar tabela de histórico de trades
CREATE TABLE IF NOT EXISTS public.trading_plan_trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID REFERENCES public.trading_plans(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Dados do Trade
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
    entry_price DECIMAL(15,5) NOT NULL,
    exit_price DECIMAL(15,5),
    lot_size DECIMAL(10,2) NOT NULL,
    
    -- Risco e Recompensa
    stop_loss DECIMAL(15,5),
    take_profit DECIMAL(15,5),
    risk_amount DECIMAL(10,2) NOT NULL,
    risk_reward_ratio DECIMAL(5,2),
    
    -- Resultados
    pnl DECIMAL(10,2),
    pnl_percent DECIMAL(5,2),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'stopped', 'hit_tp')),
    
    -- Timestamps
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadados
    notes TEXT,
    tags JSONB DEFAULT '[]'::jsonb
);

-- 3. Criar índices PARTE 1
CREATE INDEX IF NOT EXISTS idx_trading_plans_user_id ON public.trading_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_plans_active ON public.trading_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_trading_plan_trades_plan_id ON public.trading_plan_trades(plan_id);
CREATE INDEX IF NOT EXISTS idx_trading_plan_trades_user_id ON public.trading_plan_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_plan_trades_status ON public.trading_plan_trades(status);
CREATE INDEX IF NOT EXISTS idx_trading_plan_trades_opened_at ON public.trading_plan_trades(opened_at DESC);

-- 4. Habilitar RLS
ALTER TABLE public.trading_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_plan_trades ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para trading_plans
DROP POLICY IF EXISTS "Users can view their own plans" ON public.trading_plans;
CREATE POLICY "Users can view their own plans" ON public.trading_plans
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own plans" ON public.trading_plans;
CREATE POLICY "Users can create their own plans" ON public.trading_plans
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own plans" ON public.trading_plans;
CREATE POLICY "Users can update their own plans" ON public.trading_plans
    FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own plans" ON public.trading_plans;
CREATE POLICY "Users can delete their own plans" ON public.trading_plans
    FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Políticas RLS para trading_plan_trades
DROP POLICY IF EXISTS "Users can view their own trades" ON public.trading_plan_trades;
CREATE POLICY "Users can view their own trades" ON public.trading_plan_trades
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own trades" ON public.trading_plan_trades;
CREATE POLICY "Users can create their own trades" ON public.trading_plan_trades
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON public.trading_plan_trades;
CREATE POLICY "Users can update their own trades" ON public.trading_plan_trades
    FOR UPDATE
    USING (auth.uid() = user_id);

-- 7. Trigger para updated_at
DROP TRIGGER IF EXISTS trigger_trading_plans_updated_at ON public.trading_plans;
CREATE TRIGGER trigger_trading_plans_updated_at
    BEFORE UPDATE ON public.trading_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Função para obter plano ativo
CREATE OR REPLACE FUNCTION public.get_active_trading_plan(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_plan RECORD;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User ID necessário'
        );
    END IF;
    
    SELECT * INTO v_plan
    FROM public.trading_plans
    WHERE user_id = v_user_id
    AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'has_plan', false,
            'plan', NULL
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'has_plan', true,
        'plan', row_to_json(v_plan)
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================================================================
-- PARTE 2: ADICIONAR CAMPOS DE JOURNALING
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

-- Comentários
COMMENT ON TABLE public.trading_plans IS 'Planos de trading profissional dos utilizadores';
COMMENT ON TABLE public.trading_plan_trades IS 'Histórico de trades executados segundo plano';
COMMENT ON COLUMN public.trading_plans.trading_style IS 'Estilo: scalping, day_trading, swing, position, algorithmic';
COMMENT ON FUNCTION public.get_active_trading_plan IS 'Obtém plano de trading ativo do utilizador';
COMMENT ON COLUMN public.trading_plan_trades.market_context IS 'Contexto do mercado durante o trade (ex: tendência, lateral, notícias)';
COMMENT ON COLUMN public.trading_plan_trades.setup_type IS 'Tipo de setup usado (ex: breakout, pullback, reversal)';
COMMENT ON COLUMN public.trading_plan_trades.entry_reason IS 'Razão específica para a entrada';
COMMENT ON COLUMN public.trading_plan_trades.emotions IS 'Estado emocional durante o trade';
COMMENT ON COLUMN public.trading_plan_trades.lessons_learned IS 'Lições aprendidas com este trade';
COMMENT ON COLUMN public.trading_plan_trades.screenshot_url IS 'URL para screenshot do trade';
COMMENT ON COLUMN public.trading_plan_trades.timeframe IS 'Timeframe principal do trade';

-- ===================================================================
-- VERIFICAÇÃO
-- ===================================================================

-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('trading_plans', 'trading_plan_trades')
ORDER BY table_name;

-- Verificar colunas de journaling
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'trading_plan_trades' 
  AND column_name IN ('market_context', 'setup_type', 'entry_reason', 'emotions', 'lessons_learned', 'screenshot_url', 'timeframe')
ORDER BY ordinal_position;

-- ===================================================================
-- FIM DO SCRIPT
-- ===================================================================
-- ✅ Pronto! Agora pode usar o sistema de Trading Plans + Journaling
-- ===================================================================

