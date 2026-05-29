create extension if not exists pgcrypto;

create table if not exists public.lms_academies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_educators (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  bio text,
  avatar_url text,
  academy_id uuid references public.lms_academies(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_streams (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.lms_academies(id) on delete cascade,
  educator_id uuid not null references public.lms_educators(id) on delete cascade,
  title text not null,
  description text,
  thumbnail_url text,
  stream_key text,
  rtmps_url text,
  playback_url text,
  chat_enabled boolean not null default true,
  is_live boolean not null default false,
  live_started_at timestamptz,
  live_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_stream_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.lms_streams(id) on delete cascade,
  sender_type text not null check (sender_type in ('student', 'educator')),
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lms_streams_academy on public.lms_streams(academy_id);
create index if not exists idx_lms_streams_educator on public.lms_streams(educator_id);
create index if not exists idx_lms_streams_live on public.lms_streams(is_live);
create index if not exists idx_lms_stream_messages_stream on public.lms_stream_messages(stream_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_lms_academies_updated_at on public.lms_academies;
create trigger trg_lms_academies_updated_at
before update on public.lms_academies
for each row execute function public.touch_updated_at();

drop trigger if exists trg_lms_educators_updated_at on public.lms_educators;
create trigger trg_lms_educators_updated_at
before update on public.lms_educators
for each row execute function public.touch_updated_at();

drop trigger if exists trg_lms_streams_updated_at on public.lms_streams;
create trigger trg_lms_streams_updated_at
before update on public.lms_streams
for each row execute function public.touch_updated_at();

alter table public.lms_academies enable row level security;
alter table public.lms_educators enable row level security;
alter table public.lms_streams enable row level security;
alter table public.lms_stream_messages enable row level security;

drop policy if exists lms_academies_read on public.lms_academies;
create policy lms_academies_read
on public.lms_academies
for select
using (true);

drop policy if exists lms_streams_read on public.lms_streams;
create policy lms_streams_read
on public.lms_streams
for select
using (true);

drop policy if exists lms_educators_read_basic on public.lms_educators;
create policy lms_educators_read_basic
on public.lms_educators
for select
using (is_active = true);

drop policy if exists lms_messages_read on public.lms_stream_messages;
create policy lms_messages_read
on public.lms_stream_messages
for select
using (true);

drop policy if exists lms_messages_insert_auth_users on public.lms_stream_messages;
create policy lms_messages_insert_auth_users
on public.lms_stream_messages
for insert
to authenticated
with check (sender_type = 'student');

insert into public.lms_academies (slug, name, description)
values
  ('academia', 'Academia', 'Aulas gerais de academia MTM'),
  ('cripto', 'Cripto', 'Aulas e análise de cripto ativos'),
  ('forex', 'Forex', 'Sessões ao vivo de Forex'),
  ('social-media', 'Social Media', 'Crescimento e marca pessoal'),
  ('imobiliario', 'Imobiliário', 'Educação imobiliária e estratégias'),
  ('fitness', 'Fitness', 'Performance e hábitos'),
  ('mindset', 'Mindset', 'Mentalidade e disciplina')
on conflict (slug) do nothing;

