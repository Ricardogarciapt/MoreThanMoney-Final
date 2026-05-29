-- Controlo de acesso ao MTM Auto (pedido, aprovação e papel admin específico do produto)
alter table public.profiles
  add column if not exists mtm_auto_requested boolean not null default false,
  add column if not exists mtm_auto_requested_at timestamptz null,
  add column if not exists mtm_auto_enabled boolean not null default false,
  add column if not exists mtm_auto_enabled_at timestamptz null,
  add column if not exists mtm_auto_enabled_by uuid null references public.profiles(id) on delete set null,
  add column if not exists mtm_auto_admin boolean not null default false;

create index if not exists idx_profiles_mtm_auto_requested
  on public.profiles (mtm_auto_requested, mtm_auto_enabled);

create index if not exists idx_profiles_mtm_auto_admin
  on public.profiles (mtm_auto_admin);
