# ⚡ EXECUTAR SQLs AGORA

## 🎯 **INSTRUÇÕES RÁPIDAS**

1. Ir para: https://supabase.com/dashboard
2. Selecionar projeto: SITE-MORETHANMONEY-FINAL
3. Clicar em: **SQL Editor** (menu lateral)
4. **Copy-paste** cada SQL abaixo e clicar em **RUN**
5. Verificar ✅ se executou corretamente

---

## 🚀 **SQL 1: IQONIC ID**

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS iqonic_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_iqonic_id ON public.profiles(iqonic_id);

COMMENT ON COLUMN public.profiles.iqonic_id IS 'ID do membro IQONIC (obrigatório para membros VXA e RFG)';
```

---

## 🚀 **SQL 2: PASSO 6 FAST START**

```sql
ALTER TABLE public.fast_start_progress 
ADD COLUMN IF NOT EXISTS step_6_completed BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.update_fast_start_progress()
RETURNS TRIGGER AS $$
DECLARE
    completed_steps INTEGER;
BEGIN
    completed_steps := 0;
    IF NEW.step_1_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_2_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_3_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_4_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_5_completed THEN completed_steps := completed_steps + 1; END IF;
    IF NEW.step_6_completed THEN completed_steps := completed_steps + 1; END IF;
    NEW.progress_percent := ROUND((completed_steps * 100.0) / 6);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.mark_fast_start_step_complete(p_step_number INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_progress_record RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Utilizador não autenticado');
    END IF;
    IF p_step_number < 1 OR p_step_number > 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de passo inválido');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fast_start_progress WHERE user_id = v_user_id) THEN
        INSERT INTO public.fast_start_progress (user_id, step_1_completed, step_2_completed, step_3_completed, step_4_completed, step_5_completed, step_6_completed)
        VALUES (v_user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE);
    END IF;
    CASE p_step_number
        WHEN 1 THEN UPDATE public.fast_start_progress SET step_1_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 2 THEN UPDATE public.fast_start_progress SET step_2_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 3 THEN UPDATE public.fast_start_progress SET step_3_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 4 THEN UPDATE public.fast_start_progress SET step_4_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 5 THEN UPDATE public.fast_start_progress SET step_5_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        WHEN 6 THEN UPDATE public.fast_start_progress SET step_6_completed = TRUE WHERE user_id = v_user_id RETURNING * INTO v_progress_record;
        ELSE RETURN jsonb_build_object('success', false, 'error', 'Número de passo inválido');
    END CASE;
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
                'step_1_completed', FALSE, 'step_2_completed', FALSE, 'step_3_completed', FALSE,
                'step_4_completed', FALSE, 'step_5_completed', FALSE, 'step_6_completed', FALSE,
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

ALTER TABLE public.fast_start_progress 
DROP CONSTRAINT IF EXISTS fast_start_progress_progress_percent_check;

ALTER TABLE public.fast_start_progress 
ADD CONSTRAINT fast_start_progress_progress_percent_check 
CHECK (progress_percent >= 0 AND progress_percent <= 100);
```

---

## 🚀 **SQL 3: SISTEMA XP (completo)**

Ver ficheiro: `scripts/create-xp-system.sql` (337 linhas)

**⚠️ IMPORTANTE:** Este SQL é MUITO GRANDE. Copia todo o conteúdo do ficheiro `scripts/create-xp-system.sql` e cola no Supabase SQL Editor.

---

## ✅ **VERIFICAÇÃO FINAL**

Depois de executar tudo, roda este SQL para verificar:

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('iqonic_id', 'onboarding_platform', 'member_category')
ORDER BY column_name;
```

Deve mostrar 3 linhas.

---

**Pronto! 🎉**
