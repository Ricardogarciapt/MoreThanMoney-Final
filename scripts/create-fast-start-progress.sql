-- ===================================================================
-- CRIAÇÃO DO SISTEMA DE PROGRESSO PARA FAST START (GAMIFICAÇÃO)
-- ===================================================================
-- Este script cria:
-- 1. Tabela fast_start_progress: Armazena o progresso de cada utilizador
-- 2. Triggers: Atualização automática de updated_at
-- 3. Índices: Otimização de queries
-- ===================================================================

-- 1. Criar tabela fast_start_progress
CREATE TABLE IF NOT EXISTS public.fast_start_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Passos concluídos (boolean para cada passo)
    step_1_completed BOOLEAN DEFAULT FALSE,
    step_2_completed BOOLEAN DEFAULT FALSE,
    step_3_completed BOOLEAN DEFAULT FALSE,
    step_4_completed BOOLEAN DEFAULT FALSE,
    step_5_completed BOOLEAN DEFAULT FALSE,
    
    -- Progresso geral
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    
    -- Metadados
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Um registo por utilizador
    UNIQUE(user_id)
);

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_fast_start_progress_user_id ON public.fast_start_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_fast_start_progress_progress ON public.fast_start_progress(progress_percent);

-- 3. Criar função para atualizar progress_percent automaticamente
CREATE OR REPLACE FUNCTION public.update_fast_start_progress()
RETURNS TRIGGER AS $$
DECLARE
    completed_steps INTEGER;
BEGIN
    -- Contar passos concluídos
    completed_steps := 0;
    IF NEW.step_1_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_2_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_3_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_4_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_5_completed THEN completed_steps := completed_steps + 1; END IF;
    
    -- Calcular percentagem (5 passos = 100%)
    NEW.progress_percent := (completed_steps * 100) / 5;
    
    -- Atualizar updated_at
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Criar trigger para atualizar progresso
DROP TRIGGER IF EXISTS trigger_update_fast_start_progress ON public.fast_start_progress;
CREATE TRIGGER trigger_update_fast_start_progress
    BEFORE INSERT OR UPDATE ON public.fast_start_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_fast_start_progress();

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE public.fast_start_progress ENABLE ROW LEVEL SECURITY;

-- 6. Criar políticas RLS
DROP POLICY IF EXISTS "Users can view their own progress" ON public.fast_start_progress;
CREATE POLICY "Users can view their own progress" ON public.fast_start_progress
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own progress" ON public.fast_start_progress;
CREATE POLICY "Users can update their own progress" ON public.fast_start_progress
    FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own progress" ON public.fast_start_progress;
CREATE POLICY "Users can insert their own progress" ON public.fast_start_progress
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all progress" ON public.fast_start_progress;
CREATE POLICY "Admins can view all progress" ON public.fast_start_progress
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_type = 'admin'
        )
    );

-- 7. Comentários
COMMENT ON TABLE public.fast_start_progress IS 'Armazena o progresso dos utilizadores no Fast Start (5 passos)';
COMMENT ON COLUMN public.fast_start_progress.progress_percent IS 'Percentagem de conclusão (0-100)';
COMMENT ON COLUMN public.fast_start_progress.step_1_completed IS 'Passo 1: Iniciar com a Visão Certa - concluído';
COMMENT ON COLUMN public.fast_start_progress.step_2_completed IS 'Passo 2: Instalar e Entrar na Comunidade - concluído';
COMMENT ON COLUMN public.fast_start_progress.step_3_completed IS 'Passo 3: Copiar e Colar - concluído';
COMMENT ON COLUMN public.fast_start_progress.step_4_completed IS 'Passo 4: Onboarding Rápido - concluído';
COMMENT ON COLUMN public.fast_start_progress.step_5_completed IS 'Passo 5: Recomendar e Crescer - concluído';

-- 8. RPC Function para marcar passo como concluído
CREATE OR REPLACE FUNCTION public.mark_fast_start_step_completed(
    p_step_number INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_user_id UUID;
    v_progress_record RECORD;
BEGIN
    -- Obter user_id do utilizador autenticado
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Utilizador não autenticado'
        );
    END IF;
    
    -- Verificar se registo existe, senão criar
    SELECT * INTO v_progress_record
    FROM public.fast_start_progress
    WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
        -- Criar registo inicial
        INSERT INTO public.fast_start_progress (user_id)
        VALUES (v_user_id)
        RETURNING * INTO v_progress_record;
    END IF;
    
    -- Atualizar passo específico
    CASE p_step_number
        WHEN 1 THEN
            UPDATE public.fast_start_progress
            SET step_1_completed = TRUE
            WHERE user_id = v_user_id
            RETURNING * INTO v_progress_record;
        WHEN 2 THEN
            UPDATE public.fast_start_progress
            SET step_2_completed = TRUE
            WHERE user_id = v_user_id
            RETURNING * INTO v_progress_record;
        WHEN 3 THEN
            UPDATE public.fast_start_progress
            SET step_3_completed = TRUE
            WHERE user_id = v_user_id
            RETURNING * INTO v_progress_record;
        WHEN 4 THEN
            UPDATE public.fast_start_progress
            SET step_4_completed = TRUE
            WHERE user_id = v_user_id
            RETURNING * INTO v_progress_record;
        WHEN 5 THEN
            UPDATE public.fast_start_progress
            SET step_5_completed = TRUE
            WHERE user_id = v_user_id
            RETURNING * INTO v_progress_record;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Número de passo inválido'
            );
    END CASE;
    
    -- Retornar resultado
    RETURN jsonb_build_object(
        'success', true,
        'progress', jsonb_build_object(
            'step_1_completed', v_progress_record.step_1_completed,
            'step_2_completed', v_progress_record.step_2_completed,
            'step_3_completed', v_progress_record.step_3_completed,
            'step_4_completed', v_progress_record.step_4_completed,
            'step_5_completed', v_progress_record.step_5_completed,
            'progress_percent', v_progress_record.progress_percent,
            'updated_at', v_progress_record.updated_at
        )
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC Function para obter progresso do utilizador
CREATE OR REPLACE FUNCTION public.get_fast_start_progress()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_user_id UUID;
    v_progress_record RECORD;
BEGIN
    -- Obter user_id do utilizador autenticado
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Utilizador não autenticado'
        );
    END IF;
    
    -- Buscar progresso
    SELECT * INTO v_progress_record
    FROM public.fast_start_progress
    WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
        -- Retornar progresso vazio
        RETURN jsonb_build_object(
            'success', true,
            'progress', jsonb_build_object(
                'step_1_completed', false,
                'step_2_completed', false,
                'step_3_completed', false,
                'step_4_completed', false,
                'step_5_completed', false,
                'progress_percent', 0
            )
        );
    END IF;
    
    -- Retornar progresso encontrado
    RETURN jsonb_build_object(
        'success', true,
        'progress', jsonb_build_object(
            'step_1_completed', v_progress_record.step_1_completed,
            'step_2_completed', v_progress_record.step_2_completed,
            'step_3_completed', v_progress_record.step_3_completed,
            'step_4_completed', v_progress_record.step_4_completed,
            'step_5_completed', v_progress_record.step_5_completed,
            'progress_percent', v_progress_record.progress_percent,
            'updated_at', v_progress_record.updated_at
        )
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================================================================
-- FIM DO SCRIPT
-- ===================================================================
-- Próximos passos:
-- 1. Executar este SQL no Supabase SQL Editor
-- 2. Criar API routes em app/api/fast-start/
-- 3. Atualizar app/fast-start/page.tsx com gamificação
-- ===================================================================

