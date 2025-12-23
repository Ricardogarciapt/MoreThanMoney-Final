-- ============================================
-- VERIFICAR SINCRONIZAÇÃO ADMIN - FRONTEND
-- ============================================
-- Script para verificar se todas as tabelas necessárias
-- para o admin panel existem e têm as colunas corretas

-- 1. Verificar tabelas principais do admin
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    -- notification_configs
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'notification_configs'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ notification_configs existe';
    ELSE
        RAISE NOTICE '❌ notification_configs NÃO existe';
    END IF;

    -- email_campaigns
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_campaigns'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ email_campaigns existe';
    ELSE
        RAISE NOTICE '❌ email_campaigns NÃO existe';
    END IF;

    -- admin_settings
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_settings'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ admin_settings existe';
    ELSE
        RAISE NOTICE '❌ admin_settings NÃO existe';
    END IF;

    -- site_content
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'site_content'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ site_content existe';
    ELSE
        RAISE NOTICE '❌ site_content NÃO existe';
    END IF;

    -- admin_crypto_portfolio
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_crypto_portfolio'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ admin_crypto_portfolio existe';
    ELSE
        RAISE NOTICE '❌ admin_crypto_portfolio NÃO existe';
    END IF;

    -- admin_etf_portfolio
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_etf_portfolio'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ admin_etf_portfolio existe';
    ELSE
        RAISE NOTICE '❌ admin_etf_portfolio NÃO existe';
    END IF;

    -- content_config
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'content_config'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ content_config existe';
    ELSE
        RAISE NOTICE '❌ content_config NÃO existe';
    END IF;
END $$;

-- 2. Verificar colunas críticas
DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    -- notification_configs.columns
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notification_configs') THEN
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'notification_configs' 
            AND column_name = 'type'
        ) INTO col_exists;
        
        IF col_exists THEN
            RAISE NOTICE '✅ notification_configs.type existe';
        ELSE
            RAISE NOTICE '❌ notification_configs.type NÃO existe';
        END IF;
    END IF;

    -- email_campaigns.columns
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_campaigns') THEN
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'email_campaigns' 
            AND column_name = 'template_name'
        ) INTO col_exists;
        
        IF col_exists THEN
            RAISE NOTICE '✅ email_campaigns.template_name existe';
        ELSE
            RAISE NOTICE '❌ email_campaigns.template_name NÃO existe';
        END IF;
    END IF;
END $$;

-- 3. Verificar RLS Policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    'notification_configs',
    'email_campaigns',
    'admin_settings',
    'site_content',
    'admin_crypto_portfolio',
    'admin_etf_portfolio',
    'content_config'
)
ORDER BY tablename, policyname;

-- ============================================
-- RESUMO FINAL
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Verificação concluída!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Executar scripts/cleanup-admin-rls-policies.sql para limpar duplicações';
    RAISE NOTICE '2. Verificar se todas as políticas estão funcionando corretamente';
    RAISE NOTICE '3. Testar operações CRUD em /admin';
END $$;

