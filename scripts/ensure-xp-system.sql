-- Garantir que o sistema XP está configurado corretamente

-- 1. Verificar/Criar tabela xp_config
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

-- 2. Inserir/Atualizar configuração para onboarding_step_completed
INSERT INTO public.xp_config (action_type, action_name, xp_amount, max_per_day, description)
VALUES ('onboarding_step_completed', 'Passo Onboarding', 50, 15, 'Completar passo do Fast Start')
ON CONFLICT (action_type) 
DO UPDATE SET 
    xp_amount = 50,
    updated_at = NOW();

-- 3. Garantir que RLS permite leitura pública de xp_config
ALTER TABLE public.xp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read xp_config" ON public.xp_config;
CREATE POLICY "Anyone can read xp_config" ON public.xp_config
    FOR SELECT
    USING (true);

-- 4. Garantir que user_xp permite leitura/escrita do próprio user
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own XP" ON public.user_xp;
CREATE POLICY "Users can read own XP" ON public.user_xp
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own XP" ON public.user_xp;
CREATE POLICY "Users can insert own XP" ON public.user_xp
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own XP" ON public.user_xp;
CREATE POLICY "Users can update own XP" ON public.user_xp
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Garantir que xp_log permite inserção do próprio user
ALTER TABLE public.xp_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own XP log" ON public.xp_log;
CREATE POLICY "Users can insert own XP log" ON public.xp_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own XP log" ON public.xp_log;
CREATE POLICY "Users can read own XP log" ON public.xp_log
    FOR SELECT
    USING (auth.uid() = user_id);
