-- =====================================================
-- Tabelas admin: site_content e activity_logs
-- Sincronizado com APIs em /api/admin/* (stats, content, etc.)
-- =====================================================

-- site_content: conteúdo dinâmico gerido no dashboard admin
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- activity_logs: logs para secção "Atividade recente" no admin
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_site_content_category ON site_content(category);
CREATE INDEX IF NOT EXISTS idx_site_content_order ON site_content(order_index);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);

-- RLS
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage site content" ON site_content;
CREATE POLICY "Admins can manage site content" ON site_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

DROP POLICY IF EXISTS "Admins can view activity logs" ON activity_logs;
CREATE POLICY "Admins can view activity logs" ON activity_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert activity logs" ON activity_logs;
CREATE POLICY "Admins can insert activity logs" ON activity_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );
