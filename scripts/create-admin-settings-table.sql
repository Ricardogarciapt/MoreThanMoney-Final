-- Criar tabela admin_settings se não existir
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  content_config JSONB,
  theme_config JSONB,
  site_settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir registro inicial para site_content se não existir
INSERT INTO admin_settings (key, content_config, created_at, updated_at)
VALUES (
  'site_content',
  '{
    "videos": [],
    "links": []
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Inserir registro inicial para theme se não existir
INSERT INTO admin_settings (key, theme_config, created_at, updated_at)
VALUES (
  'site_theme',
  '{
    "primary": "#D2A63C",
    "secondary": "#BB8525",
    "accent": "#F3F3E6",
    "background": "#0A0A0A",
    "text": "#FFFFFF"
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(key);

-- RLS (Row Level Security) - permitir acesso apenas para admins
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Política: Admins podem ler
CREATE POLICY IF NOT EXISTS "Admins can read settings" ON admin_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
      AND profiles.is_active = true
    )
  );

-- Política: Admins podem atualizar
CREATE POLICY IF NOT EXISTS "Admins can update settings" ON admin_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
      AND profiles.is_active = true
    )
  );

-- Política: Admins podem inserir
CREATE POLICY IF NOT EXISTS "Admins can insert settings" ON admin_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
      AND profiles.is_active = true
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_admin_settings_updated_at ON admin_settings;

CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

