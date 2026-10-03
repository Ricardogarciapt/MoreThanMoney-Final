-- 070 — MTM Funded: contas simuladas que SEGUEM uma estratégia MTM Auto (e aceitam Tap to Trade).
--
-- O pedido (2026-09-14): dar a um aluno uma conta simulada por estratégia do MTM Auto (Premium,
-- GoldKiller, Sensei, Aurum Flow, MTM Scanner) que negoceia SOZINHA, exactamente como a estratégia
-- negoceia, para ele poder analisar o desempenho de cada uma sem dinheiro real.
--
-- De onde vem a verdade: das posições REAIS da conta-mestre de cada estratégia (a conta provider
-- na MetaApi, mtmauto_providers.metaapi_account_id). Essas posições já trazem a gestão toda da
-- estratégia — parciais, break-even, trailing, fechos. O motor do VPS
-- (services/funded-motor/espelho-estrategias.ts) lê-as e ESPELHA-as nas contas seguidoras, em
-- proporção ao saldo, pelas mesmas funções atómicas que o site usa.
--
--   conta-mestre (MetaApi) ──poll 3s──▶ motor ──▶ funded_positions (seguidora)
--                                         │
--                                         └──▶ funded_espelho_posicoes (a ponte, anti-duplicação)
--
-- Nada aqui toca em dinheiro real: as contas são `motor = 'sim'`.

-- ── 1. a conta diz que estratégia segue e se aceita Tap to Trade ───────────
alter table public.mtm_trading_accounts
  add column if not exists segue_estrategia text,
  add column if not exists aceita_t2t boolean not null default false;

comment on column public.mtm_trading_accounts.segue_estrategia is
  'slug de mtmauto_providers: o motor espelha as posições da conta-mestre desta estratégia (só contas motor=sim)';
comment on column public.mtm_trading_accounts.aceita_t2t is
  'ao aceitar uma ideia no Tap to Trade, abre também nesta conta simulada (só contas motor=sim)';

create index if not exists mtm_trading_accounts_segue_idx on public.mtm_trading_accounts (segue_estrategia)
  where segue_estrategia is not null and motor = 'sim';

-- ── 2. posições e ordens: comentário à MT5 e origem «estrategia» ──────────
alter table public.funded_positions add column if not exists comentario text;
alter table public.funded_orders add column if not exists comentario text;

alter table public.funded_positions drop constraint if exists funded_positions_origem_check;
alter table public.funded_positions add constraint funded_positions_origem_check
  check (origem in ('manual', 'ideia_mtm', 'scanner', 'copia', 'estrategia'));
alter table public.funded_orders drop constraint if exists funded_orders_origem_check;
alter table public.funded_orders add constraint funded_orders_origem_check
  check (origem in ('manual', 'ideia_mtm', 'scanner', 'copia', 'estrategia'));

-- «estrategia» = a conta-mestre fechou (o motor não sabe se foi SL, TP ou saída da própria estratégia).
alter table public.funded_positions drop constraint if exists funded_positions_motivo_fecho_check;
alter table public.funded_positions add constraint funded_positions_motivo_fecho_check
  check (motivo_fecho in ('manual', 'sl', 'tp', 'stop_out', 'regra_quebrada', 'fim_de_ciclo', 'estrategia'));

-- Uma ideia do Tap to Trade abre UMA vez por conta simulada (dois toques, dois pedidos paralelos).
-- A filha de um parcial herda ideia_ref mas tem mae_id — por isso fica de fora.
create unique index if not exists funded_positions_t2t_uma_vez on public.funded_positions (account_id, ideia_ref)
  where ideia_ref like 't2t:%' and mae_id is null;
create unique index if not exists funded_orders_t2t_uma_vez on public.funded_orders (account_id, ideia_ref)
  where ideia_ref like 't2t:%';

-- ── 3. a ponte posição-mestre → posição simulada ──────────────────────────
create table if not exists public.funded_espelho_posicoes (
  id uuid primary key default gen_random_uuid(),
  follower_account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  -- id MetaApi da conta-mestre e da posição nela
  master_account_id text not null,
  master_position_id text not null,
  estrategia text not null,
  funded_position_id uuid unique references public.funded_positions(id) on delete set null,
  symbol text,
  master_symbol text,
  direcao text check (direcao in ('buy', 'sell')),
  -- volume da mestre À ABERTURA e o que ela tem agora (o parcial mede-se contra o da abertura)
  volume_master_abertura numeric not null,
  volume_master_atual numeric,
  volume_seguidora_abertura numeric,
  -- fracção já fechada (0..1) na seguidora
  fechado_pct numeric not null default 0,
  -- lote aplicado ÷ lote proporcional ideal (1 = exacto; >1 = subiu ao mínimo do símbolo)
  escala numeric,
  preco_master_abertura numeric,
  master_aberta_em timestamptz,
  -- aberta → fechada | recusada (não abriu: sem preço, símbolo, margem) | fechada_local (alguém a fechou à mão)
  estado text not null default 'aberta' check (estado in ('aberta', 'fechada', 'recusada', 'fechada_local')),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (follower_account_id, master_account_id, master_position_id)
);
create index if not exists funded_espelho_abertas_idx on public.funded_espelho_posicoes (master_account_id)
  where estado = 'aberta';

alter table public.funded_espelho_posicoes enable row level security;
drop policy if exists funded_espelho_ler on public.funded_espelho_posicoes;
create policy funded_espelho_ler on public.funded_espelho_posicoes for select to authenticated
  using (exists (select 1 from public.mtm_trading_accounts a where a.id = follower_account_id and a.user_id = auth.uid()));
revoke all on public.funded_espelho_posicoes from anon;
revoke insert, update, delete on public.funded_espelho_posicoes from authenticated;

-- ── 4. as funções atómicas passam a levar o comentário ────────────────────
-- Mesmas definições de 064/068, só com `comentario` copiado — sem isto uma pendente do T2T
-- executada, ou a filha de um parcial, perdia a identificação da estratégia.
create or replace function public.funded_executar_pendente(
  p_ordem uuid, p_comissao numeric, p_tick jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.funded_orders%rowtype; v_pos uuid; v_dia date := public.funded_dia_corretora(now());
begin
  select * into o from public.funded_orders where id = p_ordem and estado = 'pendente' for update;
  if not found then return null; end if;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, origem, ideia_ref, comentario, tick_entrada)
  values (o.account_id, o.symbol, o.direcao, o.volume, o.preco, o.sl, o.tp, p_comissao, o.origem, o.ideia_ref, o.comentario, p_tick)
  returning id into v_pos;
  update public.funded_orders set estado = 'executada', position_id = v_pos, executada_em = now() where id = o.id;
  update public.mtm_trading_accounts
     set sim_saldo = coalesce(sim_saldo, 0) - p_comissao,
         sim_dias_negociados = sim_dias_negociados + case when sim_ultimo_dia is distinct from v_dia then 1 else 0 end,
         sim_ultimo_dia = v_dia,
         updated_at = now()
   where id = o.account_id;
  return v_pos;
end $$;

create or replace function public.funded_fechar_parcial(
  p_mae uuid, p_volume numeric, p_preco numeric, p_pnl numeric, p_tick jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare m public.funded_positions%rowtype; v_filha uuid; v_com numeric; v_swap numeric;
begin
  select * into m from public.funded_positions where id = p_mae and estado = 'aberta' for update;
  if not found or p_volume <= 0 or p_volume >= m.volume then return null; end if;
  v_com := round(m.comissao * (p_volume / m.volume), 2);
  v_swap := round(coalesce(m.swap, 0) * (p_volume / m.volume), 2);
  update public.funded_positions
     set volume = round(m.volume - p_volume, 2), comissao = round(m.comissao - v_com, 2),
         swap = round(coalesce(m.swap, 0) - v_swap, 2)
   where id = m.id;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, swap, estado, preco_fecho, pnl,
     motivo_fecho, origem, ideia_ref, comentario, tick_entrada, tick_fecho, mae_id, aberta_em, fechada_em)
  values
    (m.account_id, m.symbol, m.direcao, p_volume, m.preco_entrada, m.sl, m.tp, v_com, v_swap, 'fechada', p_preco, p_pnl,
     'manual', m.origem, m.ideia_ref, m.comentario, m.tick_entrada, p_tick, m.id, m.aberta_em, now())
  returning id into v_filha;
  update public.mtm_trading_accounts set sim_saldo = coalesce(sim_saldo, 0) + p_pnl, updated_at = now()
   where id = m.account_id;
  return v_filha;
end $$;

revoke all on function public.funded_executar_pendente(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.funded_executar_pendente(uuid, numeric, jsonb) to service_role;
revoke all on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb) to service_role;

-- ── 5. MTM Auto: a conta simulada aparece como conta do cliente ───────────
-- O dono quer estas contas VISÍVEIS no MTM Auto como qualquer conta (listas, métricas,
-- subscrições, T2T). Liga-se por `funded_account_id`; `plataforma = 'mtmfunded'` diz a todos os
-- executores (MetaApi/CopyFactory/TradeLocker) que NÃO é com eles — a execução é do motor.
alter table public.mtmauto_accounts
  add column if not exists funded_account_id uuid references public.mtm_trading_accounts(id) on delete cascade;
create unique index if not exists mtmauto_accounts_funded_uniq on public.mtmauto_accounts (funded_account_id)
  where funded_account_id is not null;

-- plataforma não tinha check em mtmauto_accounts; fica um, com os valores de hoje + mtmfunded.
alter table public.mtmauto_accounts drop constraint if exists mtmauto_accounts_plataforma_check;
alter table public.mtmauto_accounts add constraint mtmauto_accounts_plataforma_check
  check (plataforma in ('mt4', 'mt5', 'tradelocker', 'mtmfunded')) not valid;

alter table public.mtmcopy_connections drop constraint if exists mtmcopy_connections_mt5_platform_check;
alter table public.mtmcopy_connections add constraint mtmcopy_connections_mt5_platform_check
  check (mt5_platform in ('mt4', 'mt5', 'tradelocker', 'mtmfunded'));
