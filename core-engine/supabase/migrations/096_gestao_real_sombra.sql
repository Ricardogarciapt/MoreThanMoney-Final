-- 096 — MOTOR EM TEMPO REAL (services/motor-real): registo da SOMBRA, batimento do motor e a lista
--        de contas em live (vazia).
--
-- Aditiva e idempotente. Sem ela o motor arranca mas não grava a sombra (loga o erro e continua a
-- decidir) e os monitores antigos continuam a gerir tudo (o guarda falha a ler → «o monitor gere»).
--
-- Carga (Supabase frágil desde 15/09): NADA aqui é escrito por tick.
--   · gestao_real_sombra: uma linha por DECISÃO (intenções da mesma regra fundem-se em 5 s), gravada
--     em lote de 5 em 5 s; limpeza das linhas >30 dias uma vez por hora pelo próprio motor.
--   · gestao_real_pulso: UM upsert a cada 5 s (uma linha).
--   · Leituras do painel: últimas 24 h por decidido_em (índice) — no máximo 5 000 linhas.

begin;

-- ── 1. o que o motor decidiu (sombra) e o que o monitor fez ──────────────────
create table if not exists public.gestao_real_sombra (
  id bigserial primary key,
  -- conta MetaApi onde a decisão cai (a do subscritor, no espelho por conta)
  conta text not null,
  -- premium | t2t | mtmauto | subscritor (null nas linhas só do monitor/corretora)
  tipo text,
  -- id da linha de origem: mtmcopy_premium_active / mtmcopy_signal_log / mtmauto_executions
  ref text,
  posicao text not null,
  simbolo text not null,
  lado text,
  -- tranca_lucro | be_cedo | zona_larga | trailing_pos_tp1 | exit1_parcial | exit3_total |
  -- be_trailing_exit1 | conta_pequena_exit1 | perfil_trailing | espelho_subscritores | be | trailing |
  -- alvo1_parcial | alvo_final | espelho_educador | posicao_fechada | monitor_sem_sombra | …
  regra text not null,
  -- sl | fecho | espelho | encerrar
  acao text not null,
  sl numeric,
  tp numeric,
  -- volume a fechar (null = fecho total)
  volume numeric,
  preco numeric,
  -- hora do tick que levou à decisão
  tick_em timestamptz,
  decidido_em timestamptz not null default now(),
  -- o que o monitor actual fez (visto no streaming): hora e valor (SL novo / volume fechado)
  monitor_em timestamptz,
  monitor_valor numeric,
  -- monitor_em − tick_em (positivo = o monitor foi mais lento que o motor)
  latencia_ms integer,
  divergencia_pips numeric,
  divergencia_volume numeric,
  -- casada | sem_monitor | monitor_sem_sombra | posicao_fechada | espelho | live_ok | live_falhou
  estado text not null,
  -- sombra | live
  modo text not null default 'sombra',
  detalhe text
);
create index if not exists gestao_real_sombra_em_idx on public.gestao_real_sombra (decidido_em desc);
create index if not exists gestao_real_sombra_conta_idx on public.gestao_real_sombra (conta, decidido_em desc);
create index if not exists gestao_real_sombra_regra_idx on public.gestao_real_sombra (regra, decidido_em desc);
alter table public.gestao_real_sombra enable row level security;
revoke all on public.gestao_real_sombra from anon, authenticated;
grant all on public.gestao_real_sombra to service_role;
grant usage, select on sequence public.gestao_real_sombra_id_seq to service_role;

-- ── 2. batimento do motor ────────────────────────────────────────────────────
-- Os monitores antigos só largam uma conta em live quando isto tem <20 s, escrita=true e a conta
-- está em `live` (lib/gestao-real/contas-live-regras.ts).
create table if not exists public.gestao_real_pulso (
  servico text primary key,
  em timestamptz not null default now(),
  escrita boolean not null default false,
  -- ["<conta>:premium", …] — contas que o motor está DE FACTO a gerir em live
  live jsonb not null default '[]'::jsonb,
  -- resumo das ligações: [{conta, tipos, sync, posicoes, ultimoTick}]
  contas jsonb not null default '[]'::jsonb,
  detalhe jsonb
);
alter table public.gestao_real_pulso enable row level security;
revoke all on public.gestao_real_pulso from anon, authenticated;
grant all on public.gestao_real_pulso to service_role;

-- ── 3. lista de contas em live (VAZIA) ───────────────────────────────────────
-- Formato: ["<id MetaApi>"] ou [{"conta":"<id>","tipos":["premium"]}]. Nesta fase só «premium».
insert into public.site_settings (key, value, description)
values ('motor_real_contas_live', '[]'::jsonb, 'Contas geridas pelo motor em tempo real do VPS (live). Vazia = monitores antigos gerem tudo.')
on conflict (key) do nothing;

commit;
