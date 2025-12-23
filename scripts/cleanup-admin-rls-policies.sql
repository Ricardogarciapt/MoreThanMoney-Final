-- ============================================
-- LIMPEZA E OTIMIZAÇÃO DAS RLS POLICIES DO ADMIN
-- ============================================
-- Este script remove políticas duplicadas e mantém apenas as mais completas

-- Função helper para verificar se é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() 
    AND user_type = 'admin'::text
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 1. ADMIN_CRYPTO_PORTFOLIO
-- ============================================

-- Remover todas as políticas duplicadas
DROP POLICY IF EXISTS "Admin pode gerenciar crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admin pode gerir crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem ler crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem inserir crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem atualizar crypto" ON admin_crypto_portfolio;
DROP POLICY IF EXISTS "Admins podem apagar crypto" ON admin_crypto_portfolio;

-- Manter apenas "Todos podem ler crypto portfolio" para SELECT público
-- E criar uma única política ALL para admins
CREATE POLICY "Admins podem gerenciar crypto portfolio"
  ON admin_crypto_portfolio
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- A política de SELECT público já existe, manter

-- ============================================
-- 2. ADMIN_ETF_PORTFOLIO
-- ============================================

-- Remover todas as políticas duplicadas
DROP POLICY IF EXISTS "Admin pode gerenciar ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admin pode gerir ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem ler ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem inserir ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem atualizar ETF" ON admin_etf_portfolio;
DROP POLICY IF EXISTS "Admins podem apagar ETF" ON admin_etf_portfolio;

-- Criar uma única política ALL para admins
CREATE POLICY "Admins podem gerenciar ETF portfolio"
  ON admin_etf_portfolio
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- A política de SELECT público já existe, manter

-- ============================================
-- 3. ADMIN_SETTINGS
-- ============================================

-- Manter apenas uma política (a mais restritiva com is_active)
DROP POLICY IF EXISTS "Admins can manage settings" ON admin_settings;

-- Criar política otimizada
CREATE POLICY "Admins podem gerir configurações"
  ON admin_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- 4. EMAIL_CAMPAIGNS
-- ============================================

-- Remover políticas duplicadas e redundantes
DROP POLICY IF EXISTS "Admin cria campanhas" ON email_campaigns;
DROP POLICY IF EXISTS "Admin edita campanhas" ON email_campaigns;
DROP POLICY IF EXISTS "Admin vê todas campanhas" ON email_campaigns;
DROP POLICY IF EXISTS "Admin pode gerenciar campanhas" ON email_campaigns;

-- Criar uma única política ALL
CREATE POLICY "Admins podem gerir campanhas de email"
  ON email_campaigns
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Adicionar política de leitura pública (opcional, se quiser que todos vejam)
-- CREATE POLICY "Todos podem ler campanhas públicas"
--   ON email_campaigns
--   FOR SELECT
--   USING (status = 'sent' AND is_public = true);

-- ============================================
-- 5. NOTIFICATION_CONFIGS
-- ============================================

-- Remover políticas duplicadas
DROP POLICY IF EXISTS "Admin pode gerenciar notificações" ON notification_configs;
DROP POLICY IF EXISTS "Admins can manage notification configs" ON notification_configs;

-- Criar uma única política (usando a mais restritiva com is_active)
CREATE POLICY "Admins podem gerir notificações"
  ON notification_configs
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Opcional: Permitir que utilizadores vejam suas próprias notificações
-- CREATE POLICY "Utilizadores veem suas notificações"
--   ON notification_configs
--   FOR SELECT
--   USING (target_users = 'all' OR auth.uid() IN (
--     SELECT id FROM profiles 
--     WHERE CASE 
--       WHEN target_users = 'members' THEN user_type = 'member'
--       WHEN target_users = 'vip' THEN user_type = 'vip'
--       WHEN target_users = 'admin' THEN user_type = 'admin'
--       ELSE true
--     END
--   ));

-- ============================================
-- 6. SITE_CONTENT
-- ============================================

-- Remover política antiga
DROP POLICY IF EXISTS "Admins can manage site content" ON site_content;

-- Criar política otimizada usando função helper
CREATE POLICY "Admins podem gerir conteúdo do site"
  ON site_content
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================

-- Listar todas as políticas restantes
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN qual LIKE '%is_admin()%' THEN '✅ Usa função helper'
        ELSE '⚠️ Verificar'
    END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    'admin_crypto_portfolio',
    'admin_etf_portfolio',
    'admin_settings',
    'email_campaigns',
    'notification_configs',
    'site_content'
)
ORDER BY tablename, policyname;

-- ============================================
-- RESUMO
-- ============================================
-- ✅ Políticas duplicadas removidas
-- ✅ Função helper is_admin() criada
-- ✅ Políticas otimizadas para usar função
-- ✅ Mantidas políticas de leitura pública onde necessário

