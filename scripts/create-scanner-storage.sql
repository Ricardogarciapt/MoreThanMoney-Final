-- ===================================================================
-- SISTEMA DE ARMAZENAMENTO PARA SCANNER ACCESS
-- ===================================================================
-- Este script cria:
-- 1. Tabela de charts/desenhos do TradingView (charting library)
-- 2. Tabela de progresso da checklist
-- 3. RLS policies
-- 4. Triggers para timestamps
-- ===================================================================

-- 1. Criar tabela de charts (charting library)
CREATE TABLE IF NOT EXISTS public.user_charts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Informações do chart
    chart_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    theme TEXT NOT NULL CHECK (theme IN ('light', 'dark')),
    
    -- Estado do chart (configurações, estudos, etc.)
    chart_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Desenhos do TradingView (drawings, annotations, etc.)
    -- O TradingView pode salvar desenhos via sua API, mas guardamos também aqui
    drawings_data JSONB DEFAULT '[]'::jsonb,
    
    -- Estudos selecionados
    selected_studies JSONB DEFAULT '[]'::jsonb,
    
    -- Metadados
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CHECK (chart_name <> ''),
    CHECK (symbol <> '')
);

-- 2. Criar tabela de progresso da checklist
CREATE TABLE IF NOT EXISTS public.user_checklist_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Estado da checklist (JSONB para flexibilidade)
    checklist_data JSONB NOT NULL DEFAULT '{
        "sections": []
    }'::jsonb,
    
    -- Progresso total
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Última atualização
    last_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    CHECK (completed_items >= 0),
    CHECK (total_items >= 0)
);

-- 3. Criar índices
CREATE INDEX IF NOT EXISTS idx_user_charts_user_id ON public.user_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_charts_created_at ON public.user_charts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_charts_is_favorite ON public.user_charts(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_checklist_progress_user_id ON public.user_checklist_progress(user_id);

-- 4. Criar função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Criar triggers para updated_at
DROP TRIGGER IF EXISTS update_user_charts_updated_at ON public.user_charts;
CREATE TRIGGER update_user_charts_updated_at
    BEFORE UPDATE ON public.user_charts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_checklist_progress_updated_at ON public.user_checklist_progress;
CREATE TRIGGER update_user_checklist_progress_updated_at
    BEFORE UPDATE ON public.user_checklist_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Habilitar RLS
ALTER TABLE public.user_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checklist_progress ENABLE ROW LEVEL SECURITY;

-- 7. Criar políticas RLS para user_charts
DROP POLICY IF EXISTS "Users can view own charts" ON public.user_charts;
CREATE POLICY "Users can view own charts" ON public.user_charts
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own charts" ON public.user_charts;
CREATE POLICY "Users can create own charts" ON public.user_charts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own charts" ON public.user_charts;
CREATE POLICY "Users can update own charts" ON public.user_charts
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own charts" ON public.user_charts;
CREATE POLICY "Users can delete own charts" ON public.user_charts
    FOR DELETE
    USING (auth.uid() = user_id);

-- 8. Criar políticas RLS para user_checklist_progress
DROP POLICY IF EXISTS "Users can view own checklist" ON public.user_checklist_progress;
CREATE POLICY "Users can view own checklist" ON public.user_checklist_progress
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own checklist" ON public.user_checklist_progress;
CREATE POLICY "Users can create own checklist" ON public.user_checklist_progress
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own checklist" ON public.user_checklist_progress;
CREATE POLICY "Users can update own checklist" ON public.user_checklist_progress
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 9. Verificação final
SELECT 
    '✅ Tabelas criadas com sucesso!' as status,
    'user_charts' as tabela_1,
    'user_checklist_progress' as tabela_2;




