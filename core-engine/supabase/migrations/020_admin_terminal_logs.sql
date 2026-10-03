-- Logs de comandos executados via /admin/terminalremoto
create table if not exists public.admin_terminal_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  command text not null,
  exit_code integer,
  success boolean not null default false,
  stdout text,
  stderr text,
  source_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_terminal_logs_admin_user_id
  on public.admin_terminal_logs(admin_user_id);

create index if not exists idx_admin_terminal_logs_created_at
  on public.admin_terminal_logs(created_at desc);

alter table public.admin_terminal_logs enable row level security;

drop policy if exists "Admins podem ver logs terminal" on public.admin_terminal_logs;
create policy "Admins podem ver logs terminal"
  on public.admin_terminal_logs
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.user_type = 'admin'
        and p.is_active = true
    )
  );

drop policy if exists "Service role escreve logs terminal" on public.admin_terminal_logs;
create policy "Service role escreve logs terminal"
  on public.admin_terminal_logs
  for insert
  with check (true);
