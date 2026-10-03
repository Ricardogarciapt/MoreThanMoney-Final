-- 082 — ESPELHO PROVIDER: uma conta MTM Funded da casa por estratégia, com gestão NOSSA, e a
-- comparação trade a trade com a conta-mestre da MetaApi.
--
-- A pergunta (dono, 15/09): a conta simulada que espelha a estratégia pode passar a ser o provider
-- — gestão (break-even, trailing, parciais) no nosso motor, ao nosso preço, e daí propagar para
-- TradeLocker/MT5/MT4 sem passar pela MetaApi? Esta migração só dá onde medir; nada toca em
-- dinheiro real (as contas são motor='sim' e a propagação fica em SOMBRA nas rotas da 078).
--
--   conta-mestre (MetaApi, streaming) ──evento──▶ motor VPS ──▶ funded_positions (conta espelho da casa)
--                                                    │  gestão da estratégia a cada tick do nosso feed
--                                                    ├──▶ espelho_comparacao (1 linha por trade)
--                                                    └──▶ trigger 078 → copia_eventos (sombra, se houver rota)
--
-- Escritas: 1 linha à abertura (em_curso) e 1 actualização no fecho, por trade. Nada por tick.
-- Aditiva e idempotente. ORDEM DE DEPLOY: esta migração → motor do VPS com ESPELHO_PROVIDER=1.

begin;

-- ── 1. configuração por estratégia ──────────────────────────────────────────
alter table public.mtmauto_providers
  add column if not exists espelho_funded_account_id uuid references public.mtm_trading_accounts(id) on delete set null,
  add column if not exists espelho_provider_ativo boolean not null default false,
  -- {"seguirFechos": "humanos"|"todos"|"nenhum", "seguirParciais": false, "copiarNiveisIniciais": true}
  add column if not exists espelho_config jsonb not null default '{}'::jsonb;

comment on column public.mtmauto_providers.espelho_funded_account_id is
  'conta MTM Funded simulada da CASA que espelha esta estratégia com gestão própria (082; motor VPS espelho-provider.ts)';
comment on column public.mtmauto_providers.espelho_provider_ativo is
  'liga o espelho provider desta estratégia no motor do VPS (precisa também de ESPELHO_PROVIDER=1 no VPS)';

-- Contas da CASA (espelho provider aqui; Edge/King/Wolf noutra entrega usam o mesmo nome): contam
-- para a equidade da MTM e nunca são quebradas por regras (metricas.analise = true no motor).
alter table public.mtm_trading_accounts
  add column if not exists conta_casa boolean not null default false;
comment on column public.mtm_trading_accounts.conta_casa is
  'conta da casa (não de cliente): conta para a equidade da MTM; regras do programa não se aplicam (metricas.analise=true)';
create index if not exists mtm_trading_accounts_casa_idx on public.mtm_trading_accounts (id) where conta_casa;

create unique index if not exists mtmauto_providers_espelho_conta_uniq
  on public.mtmauto_providers (espelho_funded_account_id) where espelho_funded_account_id is not null;

-- ── 2. a comparação mestre × espelho ────────────────────────────────────────
create table if not exists public.espelho_comparacao (
  id uuid primary key default gen_random_uuid(),
  estrategia text not null,
  master_account_id text not null,
  master_position_id text not null,
  espelho_account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  funded_position_id uuid,
  symbol text not null,
  direcao text not null check (direcao in ('buy', 'sell')),
  master_volume numeric,
  espelho_volume numeric,
  master_entrada numeric,
  master_aberta_em timestamptz,
  espelho_entrada numeric,
  espelho_aberta_em timestamptz,
  -- [{preco, volume, em, motivo}] — motivo da mestre: sl|tp|stop_out|expert|humana|desconhecida|estimado
  master_saidas jsonb not null default '[]'::jsonb,
  espelho_saidas jsonb not null default '[]'::jsonb,
  -- [{sl, tp?, em, motivo?, latenciaMs?}]
  master_sl_movimentos jsonb not null default '[]'::jsonb,
  espelho_sl_movimentos jsonb not null default '[]'::jsonb,
  master_pips numeric,
  espelho_pips numeric,
  diferenca_pips numeric,
  master_fechada_em timestamptz,
  espelho_fechada_em timestamptz,
  -- evento recebido → posição escrita (ms) · hora da mestre → evento recebido (ms)
  latencia_entrada_ms int,
  latencia_rede_ms int,
  deslize_entrada_pips numeric,
  -- em_curso (aberta) · completa · so_mestre (o espelho não abriu) · so_espelho · reinicio (motor reiniciou a meio)
  estado text not null default 'em_curso'
    check (estado in ('em_curso', 'completa', 'so_mestre', 'so_espelho', 'reinicio')),
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (espelho_account_id, master_position_id)
);

create index if not exists espelho_comparacao_estrategia_idx on public.espelho_comparacao (estrategia, created_at desc);
create index if not exists espelho_comparacao_em_curso_idx on public.espelho_comparacao (espelho_account_id) where estado = 'em_curso';

comment on table public.espelho_comparacao is
  'Espelho provider (082): uma linha por trade da conta-mestre — saídas, SL, pips e latências da mestre (MetaApi) vs a conta espelho (gestão própria no motor).';

-- Só service role (o relatório do admin lê pelo servidor).
alter table public.espelho_comparacao enable row level security;
revoke all on public.espelho_comparacao from anon, authenticated;

-- ── 3. o veredicto «alinhado» (lido pela guarda de fonte_execucao = 'espelho') ──
--
-- LIMIARES (os mesmos de lib/mtmfunded/espelho/provider.ts → CRITERIOS_PADRAO; mudar os dois juntos):
--   · n_trades        ≥ 30 trades COMPLETAS (mestre e espelho fechados)
--   · |media_diferenca_pips| ≤ 3  (pips espelho − pips mestre, média por trade; nos dois sentidos)
--   · latencia_p95_ms ≤ 1500     = maior de: p95 evento→entrada escrita (espelho_comparacao) e
--                                   p95 propagação outbox→processado (copia_eventos das rotas com
--                                   origem nesta conta espelho, últimos 30 dias)
--   · fechos_perdidos = 0        (trades da mestre em que o espelho não abriu: estado so_mestre)
--   · tem de haver medição de propagação (≥ 1 evento processado de uma rota em sombra desta conta)
-- `motivos` lista o que falta; `alinhado` só é true com a lista vazia.
create or replace view public.espelho_veredito as
with comp as (
  select c.espelho_account_id,
         count(*) filter (where c.estado = 'completa')                                              as n_trades,
         count(*) filter (where c.estado = 'so_mestre')                                             as fechos_perdidos,
         round(avg(c.diferenca_pips) filter (where c.estado = 'completa'), 1)                        as media_diferenca_pips,
         min(c.diferenca_pips) filter (where c.estado = 'completa')                                  as pior_diferenca,
         percentile_cont(0.95) within group (order by c.latencia_entrada_ms::float8)
           filter (where c.estado = 'completa' and c.latencia_entrada_ms is not null)                as p95_entrada_ms,
         min(c.created_at)                                                                           as desde,
         max(c.updated_at)                                                                           as ultima_trade
    from public.espelho_comparacao c
   group by c.espelho_account_id
),
prop as (
  select substring(r.origem_ref from 8)::uuid as espelho_account_id,
         count(*) as n_eventos,
         percentile_cont(0.95) within group (order by (extract(epoch from (e.processado_em - e.origem_em)) * 1000)::float8) as p95_propagacao_ms
    from public.copia_rotas r
    join public.copia_eventos e on e.rota_id = r.id
   where r.origem_tipo = 'mtmfunded' and r.origem_ref like 'funded:%'
     and e.processado_em is not null and e.origem_em is not null
     and e.criado_em > now() - interval '30 days'
   group by 1
),
junto as (
  select p.slug as estrategia, p.id as provider_id, p.espelho_funded_account_id as espelho_account_id,
         coalesce(c.n_trades, 0) as n_trades, coalesce(c.fechos_perdidos, 0) as fechos_perdidos,
         c.media_diferenca_pips, c.pior_diferenca, round(c.p95_entrada_ms) as p95_entrada_ms,
         round(pr.p95_propagacao_ms) as p95_propagacao_ms, coalesce(pr.n_eventos, 0) as n_eventos_propagacao,
         round(greatest(c.p95_entrada_ms, pr.p95_propagacao_ms)) as latencia_p95_ms,
         c.desde, c.ultima_trade
    from public.mtmauto_providers p
    left join comp c on c.espelho_account_id = p.espelho_funded_account_id
    left join prop pr on pr.espelho_account_id = p.espelho_funded_account_id
   where p.espelho_funded_account_id is not null
)
select j.*,
       array_remove(array[
         case when j.n_trades < 30 then 'amostra: ' || j.n_trades || '/30 trades completas' end,
         case when j.media_diferenca_pips is null or abs(j.media_diferenca_pips) > 3 then 'diferença média fora de ±3 pips' end,
         case when j.fechos_perdidos > 0 then j.fechos_perdidos || ' trade(s) da mestre sem espelho' end,
         case when j.n_eventos_propagacao = 0 then 'sem medição de propagação (nenhuma rota em sombra desta conta)' end,
         case when j.latencia_p95_ms is null or j.latencia_p95_ms > 1500 then 'latência p95 acima de 1500 ms' end
       ], null) as motivos,
       (j.n_trades >= 30
        and j.media_diferenca_pips is not null and abs(j.media_diferenca_pips) <= 3
        and j.fechos_perdidos = 0
        and j.n_eventos_propagacao > 0
        and j.latencia_p95_ms is not null and j.latencia_p95_ms <= 1500) as alinhado
  from junto j;

comment on view public.espelho_veredito is
  'Espelho provider (082): alinhado = ≥30 trades completas, |média dif| ≤ 3 pips, latência p95 (entrada e propagação) ≤ 1500 ms, 0 fechos perdidos, com propagação medida.';

revoke all on public.espelho_veredito from anon, authenticated;

-- Para guardas (ex.: só deixar fonte_execucao = 'espelho' quando alinhado). Sem linha → false.
create or replace function public.espelho_alinhado(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select v.alinhado from public.espelho_veredito v where lower(v.estrategia) = lower(p_slug) limit 1), false)
$$;
revoke all on function public.espelho_alinhado(text) from public, anon, authenticated;
grant execute on function public.espelho_alinhado(text) to service_role;

commit;
