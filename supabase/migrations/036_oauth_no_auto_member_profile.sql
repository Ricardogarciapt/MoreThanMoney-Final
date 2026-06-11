-- OAuth: não criar membro activo ao primeiro login Google.
-- Perfil só fica válido após pagamento Stripe (complete-registration).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Não inserir perfil automático: registo/pagamento cria a linha em profiles.
  -- Evita backdoor OAuth (login sem subscrição).
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'No-op: perfil criado apenas após registo/pagamento, não no INSERT em auth.users.';
