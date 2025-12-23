-- Criar tabela admin_settings se não existir
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON public.admin_settings(setting_key);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_admin_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admin_settings_updated_at ON public.admin_settings;
CREATE TRIGGER trigger_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_settings_updated_at();

-- Inserir configurações padrão se não existirem
INSERT INTO public.admin_settings (setting_key, setting_value, description)
VALUES 
  ('site_name', '"MoreThanMoney"', 'Nome do site'),
  ('site_description', '"Plataforma de Trading e Educação Financeira"', 'Descrição do site'),
  ('maintenance_mode', 'false', 'Modo de manutenção'),
  ('registration_enabled', 'true', 'Registo de utilizadores'),
  ('auto_approve_users', 'true', 'Aprovação automática'),
  ('email_notifications', 'true', 'Notificações por email'),
  ('default_user_role', '"member"', 'Role padrão')
ON CONFLICT (setting_key) DO NOTHING;

-- Conceder permissões
GRANT SELECT ON public.admin_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_settings TO authenticated;

