-- 061 — MTM Funded: contas SIMULADAS emitidas no nosso servidor (M1).
--
-- Migração HÍBRIDA, decidida no mapa (2026-09-14): as contas continuam a viver em
-- mtm_trading_accounts — a mesma tabela que o torneio, o painel, os levantamentos e os
-- certificados já lêem — e ganham um `motor`. As que nascem na corretora externa (fila MT5)
-- ficam `mt5`; as emitidas por nós ficam `sim`. Nada do que já existe muda de sítio.
--
-- As tabelas próprias do simulador (posições, ordens, símbolos, preços) têm prefixo funded_
-- e só existem para contas `sim`.

-- ── 0. as 7 tabelas mtm_* nunca tiveram migração no repo; só se acrescenta o que falta ──
alter table public.mtm_trading_accounts
  add column if not exists motor text not null default 'mt5',
  add column if not exists sim_saldo numeric,
  add column if not exists sim_equity numeric,
  add column if not exists sim_margem numeric not null default 0,
  add column if not exists sim_ancora_dia numeric,
  add column if not exists sim_ancora_em timestamptz,
  add column if not exists sim_pico_equity numeric,
  add column if not exists sim_dias_negociados int not null default 0,
  add column if not exists sim_ultimo_dia date;

do $$ begin
  alter table public.mtm_trading_accounts
    add constraint mtm_trading_accounts_motor_check check (motor in ('mt5', 'sim'));
exception when duplicate_object then null; end $$;

-- ── 1. símbolos e custos simulados ─────────────────────────────────────────
-- «O mais aproximado à realidade de mercado»: contrato, dígitos, spread típico em pontos,
-- comissão por lote de ida e volta e horário — por símbolo, editável sem deploy.
create table if not exists public.funded_symbols (
  symbol text primary key,
  nome text not null,
  classe text not null check (classe in ('forex', 'metal', 'indice', 'cripto')),
  digits int not null,
  contract_size numeric not null,
  pip_size numeric not null,
  spread_pontos int not null,
  comissao_lote numeric not null default 0,
  swap_long_pontos numeric not null default 0,
  swap_short_pontos numeric not null default 0,
  volume_min numeric not null default 0.01,
  volume_step numeric not null default 0.01,
  volume_max numeric not null default 50,
  alavancagem_max int not null default 100,
  -- 'forex' | 'metal' | 'indice' | 'cripto_24_7' — o calendário vive em lib/mtmcopy/market-hours
  horario text not null default 'forex',
  simbolo_fonte text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  updated_at timestamptz not null default now()
);

-- ── 2. o último preço de cada símbolo, escrito pelo motor (M2) ─────────────
create table if not exists public.funded_precos (
  symbol text primary key references public.funded_symbols(symbol) on delete cascade,
  bid numeric not null,
  ask numeric not null,
  em timestamptz not null default now()
);

-- ── 3. posições ────────────────────────────────────────────────────────────
create table if not exists public.funded_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  symbol text not null references public.funded_symbols(symbol),
  direcao text not null check (direcao in ('buy', 'sell')),
  volume numeric not null check (volume > 0),
  preco_entrada numeric not null,
  sl numeric,
  tp numeric,
  comissao numeric not null default 0,
  swap numeric not null default 0,
  estado text not null default 'aberta' check (estado in ('aberta', 'fechada')),
  preco_fecho numeric,
  pnl numeric,
  motivo_fecho text check (motivo_fecho in ('manual', 'sl', 'tp', 'stop_out', 'regra_quebrada', 'fim_de_ciclo')),
  -- De onde veio a ordem. As ideias da casa NÃO contam para o torneio (decisão do mapa).
  origem text not null default 'manual' check (origem in ('manual', 'ideia_mtm', 'scanner', 'copia')),
  ideia_ref text,
  -- O preço do instante do fill fica gravado: é a resposta a uma contestação.
  tick_entrada jsonb,
  tick_fecho jsonb,
  -- Fecho parcial: a parte fechada nasce como posição fechada filha da original.
  mae_id uuid references public.funded_positions(id) on delete set null,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz
);
create index if not exists funded_positions_conta_estado_idx on public.funded_positions (account_id, estado);
create index if not exists funded_positions_abertas_symbol_idx on public.funded_positions (symbol) where estado = 'aberta';

-- ── 4. ordens pendentes ────────────────────────────────────────────────────
create table if not exists public.funded_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  symbol text not null references public.funded_symbols(symbol),
  direcao text not null check (direcao in ('buy', 'sell')),
  tipo text not null check (tipo in ('limit', 'stop')),
  volume numeric not null check (volume > 0),
  preco numeric not null,
  sl numeric,
  tp numeric,
  estado text not null default 'pendente' check (estado in ('pendente', 'executada', 'cancelada', 'expirada')),
  origem text not null default 'manual' check (origem in ('manual', 'ideia_mtm', 'scanner', 'copia')),
  ideia_ref text,
  position_id uuid references public.funded_positions(id) on delete set null,
  expira_em timestamptz,
  criada_em timestamptz not null default now(),
  executada_em timestamptz
);
create index if not exists funded_orders_pendentes_idx on public.funded_orders (symbol) where estado = 'pendente';

-- ── 5. fotografias de equity (gráfico de progresso + auditoria) ────────────
create table if not exists public.funded_equity_snapshots (
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  em timestamptz not null default now(),
  saldo numeric not null,
  equity numeric not null,
  primary key (account_id, em)
);

-- ── RLS: cada um lê o que é seu; escrever só pelo servidor ─────────────────
alter table public.funded_symbols enable row level security;
alter table public.funded_precos enable row level security;
alter table public.funded_positions enable row level security;
alter table public.funded_orders enable row level security;
alter table public.funded_equity_snapshots enable row level security;

drop policy if exists funded_symbols_ler on public.funded_symbols;
create policy funded_symbols_ler on public.funded_symbols for select to authenticated using (ativo);

drop policy if exists funded_precos_ler on public.funded_precos;
create policy funded_precos_ler on public.funded_precos for select to authenticated using (true);

drop policy if exists funded_positions_ler on public.funded_positions;
create policy funded_positions_ler on public.funded_positions for select to authenticated
  using (exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists funded_orders_ler on public.funded_orders;
create policy funded_orders_ler on public.funded_orders for select to authenticated
  using (exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists funded_snapshots_ler on public.funded_equity_snapshots;
create policy funded_snapshots_ler on public.funded_equity_snapshots for select to authenticated
  using (exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()));

revoke insert, update, delete on public.funded_symbols, public.funded_precos, public.funded_positions,
  public.funded_orders, public.funded_equity_snapshots from anon, authenticated;
revoke all on public.funded_symbols, public.funded_precos, public.funded_positions,
  public.funded_orders, public.funded_equity_snapshots from anon;

-- ── seed dos símbolos ──────────────────────────────────────────────────────
-- Spreads típicos de conta ECN em horas de mercado (pontos = 10^-digits), comissão de ida e
-- volta por lote em USD. Cripto 24/7 com spread largo, como na realidade.
insert into public.funded_symbols
  (symbol, nome, classe, digits, contract_size, pip_size, spread_pontos, comissao_lote, volume_max, alavancagem_max, horario, simbolo_fonte, ordem)
values
  ('XAUUSD', 'Ouro',              'metal',  2, 100,     0.1,    18, 7, 20, 100, 'metal',       'XAUUSD', 1),
  ('XAGUSD', 'Prata',             'metal',  3, 5000,    0.01,   25, 7, 20, 50,  'metal',       'XAGUSD', 2),
  ('EURUSD', 'Euro / Dólar',      'forex',  5, 100000,  0.0001, 2,  7, 50, 100, 'forex',       'EURUSD', 10),
  ('GBPUSD', 'Libra / Dólar',     'forex',  5, 100000,  0.0001, 4,  7, 50, 100, 'forex',       'GBPUSD', 11),
  ('USDJPY', 'Dólar / Iene',      'forex',  3, 100000,  0.01,   3,  7, 50, 100, 'forex',       'USDJPY', 12),
  ('USDCHF', 'Dólar / Franco',    'forex',  5, 100000,  0.0001, 5,  7, 50, 100, 'forex',       'USDCHF', 13),
  ('AUDUSD', 'Dólar Australiano', 'forex',  5, 100000,  0.0001, 4,  7, 50, 100, 'forex',       'AUDUSD', 14),
  ('USDCAD', 'Dólar / Canadiano', 'forex',  5, 100000,  0.0001, 5,  7, 50, 100, 'forex',       'USDCAD', 15),
  ('NZDUSD', 'Dólar Neozelandês', 'forex',  5, 100000,  0.0001, 6,  7, 50, 100, 'forex',       'NZDUSD', 16),
  ('EURJPY', 'Euro / Iene',       'forex',  3, 100000,  0.01,   8,  7, 50, 100, 'forex',       'EURJPY', 17),
  ('GBPJPY', 'Libra / Iene',      'forex',  3, 100000,  0.01,   14, 7, 50, 100, 'forex',       'GBPJPY', 18),
  ('US30',   'Dow Jones',         'indice', 1, 1,       1,      20, 0, 50, 20,  'indice',      'US30',   30),
  ('NAS100', 'Nasdaq 100',        'indice', 1, 1,       1,      15, 0, 50, 20,  'indice',      'NAS100', 31),
  ('US500',  'S&P 500',           'indice', 1, 1,       1,      5,  0, 50, 20,  'indice',      'US500',  32),
  ('GER40',  'DAX 40',            'indice', 1, 1,       1,      12, 0, 50, 20,  'indice',      'GER40',  33),
  ('BTCUSD', 'Bitcoin',           'cripto', 2, 1,       1,      2500, 0, 5, 2,  'cripto_24_7', 'BTCUSD', 50),
  ('ETHUSD', 'Ethereum',          'cripto', 2, 1,       0.1,    250,  0, 20, 2, 'cripto_24_7', 'ETHUSD', 51)
on conflict (symbol) do nothing;

-- ── a escada começa no 1K (decisão do mapa) ────────────────────────────────
-- Só possível emitindo nós: a corretora externa não passava dos 3K para baixo. Nascem
-- INACTIVOS com preço proposto — o preço final é do Ricardo, no painel.
insert into public.mtm_funded_programs (slug, nome, descricao, fases, saldo, preco_cents, moeda, regras, ativo, ordem)
select replace(p.slug, '3k', '1k'), replace(p.nome, '3K', '1K'), p.descricao, p.fases, 1000,
       case when p.fases = 1 then 2900 else 1900 end, p.moeda, p.regras, false, 0
from public.mtm_funded_programs p
where p.slug in ('3k-1f', '3k-2f')
on conflict (slug) do nothing;
