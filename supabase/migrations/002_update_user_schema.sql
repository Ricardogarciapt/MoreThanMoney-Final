-- Atualizar schema de usuários com campos adicionais
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_media TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS jifu_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS jifu_affiliate_link VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) DEFAULT 'member' CHECK (user_type IN ('member', 'affiliate', 'admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Criar tabela para pedidos de mudança de role
CREATE TABLE IF NOT EXISTS role_change_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  current_role VARCHAR(20) NOT NULL,
  requested_role VARCHAR(20) NOT NULL CHECK (requested_role IN ('member', 'affiliate', 'admin')),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela para histórico de alterações de perfil
CREATE TABLE IF NOT EXISTS profile_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_role_change_requests_user_id ON role_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_status ON role_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_profile_changes_user_id ON profile_changes(user_id);

-- RLS Policies para role_change_requests
ALTER TABLE role_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own role change requests" ON role_change_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own role change requests" ON role_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all role change requests" ON role_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

CREATE POLICY "Admins can update role change requests" ON role_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- RLS Policies para profile_changes
ALTER TABLE profile_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile changes" ON profile_changes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert profile changes" ON profile_changes
  FOR INSERT WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_role_change_requests_updated_at 
  BEFORE UPDATE ON role_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para registrar mudanças de perfil
CREATE OR REPLACE FUNCTION log_profile_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Registrar mudanças em campos específicos
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    INSERT INTO profile_changes (user_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'full_name', OLD.full_name, NEW.full_name);
  END IF;
  
  IF OLD.phone IS DISTINCT FROM NEW.phone THEN
    INSERT INTO profile_changes (user_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'phone', OLD.phone, NEW.phone);
  END IF;
  
  IF OLD.whatsapp IS DISTINCT FROM NEW.whatsapp THEN
    INSERT INTO profile_changes (user_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'whatsapp', OLD.whatsapp, NEW.whatsapp);
  END IF;
  
  IF OLD.jifu_id IS DISTINCT FROM NEW.jifu_id THEN
    INSERT INTO profile_changes (user_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'jifu_id', OLD.jifu_id, NEW.jifu_id);
  END IF;
  
  IF OLD.jifu_affiliate_link IS DISTINCT FROM NEW.jifu_affiliate_link THEN
    INSERT INTO profile_changes (user_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'jifu_affiliate_link', OLD.jifu_affiliate_link, NEW.jifu_affiliate_link);
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para registrar mudanças de perfil
CREATE TRIGGER log_user_profile_changes
  AFTER UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION log_profile_change();
