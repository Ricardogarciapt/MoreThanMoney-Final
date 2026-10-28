-- 220 · Agente cripto (AG-TRADER + AG-SCANNER com sub-agentes): decisões, posições, sessões.
--
-- Papel e real nas MESMAS tabelas, separados pela coluna `modo`, para o dashboard comparar.
-- Nada aqui guarda chaves privadas: `cripto_carteiras` só tem endereços PÚBLICOS. As chaves vivem
-- num ficheiro cifrado na VPS (services/cripto-executor), fora da base.
-- Só o service role lê e escreve (o agente e o executor correm no servidor; o ecrã passa por
-- /api/admin/cripto). Desfaz-se com drop das tabelas e da vista.

create table if not exists public.cripto_decisoes (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  modo text not null check (modo in ('papel', 'real')),
  ativo text not null,
  mercado text not null check (mercado in ('perp', 'spot')),
  gatilho jsonb not null,
  retrato jsonb not null,
  pareceres jsonb not null default '[]',
  decisao_ia jsonb,
  fornecedor_ia text,
  recusas text[] not null default '{}',
  aprovada boolean not null default false
);
create index if not exists cripto_decisoes_em on public.cripto_decisoes (em desc);
create index if not exists cripto_decisoes_ativo_em on public.cripto_decisoes (ativo, em desc);

create table if not exists public.cripto_posicoes (
  id uuid primary key default gen_random_uuid(),
  decisao_id uuid references public.cripto_decisoes (id) on delete set null,
  modo text not null check (modo in ('papel', 'real')),
  ativo text not null,
  mercado text not null check (mercado in ('perp', 'spot')),
  -- Símbolo Bybit (perps) ou mint Solana (spot).
  id_ativo text not null,
  gatilho_tipo text not null,
  lado text not null check (lado in ('long', 'short')),
  nocional_usd numeric not null check (nocional_usd > 0),
  alavancagem int not null default 1 check (alavancagem between 1 and 5),
  entrada numeric not null,
  sl numeric not null,
  tp numeric not null,
  risco_usd numeric not null,
  slippage_max_pct numeric not null default 1,
  exploracao boolean not null default false,
  -- pendente = à espera do executor real; aberta; fechada; falhada (o executor recusou ou o exchange falhou).
  estado text not null default 'aberta' check (estado in ('pendente', 'aberta', 'fechada', 'falhada')),
  fechar_pedido text,
  motivo_fecho text,
  saida numeric,
  pnl_usd numeric,
  execucao jsonb not null default '{}',
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz
);
create index if not exists cripto_posicoes_estado on public.cripto_posicoes (modo, estado);
-- Uma decisão = no máximo uma posição (idempotência).
create unique index if not exists cripto_posicoes_decisao_unica on public.cripto_posicoes (decisao_id) where decisao_id is not null;

create table if not exists public.cripto_sessoes (
  modo text not null check (modo in ('papel', 'real')),
  inicio timestamptz not null,
  fim timestamptz not null,
  equity_fim_usd numeric,
  pnl_usd numeric,
  trades int not null default 0,
  -- Envio dos lucros: nada | simulada (papel) | pedida | enviada | falhada
  varredura_estado text not null default 'nada',
  varredura_usd numeric not null default 0,
  varredura_destino text,
  varredura_tx text,
  porque text,
  em timestamptz not null default now(),
  primary key (modo, inicio)
);

create table if not exists public.cripto_carteiras (
  rede text not null,
  endereco text not null,
  papel text not null default 'trading',
  criada_em timestamptz not null default now(),
  primary key (rede, endereco)
);

-- Saldos lidos pelo executor real (Bybit subconta + carteira Solana). Só a última linha conta.
create table if not exists public.cripto_saldos (
  em timestamptz not null default now(),
  equity_usd numeric not null,
  livre_usd numeric not null,
  detalhe jsonb not null default '{}'
);
create index if not exists cripto_saldos_em on public.cripto_saldos (em desc);

-- A régua: por modo e tipo de gatilho, o que fechou e o R por trade.
create or replace view public.cripto_vantagem
with (security_invoker = true) as
select
  modo,
  gatilho_tipo,
  count(*)::int as n,
  count(*) filter (where pnl_usd > 0)::int as ganhos,
  coalesce(sum(pnl_usd), 0)::float8 as pnl,
  coalesce(sum(pnl_usd / nullif(risco_usd, 0)), 0)::float8 as soma_r,
  coalesce(sum(power(pnl_usd / nullif(risco_usd, 0), 2)), 0)::float8 as soma_r2
from public.cripto_posicoes
where estado = 'fechada' and pnl_usd is not null
group by modo, gatilho_tipo;

alter table public.cripto_decisoes enable row level security;
alter table public.cripto_posicoes enable row level security;
alter table public.cripto_sessoes enable row level security;
alter table public.cripto_carteiras enable row level security;
alter table public.cripto_saldos enable row level security;
revoke all on public.cripto_decisoes, public.cripto_posicoes, public.cripto_sessoes, public.cripto_carteiras, public.cripto_saldos, public.cripto_vantagem from anon, authenticated;
grant all on public.cripto_decisoes, public.cripto_posicoes, public.cripto_sessoes, public.cripto_carteiras, public.cripto_saldos to service_role;
grant select on public.cripto_vantagem to service_role;

-- Ligado em PAPEL (OK do Ricardo, 28/10: «a e c»). O real só arranca com modo='real' AQUI e
-- CRIPTO_REAL=1 no env da VPS: duas chaves, em dois sítios.
insert into public.site_settings (key, value, description)
select 'agente_cripto',
  '{"ligado": true, "modo": "papel", "capitalPapelUsd": 1000, "perps": ["BTCUSDT", "ETHUSDT", "SOLUSDT"], "memecoins": true, "horaFechoSessaoUtc": 0, "maxGatilhosPorPassagem": 2}'::jsonb,
  'Agente cripto (lib/cripto/ciclo.ts). Muda-se em /admin/cripto.'
where not exists (select 1 from public.site_settings where key = 'agente_cripto');
