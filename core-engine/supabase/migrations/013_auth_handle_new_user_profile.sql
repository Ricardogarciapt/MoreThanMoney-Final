-- Perfil mínimo ao criar linha em auth.users (evita OAuth/login sem row em public.profiles).
-- ON CONFLICT DO NOTHING: se outro fluxo já inseriu o mesmo id, não faz nada (sem duplicar).
-- O registo na app usa upsert(onConflict: id) para substituir estes defaults pelos dados do formulário.

alter table public.profiles
  add column if not exists member_category text default 'standard';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  uname text;
  base text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  base := nullif(trim(lower(coalesce(meta->>'username', ''))), '');
  if base is null or base = '' then
    base := regexp_replace(
      lower(split_part(coalesce(nullif(trim(new.email), ''), 'user'), '@', 1)),
      '[^a-z0-9_]',
      '',
      'g'
    );
  end if;
  if base is null or base = '' then
    base := 'u';
  end if;

  uname := base || '_' || left(replace(new.id::text, '-', ''), 10);

  insert into public.profiles (
    id,
    email,
    full_name,
    username,
    avatar_url,
    user_type,
    member_category,
    is_active,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(nullif(trim(new.email), ''), ''),
    coalesce(
      nullif(trim(meta->>'full_name'), ''),
      nullif(trim(meta->>'name'), ''),
      'Utilizador'
    ),
    uname,
    nullif(trim(coalesce(meta->>'avatar_url', meta->>'picture', '')), ''),
    'member',
    'standard',
    true,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria public.profiles após INSERT em auth.users; ignora se o perfil já existir.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
