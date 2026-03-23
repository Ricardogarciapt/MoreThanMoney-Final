-- Tabela para gestão de conteúdo do site
CREATE TABLE IF NOT EXISTS site_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('link', 'video', 'file', 'text', 'image')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('navbar', 'footer', 'landing', 'education', 'trading', 'general')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT,
  content TEXT,
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'admin'
);

-- Tabela para logs de atividade
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('login', 'logout', 'content_created', 'content_updated', 'content_deleted', 'user_approved', 'user_role_changed')),
  details TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para configurações do sistema
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger às tabelas
CREATE TRIGGER update_site_content_updated_at BEFORE UPDATE ON site_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at BEFORE UPDATE ON admin_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir configurações padrão
INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
('site_name', '"MoreThanMoney"', 'Nome do site'),
('site_description', '"Plataforma de Trading e Educação Financeira"', 'Descrição do site'),
('maintenance_mode', 'false', 'Modo de manutenção ativado/desativado'),
('registration_enabled', 'true', 'Registo de novos utilizadores ativado/desativado'),
('auto_approve_users', 'false', 'Aprovação automática de utilizadores ativada/desativada'),
('email_notifications', 'true', 'Notificações por email ativadas/desativadas'),
('default_user_role', '"member"', 'Role padrão para novos utilizadores')
ON CONFLICT (setting_key) DO NOTHING;

-- Inserir conteúdo inicial do site
INSERT INTO site_content (type, category, title, description, url, order_index) VALUES
('link', 'navbar', 'Início', 'Link para página inicial', '/new-landing', 1),
('link', 'navbar', 'Educação', 'Menu de educação com submenu', '/iqonic', 2),
('link', 'navbar', 'Trading', 'Menu de trading com submenu', '/swipetotrade', 3),
('link', 'navbar', 'Onboarding', 'Processo de onboarding', '/onboarding', 4),
('link', 'navbar', 'Início Rápido', 'Fast start para novos membros', '/fast-start', 5),
('link', 'education', 'Apresentação IQONIC', 'Link para apresentação IQONIC', '/iqonic', 1),
('link', 'education', 'IQonic Academy', 'Link para IQonic Academy', 'https://iqonic.vip', 2),
('link', 'education', 'Educação MTM', 'Link para cursos MoreThanMoney', 'https://www.skool.com/morethanmoney-1132/about', 3),
('link', 'education', 'AI Com Os Gemeos', 'Link para comunidade AI', 'https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b', 4),
('link', 'education', 'BackOffice IQ', 'Link para backoffice IQONIC', 'https://user.iqonic.life', 5),
('link', 'trading', 'IQ Sync - Configurar', 'Configuração do IQ Sync', '/swipetotrade', 1),
('link', 'trading', 'Os nossos Scanners', 'Página dos scanners', '/scanner', 2),
('link', 'trading', 'Scanner ao Vivo', 'Acesso aos scanners ao vivo', '/scanner-access', 3),
('link', 'trading', 'Automatização', 'Página de automatização', '/automation', 4),
('link', 'trading', 'Portefólios', 'Portefólios inteligentes', '/portfolios', 5),
('video', 'landing', 'Vídeo de Apresentação', 'Vídeo principal da landing page', 'https://youtu.be/dgd0-mLIrMw', 1),
('video', 'onboarding', 'Vídeo de Onboarding', 'Vídeo do processo de onboarding', 'https://youtu.be/q-23MppHFDI', 1),
('video', 'fast-start', 'Sistema MoreThanMoney', 'Vídeo explicativo do sistema', 'https://youtu.be/TJ_1rvK-DgY', 1),
('video', 'swipetotrade', 'Como Aceitar Trade', 'Vídeo explicativo de como aceitar trades', 'https://youtu.be/TxQS2GW5NkE', 1)
ON CONFLICT DO NOTHING;

-- Políticas de segurança (RLS)
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Política para site_content - apenas admins podem modificar
CREATE POLICY "Admins can manage site content" ON site_content
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_type = 'admin'
        )
    );

-- Política para activity_logs - apenas admins podem ver
CREATE POLICY "Admins can view activity logs" ON activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_type = 'admin'
        )
    );

-- Política para admin_settings - apenas admins podem modificar
CREATE POLICY "Admins can manage settings" ON admin_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_type = 'admin'
        )
    );

-- Função para inserir log de atividade
CREATE OR REPLACE FUNCTION log_activity(
    p_user_email VARCHAR(255),
    p_action VARCHAR(50),
    p_details TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO activity_logs (user_email, action, details)
    VALUES (p_user_email, p_action, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter estatísticas do admin
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_users', (SELECT COUNT(*) FROM profiles),
        'active_users', (SELECT COUNT(*) FROM profiles WHERE is_active = true),
        'pending_users', (SELECT COUNT(*) FROM profiles WHERE user_type = 'pending'),
        'total_content', (SELECT COUNT(*) FROM site_content),
        'active_content', (SELECT COUNT(*) FROM site_content WHERE is_active = true),
        'recent_activity', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', id,
                    'user_email', user_email,
                    'action', action,
                    'details', details,
                    'timestamp', timestamp
                ) ORDER BY timestamp DESC
            ), '[]'::json)
            FROM activity_logs 
            WHERE timestamp >= NOW() - INTERVAL '7 days'
            LIMIT 50
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
