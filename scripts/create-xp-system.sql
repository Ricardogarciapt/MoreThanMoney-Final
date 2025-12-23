-- ===================================================================
-- SISTEMA DE GAMIFICAÇÃO XP (EXPERIÊNCIA)
-- ===================================================================
-- Este script cria:
-- 1. Tabela de XP: Armazena pontos e nível de cada utilizador
-- 2. Tabela de XP Log: Histórico de pontos ganhos
-- 3. Tabela de configuração de pontos
-- 4. Triggers: Atualização automática de nível
-- 5. Funções RPC: Para atribuir e consultar XP
-- ===================================================================

-- 1. Criar tabela de XP
CREATE TABLE IF NOT EXISTS public.user_xp (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Sistema de XP
    total_xp INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    
    -- Badges/Conquistas (opcional)
    badges JSONB DEFAULT '[]'::jsonb,
    
    -- Metadados
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CHECK (total_xp >= 0),
    CHECK (current_level >= 1)
);

-- 2. Criar tabela de log de XP
CREATE TABLE IF NOT EXISTS public.xp_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Dados da ação
    xp_amount INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    action_description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Metadados
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CHECK (xp_amount > 0)
);

-- 3. Criar tabela de configuração de pontos
CREATE TABLE IF NOT EXISTS public.xp_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type TEXT UNIQUE NOT NULL,
    action_name TEXT NOT NULL,
    xp_amount INTEGER NOT NULL DEFAULT 10,
    max_per_day INTEGER DEFAULT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (xp_amount > 0)
);

-- 4. Inserir configurações padrão de pontos
INSERT INTO public.xp_config (action_type, action_name, xp_amount, max_per_day, description) VALUES
    -- Social
    ('social_like', 'Dar Gosto', 2, 50, 'Gosto em post do feed social'),
    ('social_comment', 'Comentar', 5, 20, 'Comentário em post do feed social'),
    ('social_share', 'Partilhar', 10, 10, 'Partilhar post nas redes sociais'),
    ('social_create_post', 'Criar Post', 15, 5, 'Criar novo post no feed social'),
    
    -- Scanner
    ('scanner_checklist_item', 'Item Checklist', 3, 100, 'Marcar item do checklist do scanner'),
    ('scanner_complete_checklist', 'Completar Checklist', 50, 10, 'Completar checklist completo'),
    
    -- Scanner Access
    ('scanner_access_view', 'Ver Scanner Access', 5, 20, 'Visualizar página scanner-access'),
    
    -- Trading
    ('trading_plan_created', 'Criar Plano Trading', 25, 3, 'Registrar plano de trading profissional'),
    ('trading_plan_updated', 'Atualizar Plano', 10, 10, 'Atualizar plano de trading'),
    ('position_calculator_used', 'Usar Calculadora', 3, 30, 'Usar calculadora de posição'),
    
    -- Onboarding
    ('onboarding_step_completed', 'Passo Onboarding', 20, 15, 'Completar passo do onboarding'),
    
    -- Desafios (opcional - future)
    ('daily_login', 'Login Diário', 10, 1, 'Fazer login no dia'),
    ('weekly_activity', 'Atividade Semanal', 50, 1, 'Manter atividade na semana')
ON CONFLICT (action_type) DO NOTHING;

-- 5. Criar índices
CREATE INDEX IF NOT EXISTS idx_user_xp_user_id ON public.user_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_xp_total_xp ON public.user_xp(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_xp_log_user_id ON public.xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_action_type ON public.xp_log(action_type);
CREATE INDEX IF NOT EXISTS idx_xp_log_created_at ON public.xp_log(created_at DESC);

-- 6. Função para calcular nível baseado em XP
-- Fórmula: Nível = sqrt(Total XP / 100)
CREATE OR REPLACE FUNCTION public.calculate_level(p_total_xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Calcular nível baseado em XP
    -- Fórmula crescente (cada nível requer mais XP)
    RETURN GREATEST(1, FLOOR(SQRT(p_total_xp / 100)) + 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Função para atualizar XP e nível automaticamente
CREATE OR REPLACE FUNCTION public.add_user_xp(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_xp_amount INTEGER;
    v_max_per_day INTEGER;
    v_xp_today INTEGER;
    v_new_total_xp INTEGER;
    v_new_level INTEGER;
    v_old_level INTEGER;
    v_result JSONB;
    v_metadata JSONB;
BEGIN
    -- Buscar configuração da ação
    SELECT xp_amount, max_per_day INTO v_xp_amount, v_max_per_day
    FROM public.xp_config
    WHERE action_type = p_action_type;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Action type não encontrado: ' || p_action_type
        );
    END IF;
    
    -- Verificar limite diário
    IF v_max_per_day IS NOT NULL THEN
        SELECT COALESCE(SUM(xp_amount), 0) INTO v_xp_today
        FROM public.xp_log
        WHERE user_id = p_user_id
        AND action_type = p_action_type
        AND created_at >= CURRENT_DATE;
        
        IF v_xp_today >= v_max_per_day THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Limite diário atingido para ' || p_action_type
            );
        END IF;
    END IF;
    
    -- Buscar XP atual do utilizador
    SELECT total_xp, current_level INTO v_new_total_xp, v_old_level
    FROM public.user_xp
    WHERE user_id = p_user_id;
    
    -- Se não existe, criar registo
    IF NOT FOUND THEN
        INSERT INTO public.user_xp (user_id, total_xp, current_level)
        VALUES (p_user_id, v_xp_amount, public.calculate_level(v_xp_amount))
        RETURNING total_xp, current_level INTO v_new_total_xp, v_old_level;
    ELSE
        -- Atualizar XP
        v_new_total_xp := v_new_total_xp + v_xp_amount;
        v_new_level := public.calculate_level(v_new_total_xp);
        
        UPDATE public.user_xp
        SET total_xp = v_new_total_xp,
            current_level = v_new_level,
            updated_at = NOW()
        WHERE user_id = p_user_id
        RETURNING current_level INTO v_new_level;
    END IF;
    
    -- Registrar no log
    INSERT INTO public.xp_log (user_id, xp_amount, action_type, action_description)
    VALUES (p_user_id, v_xp_amount, p_action_type, p_action_description);
    
    -- Preparar resposta
    v_metadata := jsonb_build_object(
        'old_level', v_old_level,
        'new_level', v_new_level,
        'level_up', (v_new_level > COALESCE(v_old_level, 0))
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'xp_gained', v_xp_amount,
        'total_xp', v_new_total_xp,
        'level', v_new_level,
        'metadata', v_metadata
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função para obter XP do utilizador
CREATE OR REPLACE FUNCTION public.get_user_xp(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_xp_data RECORD;
    v_rank INTEGER;
    v_total_users INTEGER;
BEGIN
    -- Se não fornecido, usar auth.uid()
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User ID necessário'
        );
    END IF;
    
    -- Buscar dados de XP
    SELECT * INTO v_xp_data
    FROM public.user_xp
    WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'xp_data', jsonb_build_object(
                'total_xp', 0,
                'current_level', 1,
                'xp_to_next_level', 100
            ),
            'rank', 0,
            'total_users', 0
        );
    END IF;
    
    -- Calcular ranking
    SELECT COUNT(*) INTO v_total_users
    FROM public.user_xp;
    
    SELECT COUNT(*) + 1 INTO v_rank
    FROM public.user_xp
    WHERE total_xp > v_xp_data.total_xp;
    
    -- XP necessário para próximo nível
    DECLARE
        xp_needed_for_next INTEGER;
    BEGIN
        xp_needed_for_next := (v_xp_data.current_level + 1)^2 * 100 - v_xp_data.total_xp;
    END;
    
    RETURN jsonb_build_object(
        'success', true,
        'xp_data', jsonb_build_object(
            'total_xp', v_xp_data.total_xp,
            'current_level', v_xp_data.current_level,
            'badges', v_xp_data.badges,
            'xp_to_next_level', GREATEST(0, xp_needed_for_next)
        ),
        'rank', v_rank,
        'total_users', v_total_users
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Habilitar RLS
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_log ENABLE ROW LEVEL SECURITY;

-- 10. Criar políticas RLS para user_xp
DROP POLICY IF EXISTS "Users can view their own XP" ON public.user_xp;
CREATE POLICY "Users can view their own XP" ON public.user_xp
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all XP" ON public.user_xp;
CREATE POLICY "Admins can view all XP" ON public.user_xp
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_type = 'admin'
        )
    );

-- 11. Criar políticas RLS para xp_log
DROP POLICY IF EXISTS "Users can view their own XP log" ON public.xp_log;
CREATE POLICY "Users can view their own XP log" ON public.xp_log
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own XP log" ON public.xp_log;
CREATE POLICY "Users can insert their own XP log" ON public.xp_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 12. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_xp_updated_at ON public.user_xp;
CREATE TRIGGER trigger_user_xp_updated_at
    BEFORE UPDATE ON public.user_xp
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Comentários
COMMENT ON TABLE public.user_xp IS 'Sistema de XP (Experiência) dos utilizadores';
COMMENT ON TABLE public.xp_log IS 'Histórico de XP ganho pelos utilizadores';
COMMENT ON TABLE public.xp_config IS 'Configuração de pontos por ação';
COMMENT ON FUNCTION public.calculate_level IS 'Calcula nível baseado em total de XP';
COMMENT ON FUNCTION public.add_user_xp IS 'Adiciona XP ao utilizador e atualiza nível';
COMMENT ON FUNCTION public.get_user_xp IS 'Obtém XP, nível e ranking do utilizador';

-- ===================================================================
-- FIM DO SCRIPT
-- ===================================================================

