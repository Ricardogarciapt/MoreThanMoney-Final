-- 083 — CÓPIA ENTRE CONTAS × PROVIDERS DAS EQUIPAS × COPIADOR 068
--
-- (082 = espelho provider, noutro ramo; esta não depende dela e pode aplicar-se antes ou depois.)
--
-- Três coisas, todas aditivas e idempotentes. NÃO APLICAR sem rever; nada aqui liga motores.
--
-- 1. PROVIDERS DAS EQUIPAS COMO FONTES DE CÓPIA
--    Uma conta de estratégia (mtmauto_providers) passa a poder ser ORIGEM de rotas de cópia — sem
--    duplicar a conta: o motor usa a mesma ligação de streaming para todas as rotas dessa conta.
--    Referência nova `prov:<uuid>` (só na origem; um provider nunca é destino).
--    Tipos novos de provider: 'mtmfunded' (conta simulada, lida pela base) e 'tradelocker' (API TL).
--    Um provider MT criado pela equipa vive na chave MetaApi DA EQUIPA (`metaapi_chave_equipa=true`)
--    — o motor nunca usa a chave de uma equipa numa conta de outra, nem a da casa numa conta da equipa.
--
-- 2. FAN-OUT DE PROVIDERS
--    O limite de 5 destinos por origem é para contas de clientes (evita uma conta a copiar para
--    meio mundo por engano). Uma estratégia serve muitos seguidores: `prov:` fica com 2000.
--    O trigger da fonte MTM Funded passa a procurar rotas pela CHAVE FÍSICA (mtmfunded:<id>), para
--    apanhar tanto `funded:<id>` como um provider MTM Funded sobre a mesma conta.
--
-- 3. MIGRAÇÃO DO COPIADOR MTM FUNDED (068)
--    `copia_rotas.migrada_de` liga a rota nova ao funded_copiers de onde veio (único → o script
--    scripts/copia-contas/migrar-funded-copiers.ts é repetível). A vista de compatibilidade deixa
--    de mostrar em duplicado um copiador já migrado.

begin;

-- ── 1. providers: tipos novos e a conta de cada um ──────────────────────────
alter table public.mtmauto_providers drop constraint if exists mtmauto_providers_tipo_check;
alter table public.mtmauto_providers add constraint mtmauto_providers_tipo_check
  check (tipo in ('mtm_t2t', 'metaapi', 'telegram', 'mtmfunded', 'tradelocker'));

alter table public.mtmauto_providers
  add column if not exists plataforma text check (plataforma is null or plataforma in ('mt4', 'mt5')),
  add column if not exists login text,
  add column if not exists servidor text,
  -- true = a conta MetaApi foi criada com a chave da EQUIPA (mtmauto_tenants.metaapi_token)
  add column if not exists metaapi_chave_equipa boolean not null default false,
  add column if not exists funded_account_id uuid references public.mtm_trading_accounts(id) on delete set null,
  add column if not exists tl_env text check (tl_env is null or tl_env in ('live', 'demo')),
  add column if not exists tl_server text,
  add column if not exists tl_account_id text,
  add column if not exists tl_acc_num text,
  add column if not exists criado_por uuid;

create index if not exists mtmauto_providers_tenant_idx on public.mtmauto_providers (tenant_id);
create index if not exists mtmauto_providers_funded_idx on public.mtmauto_providers (funded_account_id) where funded_account_id is not null;

-- quota de contas MetaApi de providers por equipa (null = 3). A casa (sem equipa) não tem limite aqui.
alter table public.mtmauto_tenants add column if not exists quota_providers_metaapi int
  check (quota_providers_metaapi is null or quota_providers_metaapi >= 0);

-- credenciais TradeLocker de um provider (a password continua cifrada, como nas contas)
alter table public.tradelocker_credenciais
  add column if not exists mtmauto_provider_id uuid references public.mtmauto_providers(id) on delete cascade;
alter table public.tradelocker_credenciais drop constraint if exists tradelocker_credenciais_um_dono;
alter table public.tradelocker_credenciais add constraint tradelocker_credenciais_um_dono check (
  ((mtmcopy_connection_id is not null)::int + (mtmauto_account_id is not null)::int + (mtmauto_provider_id is not null)::int) = 1
);
create unique index if not exists tradelocker_credenciais_provider_uidx
  on public.tradelocker_credenciais (mtmauto_provider_id) where mtmauto_provider_id is not null;

-- ── 2. rotas: origem `prov:` e rastro da migração ───────────────────────────
alter table public.copia_rotas drop constraint if exists copia_rotas_origem_ref_check;
alter table public.copia_rotas add constraint copia_rotas_origem_ref_check
  check (origem_ref ~ '^(site|auto|wt|funded|prov):[0-9a-f-]{36}$');

alter table public.copia_rotas add column if not exists migrada_de uuid;
create unique index if not exists copia_rotas_migrada_de_uidx on public.copia_rotas (migrada_de) where migrada_de is not null;

-- o trigger da fonte MTM Funded procura por chave física
create index if not exists copia_rotas_chave_viva_idx
  on public.copia_rotas (origem_chave) where ativa and estado = 'aprovada';

create or replace function public.copia_rotas_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_fanout int;
  v_ciclo boolean;
  v_live jsonb;
  -- contas de clientes: 5; estratégias (prov:) servem muitos seguidores
  v_max_fanout int := case when new.origem_ref like 'prov:%' then 2000 else 5 end;
begin
  new.updated_at := now();

  if new.estado <> 'recusada' then
    select count(*) into v_fanout from public.copia_rotas r
     where r.origem_chave = new.origem_chave and r.estado <> 'recusada' and r.id <> new.id;
    if v_fanout >= v_max_fanout then
      raise exception 'copia_rotas: a conta de origem já tem % destinos (máximo %)', v_fanout, v_max_fanout;
    end if;

    with recursive caminho(chave, fundo) as (
      select new.destino_chave, 0
      union
      select r.destino_chave, c.fundo + 1
        from public.copia_rotas r join caminho c on r.origem_chave = c.chave
       where r.estado <> 'recusada' and r.id <> new.id and c.fundo < 32
    )
    select exists (select 1 from caminho where chave = new.origem_chave) into v_ciclo;
    if v_ciclo then
      raise exception 'copia_rotas: esta rota fecha um ciclo (a origem voltaria a copiar-se a si própria)';
    end if;
  end if;

  if new.modo = 'live' and (tg_op = 'INSERT' or old.modo is distinct from 'live') then
    select value into v_live from public.site_settings where key = 'copia_contas_live_desbloqueado';
    if v_live is distinct from 'true'::jsonb then
      raise exception 'copia_rotas: modo live bloqueado nesta instalação (copia_contas_live_desbloqueado=false)';
    end if;
  end if;
  return new;
end $$;

create or replace function public.copia_funded_emitir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_chave text := 'mtmfunded:' || lower(new.account_id::text);
  v_mae public.funded_positions%rowtype;
  v_pos text;
  v_tipo text;
  v_payload jsonb;
  v_disc text;
begin
  if tg_op = 'INSERT' and new.estado = 'aberta' and new.mae_id is null then
    v_tipo := 'open'; v_pos := new.id::text; v_disc := '0';
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume', new.volume,
      'preco', new.preco_entrada, 'sl', new.sl, 'tp', new.tp, 'origem', new.origem);
  elsif tg_op = 'INSERT' and new.estado = 'fechada' and new.mae_id is not null then
    select * into v_mae from public.funded_positions where id = new.mae_id;
    if not found then return null; end if;
    v_tipo := 'partial'; v_pos := new.mae_id::text; v_disc := new.id::text;
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume_fechado', new.volume,
      'volume', case when v_mae.estado = 'aberta' then v_mae.volume else 0 end, 'preco', new.preco_fecho);
  elsif tg_op = 'UPDATE' and old.estado = 'aberta' and new.estado = 'fechada' then
    v_tipo := 'close'; v_pos := new.id::text; v_disc := '0';
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'preco', new.preco_fecho, 'motivo', new.motivo_fecho);
  elsif tg_op = 'UPDATE' and old.estado = 'aberta' and new.estado = 'aberta'
        and (old.sl is distinct from new.sl or old.tp is distinct from new.tp) then
    v_tipo := 'modify'; v_pos := new.id::text; v_disc := txid_current()::text;
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume', new.volume,
      'preco', new.preco_entrada, 'sl', new.sl, 'tp', new.tp);
  else
    return null;
  end if;

  -- funded:<id> e prov:<id> (provider MTM Funded) partilham a chave física
  for r in select id from public.copia_rotas
            where origem_tipo = 'mtmfunded' and origem_chave = v_chave and ativa and estado = 'aprovada'
  loop
    insert into public.copia_eventos (rota_id, origem_posicao_id, tipo, payload, chave, origem_em)
    values (r.id, v_pos, v_tipo, v_payload, r.id || ':' || v_pos || ':' || v_tipo || ':' || v_disc, now())
    on conflict (chave) do nothing;
  end loop;
  return null;
end $$;

revoke all on function public.copia_rotas_guarda() from public, anon, authenticated;
revoke all on function public.copia_funded_emitir() from public, anon, authenticated;

-- ── 3. vista de compatibilidade sem duplicados ──────────────────────────────
create or replace view public.copia_rotas_todas as
select r.id, 'copia_contas'::text as sistema, r.user_id, r.origem_tipo, r.origem_ref, r.origem_chave,
       r.destino_tipo, r.destino_ref, r.destino_chave, r.modo_lote, r.valor, r.lote_max, r.max_abertas,
       r.copiar_sl, r.copiar_tp, r.filtro_simbolos, r.ativa, r.modo, r.estado, r.created_at, r.updated_at
  from public.copia_rotas r
union all
select c.id, 'funded_copier'::text, c.user_id, 'mtmfunded', 'funded:' || c.account_id, 'mtmfunded:' || c.account_id,
       case c.destino_tipo when 'tradelocker' then 'tradelocker' else 'mt5' end,
       case c.destino_tipo when 'mtmauto' then 'auto:' else 'site:' end || c.destino_id,
       c.destino_tipo || ':' || c.destino_id,
       case c.modo_lote when 'proporcional_saldo' then 'proporcional_saldo' when 'multiplicador' then 'multiplicador'
                        when 'fixo' then 'fixo' else 'risco_pct' end,
       coalesce(c.valor, 1), c.lote_max, c.max_posicoes, c.copiar_sl, c.copiar_tp, c.simbolos, c.ativo,
       'live', 'aprovada', c.created_at, c.updated_at
  from public.funded_copiers c
 where not exists (select 1 from public.copia_rotas m where m.migrada_de = c.id);

revoke all on public.copia_rotas_todas from anon, authenticated;

commit;
