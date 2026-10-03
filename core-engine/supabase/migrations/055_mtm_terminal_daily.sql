-- Cache da análise diária do Terminal MTM (gerada pelo cron das ~9h de Lisboa).
-- A página lê daqui e mostra a análise ao abrir, sem gerar por visita.

create table if not exists public.mtm_terminal_daily (
  symbol text primary key,
  name text,
  analysis text,
  quote jsonb,
  model text,
  generated_at timestamptz not null default now()
);

alter table public.mtm_terminal_daily enable row level security;

-- Leitura via service role (a API valida o acesso Premium/VIP/Admin).
do $$
begin
  if not exists (select 1 from pg_policies where policyname='mtm_terminal_daily_read' and tablename='mtm_terminal_daily') then
    create policy "mtm_terminal_daily_read" on public.mtm_terminal_daily for select using (true);
  end if;
end$$;
