-- ===================================================================
-- ADICIONAR TRIGGERS DE XP PARA TABELA POSTS
-- ===================================================================
-- Cria triggers automáticos para adicionar XP quando users interagem
-- com posts (criar post, dar like, comentar)
-- ===================================================================

-- 1. Trigger para criar post
CREATE OR REPLACE FUNCTION public.add_xp_on_post_create()
RETURNS TRIGGER AS $$
DECLARE
    v_xp_amount INTEGER;
BEGIN
    -- Buscar XP para criar post
    SELECT xp_amount INTO v_xp_amount
    FROM public.xp_config
    WHERE action_type = 'social_create_post';
    
    IF v_xp_amount IS NULL THEN
        v_xp_amount := 15; -- Default
    END IF;
    
    -- Atualizar ou criar registo de XP
    INSERT INTO public.user_xp (user_id, total_xp, current_level)
    VALUES (NEW.user_id, v_xp_amount, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET total_xp = user_xp.total_xp + v_xp_amount,
        current_level = FLOOR((user_xp.total_xp + v_xp_amount) / 100) + 1,
        updated_at = NOW();
    
    -- Log XP
    INSERT INTO public.xp_log (user_id, xp_amount, action_type, action_description)
    VALUES (NEW.user_id, v_xp_amount, 'social_create_post', 'Criou post: ' || LEFT(NEW.content, 50));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_add_xp_on_post_create ON public.posts;
CREATE TRIGGER trigger_add_xp_on_post_create
    AFTER INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.add_xp_on_post_create();

-- 2. Trigger para dar like
CREATE OR REPLACE FUNCTION public.add_xp_on_post_like()
RETURNS TRIGGER AS $$
DECLARE
    v_xp_amount INTEGER;
BEGIN
    -- Buscar XP para dar like
    SELECT xp_amount INTO v_xp_amount
    FROM public.xp_config
    WHERE action_type = 'social_like';
    
    IF v_xp_amount IS NULL THEN
        v_xp_amount := 2; -- Default
    END IF;
    
    -- Atualizar ou criar registo de XP
    INSERT INTO public.user_xp (user_id, total_xp, current_level)
    VALUES (NEW.user_id, v_xp_amount, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET total_xp = user_xp.total_xp + v_xp_amount,
        current_level = FLOOR((user_xp.total_xp + v_xp_amount) / 100) + 1,
        updated_at = NOW();
    
    -- Log XP
    INSERT INTO public.xp_log (user_id, xp_amount, action_type, action_description)
    VALUES (NEW.user_id, v_xp_amount, 'social_like', 'Deu like em post');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_add_xp_on_post_like ON public.post_likes;
CREATE TRIGGER trigger_add_xp_on_post_like
    AFTER INSERT ON public.post_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.add_xp_on_post_like();

-- 3. Trigger para comentar
CREATE OR REPLACE FUNCTION public.add_xp_on_post_comment()
RETURNS TRIGGER AS $$
DECLARE
    v_xp_amount INTEGER;
BEGIN
    -- Buscar XP para comentar
    SELECT xp_amount INTO v_xp_amount
    FROM public.xp_config
    WHERE action_type = 'social_comment';
    
    IF v_xp_amount IS NULL THEN
        v_xp_amount := 5; -- Default
    END IF;
    
    -- Atualizar ou criar registo de XP
    INSERT INTO public.user_xp (user_id, total_xp, current_level)
    VALUES (NEW.user_id, v_xp_amount, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET total_xp = user_xp.total_xp + v_xp_amount,
        current_level = FLOOR((user_xp.total_xp + v_xp_amount) / 100) + 1,
        updated_at = NOW();
    
    -- Log XP
    INSERT INTO public.xp_log (user_id, xp_amount, action_type, action_description)
    VALUES (NEW.user_id, v_xp_amount, 'social_comment', 'Comentou post: ' || LEFT(NEW.content, 50));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_add_xp_on_post_comment ON public.post_comments;
CREATE TRIGGER trigger_add_xp_on_post_comment
    AFTER INSERT ON public.post_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.add_xp_on_post_comment();

-- Verificar triggers criados
SELECT 
  trigger_name, 
  event_object_table, 
  action_timing, 
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE '%xp%'
ORDER BY event_object_table, trigger_name;
