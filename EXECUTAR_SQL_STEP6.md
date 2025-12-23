# 🎯 Executar SQL para Adicionar Passo 6 ao Fast Start

## ✅ **INSTRUÇÕES**

Para adicionar o **Passo 6: Apresentação do Negócio Digital** ao sistema de gamificação do Fast Start, execute o seguinte SQL no Supabase:

---

## 🚀 **COMO EXECUTAR**

### **1. Aceder ao Supabase**

1. Ir para: https://supabase.com/dashboard
2. Selecionar o projeto: `SITE-MORETHANMONEY-FINAL`
3. Clicar em: **SQL Editor** (menu lateral)
4. Clicar em: **New query**

### **2. Executar o SQL**

Copiar e colar o conteúdo do ficheiro `scripts/add-step6-fast-start.sql` no SQL Editor:

```sql
-- Adicionar coluna step_6_completed
ALTER TABLE public.fast_start_progress 
ADD COLUMN IF NOT EXISTS step_6_completed BOOLEAN DEFAULT FALSE;

-- Atualizar função de trigger para incluir step 6
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

-- Atualizar RPC function mark_fast_start_step_complete
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

-- Atualizar get function
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

-- Atualizar constraint
ALTER TABLE public.fast_start_progress 
DROP CONSTRAINT IF EXISTS fast_start_progress_progress_percent_check;

ALTER TABLE public.fast_start_progress 
ADD CONSTRAINT fast_start_progress_progress_percent_check 
CHECK (progress_percent >= 0 AND progress_percent <= 100);
```

### **3. Executar Query**

Clicar em **Run** (ou **⌘ + Enter** / **Ctrl + Enter**)

### **4. Verificar Resultado**

Deves ver:
- ✅ Query executed successfully
- Nenhum erro na consola

---

## ✅ **VERIFICAÇÃO**

### **Verificar Coluna Adicionada**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'fast_start_progress' 
AND column_name = 'step_6_completed';
```

Deve mostrar: `step_6_completed | boolean | false`

### **Testar Função**

```sql
SELECT update_fast_start_progress();
```

Deve retornar: ✅ Função atualizada corretamente

---

## 📋 **CHECKLIST**

Após executar o SQL:

- [ ] Coluna `step_6_completed` existe
- [ ] Trigger `update_fast_start_progress` funciona
- [ ] RPC `mark_fast_start_step_complete` aceita step 6
- [ ] RPC `get_fast_start_progress` retorna step 6
- [ ] Frontend mostra passo 6 gamificado
- [ ] Cálculo de progresso: 6 passos = 100%

---

**Pronto para executar no Supabase!** 🎉

