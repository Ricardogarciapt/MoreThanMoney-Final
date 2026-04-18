-- Permitir user_type 'inactive' (conta bloqueada no fluxo de auth / rotas)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (
    user_type IN (
      'member',
      'admin',
      'pending',
      'guest',
      'presentation',
      'inactive',
      'affiliate'
    )
  );
