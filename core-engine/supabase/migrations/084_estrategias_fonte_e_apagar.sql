-- 084 — ESTRATÉGIAS MTM AUTO: fonte de execução (mestre | espelho), apagar sem perder histórico,
--        nomes das estratégias da casa, e pedidos de cópia do cliente pela app MTM Auto.
--
-- Depende da 083 (copia_rotas com prov:). Lê a 082 (espelho provider) SE existir: sem ela a troca
-- para 'espelho' é recusada (não há veredicto). Aditiva e idempotente. NÃO APLICAR sem rever.
--
-- 1. FONTE DE EXECUÇÃO por estratégia
--      'mestre'  → como hoje: a conta-mestre MetaApi (ou a fonte MTM do chat, nas mtm_t2t)
--      'espelho' → a conta MTM Funded da casa que o motor espelha com gestão própria (082)
--    A troca é UMA função (mtmauto_trocar_fonte_execucao), numa transacção, com a linha trancada:
--      · para 'espelho' exige conta espelho E public.espelho_alinhado(slug) = true (082);
--      · muda a fonte da estratégia E a origem das rotas de cópia `prov:` no mesmo commit;
--      · a identidade das posições é a da MESTRE nas duas fontes (trigger 083 lê ideia_ref do espelho;
--        o ingest do MTM Auto usa ref 'pos:<posição da mestre>') → as chaves únicas deduplicam: a mesma
--        trade nunca abre duas vezes por ter mudado de fonte.
--
-- 2. APAGAR = marcar (apagado_em). As FKs de mtmauto_signals/subscriptions são ON DELETE CASCADE: um
--    DELETE apagava o histórico de sinais e execuções dos clientes. A app nunca faz DELETE.
--
-- 3. NOMES das estratégias da casa (os slugs ficam).

begin;

-- ── 1. colunas ───────────────────────────────────────────────────────────────
alter table public.mtmauto_providers
  add column if not exists fonte_execucao text not null default 'mestre',
  add column if not exists fonte_execucao_desde timestamptz,
  add column if not exists fonte_execucao_por uuid,
  -- a 082 cria esta coluna; aqui só se garante que existe (a FK fica a cargo da 082)
  add column if not exists espelho_funded_account_id uuid,
  add column if not exists apagado_em timestamptz,
  add column if not exists apagado_por uuid;

alter table public.mtmauto_providers drop constraint if exists mtmauto_providers_fonte_execucao_check;
alter table public.mtmauto_providers add constraint mtmauto_providers_fonte_execucao_check
  check (fonte_execucao in ('mestre', 'espelho'));

create index if not exists mtmauto_providers_vivas_idx on public.mtmauto_providers (ativo) where apagado_em is null;

-- ── 2. nomes das estratégias da casa ─────────────────────────────────────────
update public.mtmauto_providers set nome = 'MTM Auto Premium', updated_at = now() where slug = 'premium-ouro' and nome is distinct from 'MTM Auto Premium';
update public.mtmauto_providers set nome = 'MTM Auto Sensei', updated_at = now() where slug = 'sensei' and nome is distinct from 'MTM Auto Sensei';
update public.mtmauto_providers set nome = 'MTM Auto Aurum Flow', updated_at = now() where slug = 'aurum-flow' and nome is distinct from 'MTM Auto Aurum Flow';
update public.mtmauto_providers set nome = 'MTM Auto GoldKiller', updated_at = now() where lower(slug) = 'goldkiller' and nome is distinct from 'MTM Auto GoldKiller';

-- ── 3. chave física da fonte de uma estratégia (a mesma regra de lib/copia-contas/regras.chaveFisica) ──
create or replace function public.mtmauto_provider_chave_fonte(p public.mtmauto_providers, p_fonte text)
returns table (tipo text, chave text)
language sql stable set search_path = public as $$
  select
    case
      when p_fonte = 'espelho' then 'mtmfunded'
      when p.tipo = 'mtmfunded' then 'mtmfunded'
      when p.tipo = 'tradelocker' then 'tradelocker'
      when p.plataforma = 'mt4' then 'mt4'
      else 'mt5'
    end,
    case
      when p_fonte = 'espelho' then case when p.espelho_funded_account_id is null then null else 'mtmfunded:' || lower(p.espelho_funded_account_id::text) end
      when p.tipo = 'mtmfunded' then case when p.funded_account_id is null then null else 'mtmfunded:' || lower(p.funded_account_id::text) end
      when p.tipo = 'tradelocker' then case when p.tl_env is null or p.tl_account_id is null then null else 'tl:' || lower(p.tl_env) || ':' || p.tl_account_id end
      when nullif(regexp_replace(coalesce(p.login, ''), '\D', '', 'g'), '') is not null and nullif(trim(coalesce(p.servidor, '')), '') is not null
        then 'mt:' || regexp_replace(p.login, '\D', '', 'g') || '@' || lower(trim(p.servidor))
      when p.metaapi_account_id is not null then 'metaapi:' || lower(p.metaapi_account_id)
      else null
    end
$$;
revoke all on function public.mtmauto_provider_chave_fonte(public.mtmauto_providers, text) from public, anon, authenticated;

-- ── 4. a troca atómica ───────────────────────────────────────────────────────
create or replace function public.mtmauto_trocar_fonte_execucao(p_provider uuid, p_fonte text, p_por uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.mtmauto_providers%rowtype;
  v_alinhado boolean := false;
  v_tipo text;
  v_chave text;
  v_rotas int := 0;
begin
  if p_fonte not in ('mestre', 'espelho') then
    raise exception 'fonte_execucao: fonte inválida %', p_fonte;
  end if;
  select * into p from public.mtmauto_providers where id = p_provider for update;
  if not found or p.apagado_em is not null then
    raise exception 'fonte_execucao: estratégia não encontrada';
  end if;
  if p.fonte_execucao = p_fonte then
    return jsonb_build_object('ok', true, 'mudou', false, 'fonte', p_fonte);
  end if;

  if p_fonte = 'espelho' then
    if p.espelho_funded_account_id is null then
      raise exception 'fonte_execucao: esta estratégia não tem conta espelho';
    end if;
    -- veredicto da 082; sem a função não há veredicto → recusa
    if to_regprocedure('public.espelho_alinhado(text)') is null then
      raise exception 'fonte_execucao: veredicto do espelho indisponível (migração 082 por aplicar)';
    end if;
    execute 'select public.espelho_alinhado($1)' into v_alinhado using p.slug;
    if not coalesce(v_alinhado, false) then
      raise exception 'fonte_execucao: o espelho de % ainda não está alinhado com a mestre', p.slug;
    end if;
  end if;

  select c.tipo, c.chave into v_tipo, v_chave from public.mtmauto_provider_chave_fonte(p, p_fonte) c;

  update public.mtmauto_providers
     set fonte_execucao = p_fonte, fonte_execucao_desde = now(), fonte_execucao_por = p_por, updated_at = now()
   where id = p.id;

  -- As rotas de cópia desta estratégia passam a ler a fonte nova no MESMO commit. Sem chave (a conta da
  -- fonte nova não está definida) as rotas ficam pausadas — nunca a ler a fonte antiga em silêncio.
  if v_chave is null then
    update public.copia_rotas set ativa = false, pausada_motivo = 'fonte da estratégia sem conta (' || p_fonte || ')'
     where origem_ref = 'prov:' || p.id::text and ativa;
  else
    update public.copia_rotas set origem_tipo = v_tipo, origem_chave = v_chave
     where origem_ref = 'prov:' || p.id::text and (origem_chave is distinct from v_chave or origem_tipo is distinct from v_tipo);
  end if;
  get diagnostics v_rotas = row_count;

  return jsonb_build_object('ok', true, 'mudou', true, 'fonte', p_fonte, 'rotas', v_rotas, 'chave', v_chave);
end $$;

revoke all on function public.mtmauto_trocar_fonte_execucao(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mtmauto_trocar_fonte_execucao(uuid, text, uuid) to service_role;

-- ── 5. pedidos de cópia pela app MTM Auto (cliente) ─────────────────────────
-- A app escreve pelo servidor (service role) com estado='pedido', ativa=false, modo='shadow'; o admin do
-- site aprova. Nada muda nas fechaduras. Só um índice para «as minhas rotas» por destino e origem.
create index if not exists copia_rotas_destino_ref_idx on public.copia_rotas (destino_ref);
create index if not exists copia_rotas_origem_ref_idx on public.copia_rotas (origem_ref);

commit;
