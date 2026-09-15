-- 092 — ESTRATÉGIAS POR SINAIS (MTM Auto Edge / King / Wolf), CONTA «TODOS OS SINAIS» e CONTAS DA CASA.
--
-- Pedido do dono (15/09):
--   A) três estratégias novas a partir dos sinais do PrimeVerse, filtradas por trader
--      (fxedge → mtm-auto-edge · kingfkg → mtm-auto-king · g_wolf → mtm-auto-wolf), abertas numa
--      conta MTM Funded simulada DA CASA (a mestre) e geridas com trailing stop + trailing profit;
--   B) contas simuladas do dono (uma por estratégia + «Todos os sinais», 0,01 fixo com a fonte no
--      comentário), sem regras de programa, ligadas como contas pessoais em T2T / MTM System / MTM Copy.
--
--   pv-relay ─▶ /api/telegram/primeverse-exec ─▶ lib/mtmfunded/estrategias-sinais/executar.ts
--                                                   ├─▶ conta da casa (mestre)      ┐ funded_positions
--                                                   └─▶ seguidoras (segue_estrategia) ┘ + funded_sinal_posicoes
--   signal-tracker (todas as fontes T2T) ─▶ todos-os-sinais.ts ─▶ conta «Todos os sinais»
--
-- A gestão (parciais, break-even, trailing) é a das ordens avançadas (072) e corre no motor do VPS.
-- ORDEM: 072 → (082, 083 noutros ramos, independentes) → 092. Nada aqui toca em dinheiro real.
-- Aditiva e idempotente. NÃO APLICAR sem rever.

begin;

-- ── 1. contas da casa e contas sem regras ────────────────────────────────────
-- `conta_casa` é o MESMO nome da 082 (espelho provider): as duas entregas marcam as contas da casa
-- assim, e a equidade da MTM soma-as (lib/equidade-casa.ts).
alter table public.mtm_trading_accounts
  add column if not exists conta_casa boolean not null default false,
  add column if not exists sem_regras boolean not null default false,
  add column if not exists recolhe_todos_sinais boolean not null default false;

comment on column public.mtm_trading_accounts.conta_casa is
  'conta da casa (não de cliente): conta para a equidade da MTM; regras do programa não se aplicam (metricas.analise=true)';
comment on column public.mtm_trading_accounts.sem_regras is
  'nunca é quebrada por regras de programa (perda diária/máxima, objectivo). Força metricas.analise=true (trigger).';
comment on column public.mtm_trading_accounts.recolhe_todos_sinais is
  'abre TODOS os sinais que passam pelo sistema a 0,01 com a fonte no comentário (recolha de dados)';

create index if not exists mtm_trading_accounts_casa_idx on public.mtm_trading_accounts (id) where conta_casa;
create index if not exists mtm_trading_accounts_todos_sinais_idx on public.mtm_trading_accounts (id) where recolhe_todos_sinais;

-- O motor (contaSim) e o site (ehContaDeAnalise) desligam as regras por metricas.analise. O motor
-- REESCREVE metricas a cada ciclo (espalha a anterior, por isso a chave fica) — mas as contas de
-- 14/09 do Fábio e da Alcy estão hoje SEM a chave (verificado a 15/09). O trigger garante-a sempre
-- que a conta é marcada sem regras ou da casa, venha a escrita de onde vier.
create or replace function public.funded_forcar_analise() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.sem_regras or new.conta_casa then
    if coalesce(new.metricas->>'analise', '') <> 'true' then
      new.metricas := coalesce(new.metricas, '{}'::jsonb) || jsonb_build_object('analise', true);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists funded_forcar_analise on public.mtm_trading_accounts;
create trigger funded_forcar_analise before insert or update of metricas, sem_regras, conta_casa
  on public.mtm_trading_accounts for each row execute function public.funded_forcar_analise();

-- Correcção de dados: as contas que seguem estratégias nasceram para NÃO ter regras (070), e
-- perderam a chave. Fica explícito na coluna — o trigger repõe a chave.
update public.mtm_trading_accounts
   set sem_regras = true
 where motor = 'sim' and segue_estrategia is not null and not sem_regras;

-- ── 2. providers: tipo mtmfunded, a conta-mestre e a configuração dos sinais ─
-- (a lista de tipos é a da 083; repetida aqui para esta migração não depender da ordem)
alter table public.mtmauto_providers drop constraint if exists mtmauto_providers_tipo_check;
alter table public.mtmauto_providers add constraint mtmauto_providers_tipo_check
  check (tipo in ('mtm_t2t', 'metaapi', 'telegram', 'mtmfunded', 'tradelocker'));

alter table public.mtmauto_providers
  add column if not exists funded_account_id uuid references public.mtm_trading_accounts(id) on delete set null,
  -- de onde vêm os sinais e o filtro (primeverse + trader)
  add column if not exists fonte_sinais text,
  add column if not exists fonte_filtro text,
  -- { lotePor1000, beNoTp1, beOffsetPips, trailingFracaoDoRisco, permitirDuplicado, saidasPct? }
  add column if not exists sinais_config jsonb not null default '{}'::jsonb;

comment on column public.mtmauto_providers.fonte_sinais is 'fonte dos sinais de uma estratégia mtmfunded (primeverse)';
comment on column public.mtmauto_providers.fonte_filtro is 'filtro da fonte (primeverse: nome do trader, ex. fxedge)';
comment on column public.mtmauto_providers.sinais_config is 'gestão dos sinais (lib/mtmfunded/estrategias-sinais/calculo.ts → configDoProvider)';

-- As três estratégias. ativo=false até o dono ligar; espelhar=true (aparecem como copiáveis).
-- Mesmo tenant da Premium (a casa). A conta-mestre (funded_account_id) é criada e ligada por
-- scripts/criar-contas-casa-primeverse.ts — as credenciais têm de ser cifradas com a
-- MTMFUNDED_CRED_KEY, que a base não tem.
insert into public.mtmauto_providers
  (tenant_id, slug, nome, descricao, tipo, fonte_sinais, fonte_filtro, ativo, espelhar,
   trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips, saidas_pct, risco_default_pct, sinais_config)
select t.tenant_id, v.slug, v.nome, v.descricao, 'mtmfunded', 'primeverse', v.trader, false, true,
       null, null, null, array[50, 25], 1, '{"lotePor1000": 0.01, "beNoTp1": true, "beOffsetPips": 2, "trailingFracaoDoRisco": 0.5}'::jsonb
  from (values
    ('mtm-auto-edge', 'MTM Auto Edge', 'Sinais do trader fxedge (PrimeVerse), geridos com trailing stop e trailing profit.', 'fxedge'),
    ('mtm-auto-king', 'MTM Auto King', 'Sinais do trader kingfkg (PrimeVerse), geridos com trailing stop e trailing profit.', 'kingfkg'),
    ('mtm-auto-wolf', 'MTM Auto Wolf', 'Sinais do trader g_wolf (PrimeVerse), geridos com trailing stop e trailing profit.', 'g_wolf')
  ) as v(slug, nome, descricao, trader)
  cross join lateral (select (select tenant_id from public.mtmauto_providers where slug = 'premium-ouro' limit 1) as tenant_id) t
 where not exists (select 1 from public.mtmauto_providers p where lower(p.slug) = v.slug);

-- ── 3. a ponte sinal → posição (anti-duplicação) ────────────────────────────
create table if not exists public.funded_sinal_posicoes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  -- slug da estratégia, ou 'todos' na conta «Todos os sinais»
  estrategia text not null,
  -- idempotência por fonte (calculo.ts → chaveDoSinal)
  chave text not null,
  -- o TRADE independentemente da fonte (calculo.ts → impressaoDoTrade)
  impressao text,
  fonte text not null,
  -- outras fontes que trouxeram o mesmo trade depois (não abriram outra vez)
  fontes_extra text[] not null default '{}',
  chat_message_id uuid,
  funded_position_id uuid references public.funded_positions(id) on delete set null,
  symbol text not null,
  direcao text not null check (direcao in ('buy', 'sell')),
  entrada numeric,
  sl numeric,
  tps numeric[],
  volume numeric,
  -- a_abrir (gravada antes da posição) → aberta → fechada | recusada | cancelada
  estado text not null default 'a_abrir' check (estado in ('a_abrir', 'aberta', 'fechada', 'recusada', 'cancelada')),
  sem_gestao boolean not null default false,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, chave)
);
-- o mesmo trade não abre duas vezes na mesma conta enquanto a primeira estiver viva
create unique index if not exists funded_sinal_posicoes_trade_vivo
  on public.funded_sinal_posicoes (account_id, impressao)
  where impressao is not null and estado in ('a_abrir', 'aberta');
create index if not exists funded_sinal_posicoes_abertas_idx
  on public.funded_sinal_posicoes (estrategia, symbol, direcao) where estado in ('a_abrir', 'aberta');
create index if not exists funded_sinal_posicoes_chat_idx
  on public.funded_sinal_posicoes (chat_message_id) where chat_message_id is not null;

alter table public.funded_sinal_posicoes enable row level security;
drop policy if exists funded_sinal_posicoes_ler on public.funded_sinal_posicoes;
create policy funded_sinal_posicoes_ler on public.funded_sinal_posicoes for select to authenticated
  using (exists (select 1 from public.mtm_trading_accounts a where a.id = account_id and a.user_id = auth.uid()));
revoke all on public.funded_sinal_posicoes from anon;
revoke insert, update, delete on public.funded_sinal_posicoes from authenticated;

commit;
