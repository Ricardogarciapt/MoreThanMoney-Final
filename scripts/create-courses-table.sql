-- Criar tabela courses
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration VARCHAR(100),
  level VARCHAR(50) DEFAULT 'beginner',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir dados de exemplo na tabela courses (apenas se não existirem)
INSERT INTO courses (title, description, price, duration, level, is_active) 
SELECT 'Bootcamp MoreThanMoney', 'Curso completo de trading e educação financeira com a metodologia JIFU', 2500.00, '40 horas', 'beginner', true
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE title = 'Bootcamp MoreThanMoney');

INSERT INTO courses (title, description, price, duration, level, is_active) 
SELECT 'Educação de Distribuidores', 'Programa completo para formação de distribuidores JIFU', 1500.00, '30 horas', 'intermediate', true
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE title = 'Educação de Distribuidores');

INSERT INTO courses (title, description, price, duration, level, is_active) 
SELECT 'Inteligência Artificial no Trading', 'Como usar IA para melhorar suas estratégias de trading', 3000.00, '25 horas', 'advanced', false
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE title = 'Inteligência Artificial no Trading');

-- Habilitar RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se existirem)
DROP POLICY IF EXISTS "Courses are viewable by everyone" ON courses;
DROP POLICY IF EXISTS "Courses are insertable by admins" ON courses;
DROP POLICY IF EXISTS "Courses are updatable by admins" ON courses;
DROP POLICY IF EXISTS "Courses are deletable by admins" ON courses;

-- Criar políticas RLS para courses
CREATE POLICY "Courses are viewable by everyone" ON courses
  FOR SELECT USING (true);

CREATE POLICY "Courses are insertable by admins" ON courses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Courses are updatable by admins" ON courses
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  ));

CREATE POLICY "Courses are deletable by admins" ON courses
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
  )); 