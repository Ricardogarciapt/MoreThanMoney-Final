-- 064 — MTM Funded (M2): o catálogo inteiro da PU Prime, o pedido de preços do WebTrader e as
-- escritas atómicas do motor.
--
-- Três coisas, todas pedidas pelo motor de simulação:
--
-- 1. CLASSES. O dono quer «o mesmo número de símbolos negociáveis que a PU Prime» — e a PU Prime
--    não negoceia só forex, metais, índices e cripto: tem acções (EUA, Europa, Reino Unido, 24h),
--    ETFs, petróleo, matérias-primas e obrigações. A CHECK de 061 recusava metade do catálogo.
--
-- 2. MOEDA DO LUCRO. Uma acção europeia cota em EUR, uma britânica em GBX (pence!), um índice de
--    Hong Kong em HKD. Adivinhar a moeda pelo nome (como matematica.ts fazia para os índices)
--    deixa de chegar: vem da especificação da corretora (`profitCurrency`) e fica numa coluna.
--
-- 3. SESSÕES. O calendário de lib/mtmcopy/market-hours é o da semana cambial; uma acção dos EUA
--    só negoceia das 13:30 às 20:00 UTC. Guardam-se as `tradeSessions` da corretora (em HORA DO
--    SERVIDOR DA CORRETORA) e o motor não executa nada fora delas.

-- ── 1. classes ─────────────────────────────────────────────────────────────
alter table public.funded_symbols drop constraint if exists funded_symbols_classe_check;
alter table public.funded_symbols
  add constraint funded_symbols_classe_check
  check (classe in ('forex', 'metal', 'indice', 'cripto', 'acao', 'etf', 'energia', 'commodity', 'obrigacao'));

-- ── 2 e 3. moeda do lucro e sessões ────────────────────────────────────────
alter table public.funded_symbols
  add column if not exists moeda_lucro text,
  add column if not exists sessoes jsonb;

-- Os 17 símbolos semeados em 061 ficam com a moeda que a matemática já lhes dava.
update public.funded_symbols set moeda_lucro = case
    when symbol = 'GER40' then 'EUR'
    when classe = 'forex' then substr(symbol, 4, 3)
    else 'USD' end
where moeda_lucro is null;

-- ── 4. o WebTrader pede preços do símbolo que está a ver ───────────────────
-- O motor não subscreve os ~1000 símbolos o tempo todo (seria a conta de preços a arder por
-- nada): subscreve os que têm posições/ordens, uma lista base, e os PEDIDOS nos últimos 60s.
-- O browser do aluno escreve aqui «estou a olhar para AAPL»; o motor lê e passa a mandar o preço.
create table if not exists public.funded_precos_pedidos (
  symbol text primary key references public.funded_symbols(symbol) on delete cascade,
  pedido_em timestamptz not null default now()
);

alter table public.funded_precos_pedidos enable row level security;

drop policy if exists funded_precos_pedidos_ler on public.funded_precos_pedidos;
create policy funded_precos_pedidos_ler on public.funded_precos_pedidos
  for select to authenticated using (true);
drop policy if exists funded_precos_pedidos_inserir on public.funded_precos_pedidos;
create policy funded_precos_pedidos_inserir on public.funded_precos_pedidos
  for insert to authenticated with check (true);
drop policy if exists funded_precos_pedidos_atualizar on public.funded_precos_pedidos;
create policy funded_precos_pedidos_atualizar on public.funded_precos_pedidos
  for update to authenticated using (true) with check (true);

-- Só as duas colunas, e nunca apagar: um pedido é um carimbo de hora, não um dado de ninguém.
revoke all on public.funded_precos_pedidos from anon, authenticated;
grant select on public.funded_precos_pedidos to authenticated;
grant insert (symbol, pedido_em), update (symbol, pedido_em) on public.funded_precos_pedidos to authenticated;

-- ── 5. escritas atómicas do motor ──────────────────────────────────────────
-- Fechar uma posição são DUAS escritas (a posição e o saldo). Feitas em separado, um fecho
-- manual no site ao mesmo tempo que o SL no motor creditava o lucro duas vezes, e um motor que
-- morresse entre as duas deixava a posição fechada sem o dinheiro na conta. Numa função são uma
-- transacção: ou tudo, ou nada — e o `where estado = 'aberta'` faz com que só um ganhe.

-- O dia da corretora vira às 22:00 UTC (convenção fixa do site e do motor).
create or replace function public.funded_dia_corretora(p_em timestamptz default now())
returns date language sql immutable as $$
  select ((p_em at time zone 'utc') + interval '2 hours')::date
$$;

create or replace function public.funded_fechar_posicao(
  p_id uuid, p_preco numeric, p_pnl numeric, p_motivo text, p_tick jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_conta uuid;
begin
  update public.funded_positions
     set estado = 'fechada', preco_fecho = p_preco, pnl = p_pnl, motivo_fecho = p_motivo,
         tick_fecho = p_tick, fechada_em = now()
   where id = p_id and estado = 'aberta'
  returning account_id into v_conta;
  if v_conta is null then return false; end if;  -- alguém fechou primeiro
  update public.mtm_trading_accounts
     set sim_saldo = coalesce(sim_saldo, 0) + p_pnl, updated_at = now()
   where id = v_conta;
  return true;
end $$;

-- Executa uma pendente: cria a posição ao preço da ordem, debita a comissão (a convenção: quem
-- abre, cobra) e conta o dia de negociação — tudo ou nada, e só se a ordem ainda estiver pendente.
create or replace function public.funded_executar_pendente(
  p_ordem uuid, p_comissao numeric, p_tick jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.funded_orders%rowtype; v_pos uuid; v_dia date := public.funded_dia_corretora(now());
begin
  select * into o from public.funded_orders where id = p_ordem and estado = 'pendente' for update;
  if not found then return null; end if;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, origem, ideia_ref, tick_entrada)
  values (o.account_id, o.symbol, o.direcao, o.volume, o.preco, o.sl, o.tp, p_comissao, o.origem, o.ideia_ref, p_tick)
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

-- O site (ordens a mercado, fecho manual) deve usar as mesmas: um só caminho para o dinheiro.
create or replace function public.funded_somar_saldo(p_conta uuid, p_delta numeric)
returns numeric language sql security definer set search_path = public as $$
  update public.mtm_trading_accounts set sim_saldo = coalesce(sim_saldo, 0) + p_delta, updated_at = now()
   where id = p_conta returning sim_saldo
$$;

revoke all on function public.funded_fechar_posicao(uuid, numeric, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.funded_executar_pendente(uuid, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.funded_somar_saldo(uuid, numeric) from public, anon, authenticated;
grant execute on function public.funded_fechar_posicao(uuid, numeric, numeric, text, jsonb) to service_role;
grant execute on function public.funded_executar_pendente(uuid, numeric, jsonb) to service_role;
grant execute on function public.funded_somar_saldo(uuid, numeric) to service_role;
