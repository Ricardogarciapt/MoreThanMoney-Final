-- 243 · Alertas do Security Advisor da Supabase (10/11/2026)
--
-- 1) ERROR security_definer_view: public.agentes_metricas_geracao corria com as
--    permissões do criador e estava aberta a anon/authenticated (receita e gasto
--    dos agentes legíveis por qualquer visitante via /rest/v1). Nenhum código lê
--    esta vista; passa a SECURITY INVOKER e só o service_role lhe chega.
-- 2) WARN function_search_path_mutable (105 funções em public): fixa o
--    search_path igual ao de omissão da Supabase (public, extensions), por isso
--    nada muda no comportamento, só deixa de poder ser sequestrado.
-- 3) Automático para o futuro: event trigger que aplica as duas regras a cada
--    vista/função nova criada em public, para o alerta não voltar.
--
-- Fora daqui (definições do painel, não SQL): proteção de palavras-passe vazadas,
-- validade do OTP de email, actualização do Postgres.

begin;

-- 1) Vista
alter view public.agentes_metricas_geracao set (security_invoker = true);
revoke all on public.agentes_metricas_geracao from anon, authenticated;
grant select on public.agentes_metricas_geracao to service_role;

-- 2) search_path das funções existentes
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not coalesce(p.proconfig::text, '') ilike '%search_path%'
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- 3) Guarda automática para objectos novos
create or replace function public.seguranca_ddl_guarda()
returns event_trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands() loop
    if obj.schema_name <> 'public' or obj.in_extension then
      continue;
    end if;

    if obj.command_tag in ('CREATE VIEW') and obj.object_type = 'view' then
      execute format('alter view %s set (security_invoker = true)', obj.object_identity);

    elsif obj.command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE') then
      if not exists (
        select 1 from pg_proc p
        where p.oid = obj.objid
          and coalesce(p.proconfig::text, '') ilike '%search_path%'
      ) then
        execute format('alter %s %s set search_path = public, extensions, pg_temp',
          case when obj.command_tag = 'CREATE PROCEDURE' then 'procedure' else 'function' end,
          obj.object_identity);
      end if;
    end if;
  end loop;
exception when others then
  -- Nunca bloquear uma migração por causa da guarda: avisa e segue.
  raise warning 'seguranca_ddl_guarda: %', sqlerrm;
end $$;

revoke all on function public.seguranca_ddl_guarda() from public, anon, authenticated;

drop event trigger if exists seguranca_ddl_guarda;
create event trigger seguranca_ddl_guarda
  on ddl_command_end
  when tag in ('CREATE VIEW', 'CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function public.seguranca_ddl_guarda();

commit;
