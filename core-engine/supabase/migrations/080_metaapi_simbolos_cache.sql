-- 080 — Cache PARTILHADA da lista de símbolos (e specs) por conta MetaApi + travão de quota.
--
-- Porquê: a 2026-09-15 10:45 UTC um sinal Premium (XAUUSD buy) FALHOU na mestre e em 3 subscritores
-- com «The ws:getSymbols API allows 4320000 cpu credits per 6h». A quota da MetaApi é por
-- APLICAÇÃO (token) e por API — o `getSymbols` custa 500 créditos e a lista vivia só na memória de
-- cada instância serverless. Os monitores de fundo (1 s / 5 s) acordavam instâncias novas que
-- voltavam a pedir a lista, e gastavam o balde que as ordens dos clientes precisavam.
--
-- Agora: a lista e as specs vivem aqui; cada instância lê a linha UMA vez e guarda em memória;
-- só uma instância de cada vez refresca (a_atualizar_ate), no máximo a cada 12 h ou num símbolo
-- desconhecido. A linha `account_id = '*'` guarda o bloqueio GLOBAL de quota (a quota é do token).
--
-- Lido/escrito pelo site (lib/mtmcopy/metaapi-simbolos-partilhados.ts) e pelo MTM Auto
-- (lib/simbolos-partilhados.ts). Só service role: RLS ligado e nenhuma política.

create table if not exists public.metaapi_simbolos_cache (
  account_id text primary key,
  simbolos text[] not null default '{}',
  -- { "<símbolo da corretora>": { "em": <epoch ms>, "v": { point, digits, tradeMode, ... } } }
  specs jsonb not null default '{}'::jsonb,
  -- null = nunca lida (ou marcada para refrescar)
  atualizado_em timestamptz,
  -- trinco de refresco: enquanto no futuro, outra instância está a pedir a lista
  a_atualizar_ate timestamptz,
  -- travão de quota: até esta hora os monitores de fundo não leem (as ordens nunca param)
  metaapi_quota_bloqueio_ate timestamptz,
  metaapi_quota_api text,
  metaapi_quota_motivo text
);

alter table public.metaapi_simbolos_cache enable row level security;
revoke all on public.metaapi_simbolos_cache from anon, authenticated;

-- Reclama o refresco da lista de uma conta, atómico. Devolve:
--   'ok'        → esta instância refresca (tem o trinco durante p_segundos)
--   'ocupado'   → outra instância já está a refrescar
--   'bloqueado' → quota esgotada (da conta ou global '*'): ninguém pede getSymbols
create or replace function public.metaapi_simbolos_reclamar(p_account_id text, p_segundos integer default 90)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.metaapi_simbolos_cache
     where account_id in (p_account_id, '*')
       and metaapi_quota_bloqueio_ate > now()
  ) then
    return 'bloqueado';
  end if;

  insert into public.metaapi_simbolos_cache (account_id) values (p_account_id)
  on conflict (account_id) do nothing;

  update public.metaapi_simbolos_cache
     set a_atualizar_ate = now() + make_interval(secs => greatest(10, least(p_segundos, 300)))
   where account_id = p_account_id
     and (a_atualizar_ate is null or a_atualizar_ate < now());

  if found then
    return 'ok';
  end if;
  return 'ocupado';
end;
$$;

-- Junta a spec de UM símbolo ao jsonb da conta (sem ler-modificar-escrever do lado da app).
create or replace function public.metaapi_simbolos_juntar_spec(p_account_id text, p_simbolo text, p_spec jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.metaapi_simbolos_cache (account_id, specs)
  values (p_account_id, jsonb_build_object(p_simbolo, p_spec))
  on conflict (account_id) do update
    set specs = public.metaapi_simbolos_cache.specs || jsonb_build_object(p_simbolo, p_spec);
$$;

-- Nada destas funções é para o público (ver o incidente das RPC definer abertas).
revoke all on function public.metaapi_simbolos_reclamar(text, integer) from public, anon, authenticated;
revoke all on function public.metaapi_simbolos_juntar_spec(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.metaapi_simbolos_reclamar(text, integer) to service_role;
grant execute on function public.metaapi_simbolos_juntar_spec(text, text, jsonb) to service_role;
