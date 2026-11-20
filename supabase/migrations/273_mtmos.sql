-- MTMOS no site (/mtmos, só super admin) — 20/11/2026.
-- O artefacto MTMOS guardava tarefas, briefings, ideias, guiões e ordens na base de dados do
-- artefacto. No site, as mesmas colecções vivem aqui. Só o service role toca nisto: as APIs
-- /api/mtmos/* verificam o super admin antes de chegar cá.
create table if not exists public.mtmos_docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  atualizado timestamptz not null default now(),
  primary key (col, id)
);
alter table public.mtmos_docs enable row level security;
revoke all on public.mtmos_docs from anon, authenticated;

-- Consultas só de leitura do Jarvis e dos cartões (KPIs, B2B). Envolve a consulta numa subconsulta
-- (um só comando) e recusa palavras que escrevem. Só o service role a pode chamar.
create or replace function public.mtmos_sql_leitura(q text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if q !~* '^\s*(select|with)\s' then raise exception 'só leitura (SELECT/WITH)'; end if;
  if q ~* '\m(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|merge|vacuum|lock|pg_sleep|dblink|set_config)\M' then
    raise exception 'só leitura';
  end if;
  perform set_config('statement_timeout', '8000', true);
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || regexp_replace(q, ';\s*$', '') || ') t' into r;
  return r;
end $$;
revoke all on function public.mtmos_sql_leitura(text) from public, anon, authenticated;
grant execute on function public.mtmos_sql_leitura(text) to service_role;
