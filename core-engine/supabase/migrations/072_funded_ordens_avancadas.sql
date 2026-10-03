-- 072 — MTM Funded WebTrader v2: ordens avançadas, diário e alertas de preço.
--
-- O QUE MUDA, E PORQUÊ
--
-- 1. Gestão automática das posições (o que a TradeLocker chama «Break-even», «Trailing stop» e
--    «Take profits parciais»). Vive na PRÓPRIA linha da posição — e não numa tabela à parte — porque
--    o motor do VPS já lê as posições abertas a cada segundo: uma coluna a mais custa zero leituras.
--    Tudo em PREÇO (distâncias), que é a unidade do motor; o WebTrader converte pips/$ antes de gravar.
--      · trailing_distancia  distância do SL ao preço de fecho; o SL só sobe (compra) / desce (venda);
--      · trailing_ativacao   lucro mínimo (em preço) antes de o trailing começar; null = já;
--      · be_gatilho          lucro (em preço) que arma o break-even; null = não por distância;
--      · be_no_tp1           arma o break-even quando o TP1 parcial é atingido;
--      · be_offset           quanto o SL fica além da entrada, a favor (cobre a comissão);
--      · be_feito            o break-even já foi aplicado (não se repete);
--      · tps                 [{preco, pct, atingido}] — TP1/TP2/TP3 com % do volume INICIAL;
--      · volume_inicial      o volume à abertura (as % dos TPs medem-se contra ele);
--      · risco_inicial       |USD até ao SL| à abertura — para medir as trades em R nas estatísticas.
--    As pendentes levam as mesmas colunas e passam-nas à posição quando disparam.
--
-- 2. OCO («one cancels the other»): duas pendentes com o mesmo `oco_grupo`. Quando uma dispara, a
--    outra cancela-se NA MESMA TRANSACÇÃO (funded_executar_pendente) — nunca ficam as duas vivas.
--
-- 3. Bracket: entrada + SL + TP (+ TPs parciais) numa só ordem — não precisa de coluna nova, é uma
--    ordem com sl/tp/tps. Fica `bracket` jsonb só como registo do que o trader pediu no ticket.
--
-- 4. funded_fechar_parcial ganha `p_motivo` e `p_tps`: o motor regista «tp_parcial» e marca o TP
--    atingido na mesma transacção. `p_tps` igual ao que já está gravado = chamada repetida → não faz
--    nada (idempotente: um tick repetido não fecha a mesma parte duas vezes).
--
-- 5. funded_diario (notas por trade) e funded_alertas (alertas de preço), RLS do dono.
--
-- COMPATIBILIDADE: o trigger do copiador (068) já replica modify/partial/close; as colunas novas não
-- entram no payload e os parciais/SL movidos pelo motor saem como eventos normais.
-- ORDEM DE DEPLOY: esta migração ANTES do motor novo (o motor lê as colunas novas).

-- ── 1. colunas de gestão ──────────────────────────────────────────────────
alter table public.funded_positions
  add column if not exists trailing_distancia numeric check (trailing_distancia is null or trailing_distancia > 0),
  add column if not exists trailing_ativacao numeric check (trailing_ativacao is null or trailing_ativacao >= 0),
  add column if not exists be_gatilho numeric check (be_gatilho is null or be_gatilho > 0),
  add column if not exists be_offset numeric not null default 0,
  add column if not exists be_no_tp1 boolean not null default false,
  add column if not exists be_feito boolean not null default false,
  add column if not exists tps jsonb,
  add column if not exists volume_inicial numeric,
  add column if not exists risco_inicial numeric;

alter table public.funded_orders
  add column if not exists trailing_distancia numeric check (trailing_distancia is null or trailing_distancia > 0),
  add column if not exists trailing_ativacao numeric check (trailing_ativacao is null or trailing_ativacao >= 0),
  add column if not exists be_gatilho numeric check (be_gatilho is null or be_gatilho > 0),
  add column if not exists be_offset numeric not null default 0,
  add column if not exists be_no_tp1 boolean not null default false,
  add column if not exists tps jsonb,
  add column if not exists risco_inicial numeric,
  add column if not exists oco_grupo uuid,
  add column if not exists bracket jsonb;

create index if not exists funded_orders_oco_idx on public.funded_orders (oco_grupo) where oco_grupo is not null and estado = 'pendente';

-- motivos novos: parcial automático e fecho de lote
alter table public.funded_positions drop constraint if exists funded_positions_motivo_fecho_check;
alter table public.funded_positions add constraint funded_positions_motivo_fecho_check
  check (motivo_fecho in ('manual', 'sl', 'tp', 'tp_parcial', 'stop_out', 'regra_quebrada', 'fim_de_ciclo', 'estrategia'));

-- ── 2. executar pendente: copia a gestão e cancela o irmão OCO ────────────
create or replace function public.funded_executar_pendente(
  p_ordem uuid, p_comissao numeric, p_tick jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.funded_orders%rowtype; v_pos uuid; v_dia date := public.funded_dia_corretora(now());
begin
  select * into o from public.funded_orders where id = p_ordem and estado = 'pendente' for update;
  if not found then return null; end if;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, origem, ideia_ref, comentario, tick_entrada,
     trailing_distancia, trailing_ativacao, be_gatilho, be_offset, be_no_tp1, tps, volume_inicial, risco_inicial)
  values (o.account_id, o.symbol, o.direcao, o.volume, o.preco, o.sl, o.tp, p_comissao, o.origem, o.ideia_ref, o.comentario, p_tick,
     o.trailing_distancia, o.trailing_ativacao, o.be_gatilho, o.be_offset, o.be_no_tp1, o.tps, o.volume, o.risco_inicial)
  returning id into v_pos;
  update public.funded_orders set estado = 'executada', position_id = v_pos, executada_em = now() where id = o.id;
  -- OCO: a outra perna morre na mesma transacção.
  if o.oco_grupo is not null then
    update public.funded_orders set estado = 'cancelada'
     where oco_grupo = o.oco_grupo and id <> o.id and estado = 'pendente';
  end if;
  update public.mtm_trading_accounts
     set sim_saldo = coalesce(sim_saldo, 0) - p_comissao,
         sim_dias_negociados = sim_dias_negociados + case when sim_ultimo_dia is distinct from v_dia then 1 else 0 end,
         sim_ultimo_dia = v_dia,
         updated_at = now()
   where id = o.account_id;
  return v_pos;
end $$;

revoke all on function public.funded_executar_pendente(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.funded_executar_pendente(uuid, numeric, jsonb) to service_role;

-- ── 3. fecho parcial com motivo e TPs marcados ────────────────────────────
-- A assinatura antiga (5 argumentos) sai: com as duas, uma chamada com 5 argumentos nomeados era
-- ambígua para o PostgREST. Os chamadores de hoje (site e espelho) passam 5 e caem nos defaults.
drop function if exists public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb);
create or replace function public.funded_fechar_parcial(
  p_mae uuid, p_volume numeric, p_preco numeric, p_pnl numeric, p_tick jsonb,
  p_motivo text default 'manual', p_tps jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare m public.funded_positions%rowtype; v_filha uuid; v_com numeric; v_swap numeric;
begin
  select * into m from public.funded_positions where id = p_mae and estado = 'aberta' for update;
  if not found or p_volume <= 0 or p_volume >= m.volume then return null; end if;
  -- Repetição do mesmo parcial automático (o TP já está marcado como atingido): não faz nada.
  if p_tps is not null and m.tps is not distinct from p_tps then return null; end if;
  v_com := round(m.comissao * (p_volume / m.volume), 2);
  v_swap := round(coalesce(m.swap, 0) * (p_volume / m.volume), 2);
  update public.funded_positions
     set volume = round(m.volume - p_volume, 2), comissao = round(m.comissao - v_com, 2),
         swap = round(coalesce(m.swap, 0) - v_swap, 2),
         tps = coalesce(p_tps, m.tps),
         volume_inicial = coalesce(m.volume_inicial, m.volume)
   where id = m.id;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, swap, estado, preco_fecho, pnl,
     motivo_fecho, origem, ideia_ref, comentario, tick_entrada, tick_fecho, mae_id, aberta_em, fechada_em)
  values
    (m.account_id, m.symbol, m.direcao, p_volume, m.preco_entrada, m.sl, m.tp, v_com, v_swap, 'fechada', p_preco, p_pnl,
     coalesce(p_motivo, 'manual'), m.origem, m.ideia_ref, m.comentario, m.tick_entrada, p_tick, m.id, m.aberta_em, now())
  returning id into v_filha;
  update public.mtm_trading_accounts set sim_saldo = coalesce(sim_saldo, 0) + p_pnl, updated_at = now()
   where id = m.account_id;
  return v_filha;
end $$;

revoke all on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb, text, jsonb) to service_role;

-- ── 4. diário de trading ──────────────────────────────────────────────────
create table if not exists public.funded_diario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  -- a trade (posição-raiz); null = nota do dia, sem trade
  position_id uuid references public.funded_positions(id) on delete set null,
  nota text check (char_length(nota) <= 4000),
  tags text[] not null default '{}',
  emocao text check (char_length(emocao) <= 40),
  setup text check (char_length(setup) <= 80),
  screenshot_url text check (screenshot_url is null or screenshot_url ~* '^https?://'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists funded_diario_trade_uniq on public.funded_diario (account_id, position_id) where position_id is not null;
create index if not exists funded_diario_conta_idx on public.funded_diario (account_id, criado_em desc);

alter table public.funded_diario enable row level security;
drop policy if exists funded_diario_dono on public.funded_diario;
create policy funded_diario_dono on public.funded_diario for all to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()));
revoke all on public.funded_diario from anon;

-- ── 5. alertas de preço ───────────────────────────────────────────────────
-- `condicao` decide-se à criação pelo lado do preço: um alerta acima do preço de agora dispara
-- quando o bid SOBE até lá. Assim nunca dispara no instante em que se cria.
create table if not exists public.funded_alertas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.mtm_trading_accounts(id) on delete cascade,
  symbol text not null references public.funded_symbols(symbol) on delete cascade,
  condicao text not null check (condicao in ('acima', 'abaixo')),
  preco numeric not null check (preco > 0),
  nota text check (char_length(nota) <= 200),
  ativo boolean not null default true,
  disparado_em timestamptz,
  preco_disparo numeric,
  criado_em timestamptz not null default now()
);
create index if not exists funded_alertas_ativos_idx on public.funded_alertas (symbol) where ativo;
create index if not exists funded_alertas_user_idx on public.funded_alertas (user_id, criado_em desc);

alter table public.funded_alertas enable row level security;
drop policy if exists funded_alertas_dono on public.funded_alertas;
create policy funded_alertas_dono on public.funded_alertas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.funded_alertas from anon;
