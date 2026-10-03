create extension if not exists pgcrypto;

create table if not exists public.mentor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phase text not null default 'onboarding',
  target_rank text not null default 'rising_star',
  current_rank text not null default 'starter',
  pe_left integer not null default 0,
  pe_right integer not null default 0,
  cv_left integer not null default 0,
  cv_right integer not null default 0,
  telegram_start_token text unique,
  telegram_chat_id text,
  first_72h_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentor_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  phase text not null default 'onboarding',
  source text not null default 'system',
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  due_at timestamptz,
  completed_at timestamptz,
  xp_reward integer not null default 25,
  created_at timestamptz not null default now(),
  unique(user_id, code)
);

create index if not exists idx_mentor_tasks_user_status on public.mentor_tasks(user_id, status, due_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mentor_profiles_updated_at on public.mentor_profiles;
create trigger trg_mentor_profiles_updated_at
before update on public.mentor_profiles
for each row execute function public.touch_updated_at();

alter table public.mentor_profiles enable row level security;
alter table public.mentor_tasks enable row level security;

drop policy if exists mentor_profiles_select_own on public.mentor_profiles;
create policy mentor_profiles_select_own
on public.mentor_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists mentor_profiles_insert_own on public.mentor_profiles;
create policy mentor_profiles_insert_own
on public.mentor_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists mentor_profiles_update_own on public.mentor_profiles;
create policy mentor_profiles_update_own
on public.mentor_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists mentor_tasks_select_own on public.mentor_tasks;
create policy mentor_tasks_select_own
on public.mentor_tasks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists mentor_tasks_insert_own on public.mentor_tasks;
create policy mentor_tasks_insert_own
on public.mentor_tasks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists mentor_tasks_update_own on public.mentor_tasks;
create policy mentor_tasks_update_own
on public.mentor_tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

