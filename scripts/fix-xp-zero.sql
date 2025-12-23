-- Script para verificar e corrigir problemas de XP

-- 1. Verificar registros de XP zerados
SELECT 
    ux.user_id,
    p.email,
    ux.total_xp,
    ux.current_level,
    COUNT(xl.id) as logs_count
FROM user_xp ux
LEFT JOIN auth.users au ON au.id = ux.user_id
LEFT JOIN profiles p ON p.id = ux.user_id
LEFT JOIN xp_log xl ON xl.user_id = ux.user_id
WHERE ux.total_xp = 0
GROUP BY ux.user_id, p.email, ux.total_xp, ux.current_level;

-- 2. Verificar se existem logs de XP mas o total está zerado
SELECT 
    ux.user_id,
    p.email,
    ux.total_xp as xp_atual,
    SUM(xl.xp_amount) as xp_total_logs
FROM user_xp ux
LEFT JOIN profiles p ON p.id = ux.user_id
LEFT JOIN xp_log xl ON xl.user_id = ux.user_id
GROUP BY ux.user_id, p.email, ux.total_xp
HAVING SUM(xl.xp_amount) > 0 AND ux.total_xp = 0;

-- 3. Verificar políticas RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('user_xp', 'xp_config', 'xp_log')
ORDER BY tablename, policyname;

-- 4. RECRIAR POLÍTICAS RLS (Execute se necessário)
-- Garantir que xp_config pode ser lido por todos
DROP POLICY IF EXISTS "Anyone can read xp_config" ON public.xp_config;
CREATE POLICY "Anyone can read xp_config" ON public.xp_config
    FOR SELECT
    USING (true);

-- Garantir que user_xp permite leitura/escrita do próprio user
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

-- Garantir que xp_log permite inserção do próprio user
DROP POLICY IF EXISTS "Users can insert own XP log" ON public.xp_log;
CREATE POLICY "Users can insert own XP log" ON public.xp_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own XP log" ON public.xp_log;
CREATE POLICY "Users can read own XP log" ON public.xp_log
    FOR SELECT
    USING (auth.uid() = user_id);

-- 5. Garantir que xp_config tem o registro correto
INSERT INTO public.xp_config (action_type, action_name, xp_amount, max_per_day, description)
VALUES ('onboarding_step_completed', 'Passo Onboarding', 50, 15, 'Completar passo do Fast Start')
ON CONFLICT (action_type) 
DO UPDATE SET 
    xp_amount = 50,
    updated_at = NOW();
