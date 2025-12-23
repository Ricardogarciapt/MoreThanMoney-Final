-- Corrige/garante admin principal
UPDATE users SET
  role = 'admin',
  user_type = 'admin',
  is_active = true,
  full_name = 'Administrador',
  username = 'admin'
WHERE email = 'admin@morethanmoney.pt';

-- Se não existir, oriente criar via painel Supabase Auth e rodar este script depois. 