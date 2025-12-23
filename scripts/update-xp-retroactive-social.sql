-- =====================================================
-- ATUALIZAR XP RETROATIVO - INTERAÇÕES SOCIAIS
-- =====================================================
-- Este script calcula e atribui XP para todas as 
-- interações sociais existentes:
-- - Posts criados (social_create_post)
-- - Likes dados (social_like)
-- - Comentários feitos (social_comment)
-- - Shares (social_share) - se houver tabela
-- =====================================================

-- 1. GARANTIR QUE XP_CONFIG TEM OS VALORES CORRETOS
INSERT INTO public.xp_config (action_type, action_name, xp_amount, max_per_day, description)
VALUES 
    ('social_create_post', 'Criar Post', 15, 5, 'Criar novo post no feed social'),
    ('social_like', 'Dar Gosto', 2, 50, 'Gosto em post do feed social'),
    ('social_comment', 'Comentar', 5, 20, 'Comentário em post do feed social'),
    ('social_share', 'Partilhar', 10, 10, 'Partilhar post nas redes sociais')
ON CONFLICT (action_type) 
DO UPDATE SET 
    xp_amount = CASE 
        WHEN xp_config.action_type = 'social_create_post' THEN 15
        WHEN xp_config.action_type = 'social_like' THEN 2
        WHEN xp_config.action_type = 'social_comment' THEN 5
        WHEN xp_config.action_type = 'social_share' THEN 10
        ELSE xp_config.xp_amount
    END,
    updated_at = NOW();

-- 2. FUNÇÃO PARA ADICIONAR XP COM LOG
CREATE OR REPLACE FUNCTION add_xp_with_log(
    p_user_id UUID,
    p_xp_amount INTEGER,
    p_action_type TEXT,
    p_description TEXT
)
RETURNS VOID AS $$
DECLARE
    v_current_xp INTEGER;
    v_new_total_xp INTEGER;
    v_new_level INTEGER;
BEGIN
    -- Buscar ou criar registro de XP
    INSERT INTO public.user_xp (user_id, total_xp, current_level)
    VALUES (p_user_id, 0, 1)
    ON CONFLICT (user_id) DO NOTHING;

    -- Buscar XP atual
    SELECT total_xp INTO v_current_xp
    FROM public.user_xp
    WHERE user_id = p_user_id;

    -- Calcular novo total e nível
    v_current_xp := COALESCE(v_current_xp, 0);
    v_new_total_xp := v_current_xp + p_xp_amount;
    v_new_level := FLOOR(v_new_total_xp / 100) + 1;

    -- Atualizar XP
    UPDATE public.user_xp
    SET 
        total_xp = v_new_total_xp,
        current_level = v_new_level,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Criar log
    INSERT INTO public.xp_log (user_id, xp_amount, action_type, action_description)
    VALUES (p_user_id, p_xp_amount, p_action_type, p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ATRIBUIR XP PARA POSTS CRIADOS
DO $$
DECLARE
    v_post RECORD;
    v_xp_per_post INTEGER := 15;
    v_count INTEGER := 0;
BEGIN
    FOR v_post IN 
        SELECT DISTINCT user_id, COUNT(*) as post_count
        FROM public.social_posts
        GROUP BY user_id
    LOOP
        -- Atribuir XP para cada post (respeitando max_per_day)
        FOR i IN 1..LEAST(v_post.post_count, 5) LOOP
            PERFORM add_xp_with_log(
                v_post.user_id,
                v_xp_per_post,
                'social_create_post',
                'Post criado no feed social (atribuição retroativa)'
            );
            v_count := v_count + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ XP atribuído para % posts', v_count;
END $$;

-- 4. ATRIBUIR XP PARA LIKES DADOS
DO $$
DECLARE
    v_like RECORD;
    v_xp_per_like INTEGER := 2;
    v_count INTEGER := 0;
    v_user_likes INTEGER;
BEGIN
    FOR v_like IN 
        SELECT user_id, COUNT(*) as like_count
        FROM public.social_likes
        GROUP BY user_id
    LOOP
        -- Atribuir XP para cada like (respeitando max_per_day de 50)
        v_user_likes := LEAST(v_like.like_count, 50);
        
        FOR i IN 1..v_user_likes LOOP
            PERFORM add_xp_with_log(
                v_like.user_id,
                v_xp_per_like,
                'social_like',
                'Gosto em post (atribuição retroativa)'
            );
            v_count := v_count + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ XP atribuído para % likes', v_count;
END $$;

-- 5. ATRIBUIR XP PARA COMENTÁRIOS FEITOS
DO $$
DECLARE
    v_comment RECORD;
    v_xp_per_comment INTEGER := 5;
    v_count INTEGER := 0;
    v_user_comments INTEGER;
BEGIN
    FOR v_comment IN 
        SELECT user_id, COUNT(*) as comment_count
        FROM public.social_comments
        GROUP BY user_id
    LOOP
        -- Atribuir XP para cada comentário (respeitando max_per_day de 20)
        v_user_comments := LEAST(v_comment.comment_count, 20);
        
        FOR i IN 1..v_user_comments LOOP
            PERFORM add_xp_with_log(
                v_comment.user_id,
                v_xp_per_comment,
                'social_comment',
                'Comentário em post (atribuição retroativa)'
            );
            v_count := v_count + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ XP atribuído para % comentários', v_count;
END $$;

-- 6. VERIFICAR SE EXISTE TABELA DE SHARES (opcional)
DO $$
DECLARE
    v_share_table_exists BOOLEAN;
    v_share RECORD;
    v_xp_per_share INTEGER := 10;
    v_count INTEGER := 0;
BEGIN
    -- Verificar se tabela existe
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'social_shares'
    ) INTO v_share_table_exists;

    IF v_share_table_exists THEN
        FOR v_share IN 
            SELECT user_id, COUNT(*) as share_count
            FROM public.social_shares
            GROUP BY user_id
        LOOP
            -- Atribuir XP para cada share (respeitando max_per_day de 10)
            FOR i IN 1..LEAST(v_share.share_count, 10) LOOP
                PERFORM add_xp_with_log(
                    v_share.user_id,
                    v_xp_per_share,
                    'social_share',
                    'Partilha de post (atribuição retroativa)'
                );
                v_count := v_count + 1;
            END LOOP;
        END LOOP;

        RAISE NOTICE '✅ XP atribuído para % shares', v_count;
    ELSE
        RAISE NOTICE 'ℹ️ Tabela social_shares não encontrada, ignorando';
    END IF;
END $$;

-- 7. RESUMO FINAL - VERIFICAR XP ATRIBUÍDO
SELECT 
    p.email,
    ux.total_xp,
    ux.current_level,
    COUNT(xl.id) as total_logs,
    SUM(CASE WHEN xl.action_type = 'social_create_post' THEN xl.xp_amount ELSE 0 END) as xp_from_posts,
    SUM(CASE WHEN xl.action_type = 'social_like' THEN xl.xp_amount ELSE 0 END) as xp_from_likes,
    SUM(CASE WHEN xl.action_type = 'social_comment' THEN xl.xp_amount ELSE 0 END) as xp_from_comments,
    SUM(CASE WHEN xl.action_type = 'social_share' THEN xl.xp_amount ELSE 0 END) as xp_from_shares
FROM public.user_xp ux
LEFT JOIN auth.users au ON au.id = ux.user_id
LEFT JOIN public.profiles p ON p.id = ux.user_id
LEFT JOIN public.xp_log xl ON xl.user_id = ux.user_id
WHERE xl.action_type IN ('social_create_post', 'social_like', 'social_comment', 'social_share')
GROUP BY p.email, ux.total_xp, ux.current_level
ORDER BY ux.total_xp DESC;

-- 8. ESTATÍSTICAS GLOBAIS
SELECT 
    '📊 ESTATÍSTICAS XP SOCIAL' as titulo,
    COUNT(DISTINCT xl.user_id) as usuarios_com_xp_social,
    SUM(xl.xp_amount) as total_xp_atribuido,
    COUNT(xl.id) as total_acoes,
    SUM(CASE WHEN xl.action_type = 'social_create_post' THEN 1 ELSE 0 END) as total_posts,
    SUM(CASE WHEN xl.action_type = 'social_like' THEN 1 ELSE 0 END) as total_likes,
    SUM(CASE WHEN xl.action_type = 'social_comment' THEN 1 ELSE 0 END) as total_comments,
    SUM(CASE WHEN xl.action_type = 'social_share' THEN 1 ELSE 0 END) as total_shares
FROM public.xp_log xl
WHERE xl.action_type IN ('social_create_post', 'social_like', 'social_comment', 'social_share');

-- ✅ Script de atualização retroativa de XP concluído!
