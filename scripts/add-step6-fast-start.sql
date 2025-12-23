-- ===================================================================
-- ADICIONAR PASSO 6 AO FAST START
-- ===================================================================
-- Adiciona passo 6 (Apresentação do Negócio Digital) ao sistema
-- de gamificação do Fast Start
-- ===================================================================

-- 1. Adicionar coluna step_6_completed
ALTER TABLE public.fast_start_progress 
ADD COLUMN IF NOT EXISTS step_6_completed BOOLEAN DEFAULT FALSE;

-- 2. Atualizar função de trigger para incluir step 6
CREATE OR REPLACE FUNCTION public.update_fast_start_progress()
RETURNS TRIGGER AS $$
DECLARE
    completed_steps INTEGER;
BEGIN
    -- Contar passos concluídos (agora inclui step 6)
    completed_steps := 0;
    IF NEW.step_1_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_2_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_3_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_4_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_5_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_6_completed THEN completed_steps := completed_steps + 1; END IF;
    
    -- Calcular percentagem (6 passos = 100%)
    NEW.progress_percent := ROUND((completed_steps * 100.0) / 6);
    
    -- Atualizar updated_at
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Atualizar RPC function para incluir step 6
CREATE OR REPLACE FUNCTION public.mark_fast_start_step_complete(p_step_number INTEGER)
RETURNS JSONB AS $$
DECLARE
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
    
    -- Validar step_number
    IF p_step_number < 1 OR p_step_number > 6 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Número de passo inválido'
        );
    END IF;
    
    -- Criar ou atualizar progresso
    IF NOT EXISTS (SELECT 1 FROM public.fast_start_progress WHERE user_id = v_user_id) THEN
        INSERT INTO public.fast_start_progress (user_id, step_1_completed, step_2_completed, step_3_completed, step_4_completed, step_5_completed, step_6_completed)
        VALUES (v_user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE);
    END IF;
    
    -- Atualizar passo específico
    CASE p_step_number
        WHEN 1 THEN
            UPDATE public.fast_start_progress SET step_1_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 2 THEN
            UPDATE public.fast_start_progress SET step_2_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 3 THEN
            UPDATE public.fast_start_progress SET step_3_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 4 THEN
            UPDATE public.fast_start_progress SET step_4_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 5 THEN
            UPDATE public.fast_start_progress SET step_5_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 6 THEN
            UPDATE public.fast_start_progress SET step_6_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Número de passo inválido');
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
            'step_6_completed', v_progress_record.step_6_completed,
            'progress_percent', v_progress_record.progress_percent,
            'updated_at', v_progress_record.updated_at
        )
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar get function
CREATE OR REPLACE FUNCTION public.get_fast_start_progress()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_user_id UUID;
    v_progress_record RECORD;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Utilizador não autenticado');
    END IF;
    
    SELECT * INTO v_progress_record FROM public.fast_start_progress WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'progress', jsonb_build_object(
                'step_1_completed', FALSE,
                'step_2_completed', FALSE,
                'step_3_completed', FALSE,
                'step_4_completed', FALSE,
                'step_5_completed', FALSE,
                'step_6_completed', FALSE,
                'progress_percent', 0
            )
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'progress', jsonb_build_object(
            'step_1_completed', v_progress_record.step_1_completed,
            'step_2_completed', v_progress_record.step_2_completed,
            'step_3_completed', v_progress_record.step_3_completed,
            'step_4_completed', v_progress_record.step_4_completed,
            'step_5_completed', v_progress_record.step_5_completed,
            'step_6_completed', v_progress_record.step_6_completed,
            'progress_percent', v_progress_record.progress_percent
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atualizar constraint de percentagem
ALTER TABLE public.fast_start_progress 
DROP CONSTRAINT IF EXISTS fast_start_progress_progress_percent_check;

ALTER TABLE public.fast_start_progress 
ADD CONSTRAINT fast_start_progress_progress_percent_check 
CHECK (progress_percent >= 0 AND progress_percent <= 100);

-- Verificar se tudo foi atualizado
SELECT '✅ Tabela fast_start_progress atualizada com step_6_completed' AS status;
