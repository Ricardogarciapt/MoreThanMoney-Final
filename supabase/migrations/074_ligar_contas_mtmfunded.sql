-- 074 — Ligar contas MTM Funded (as nossas, simuladas) nas apps: T2T (site/app-mobile/iOS) e MTM Auto.
--
-- O cliente escreve Login (77xxxxxx), password (master ou investor) e servidor «MTM Funded».
-- O servidor valida contra as credenciais cifradas (mtm_trading_accounts.mt5_*_cifrada) e grava
-- SÓ a referência à conta (`funded_account_id`) — nunca a password.
--
--   · password MASTER e a conta é do próprio utilizador → ligação completa (métricas + execução
--     pelo motor simulado, funções atómicas funded_*).
--   · password INVESTOR (de qualquer conta) → ligação SÓ DE LEITURA (métricas sim, execução não).
--   · password master de conta de OUTRO utilizador → recusada.
--
-- `mt5_platform/plataforma = 'mtmfunded'` continua a ser o sinal para TODOS os executores
-- (MetaApi, CopyFactory, TradeLocker) de que a conta não é com eles. As checks abaixo tornam isso
-- estrutural: uma linha mtmfunded não pode ter conta MetaApi.
--
-- Aditiva e idempotente. O código novo tolera a migração por aplicar (lê '*' e cai para memória
-- no limite de tentativas).

begin;

-- ── 1. T2T (mtmcopy_connections) ─────────────────────────────────────────────
alter table public.mtmcopy_connections
  add column if not exists funded_account_id uuid references public.mtm_trading_accounts(id) on delete cascade,
  add column if not exists funded_somente_leitura boolean not null default false;

comment on column public.mtmcopy_connections.funded_account_id is
  'conta MTM Funded simulada ligada pelo cliente (mt5_platform=mtmfunded). Execução só pelo motor simulado.';
comment on column public.mtmcopy_connections.funded_somente_leitura is
  'ligada com a password investor: métricas sim, execução nunca';

create unique index if not exists mtmcopy_connections_funded_unica
  on public.mtmcopy_connections (user_id, funded_account_id)
  where funded_account_id is not null and mt5_status <> 'disconnected';

alter table public.mtmcopy_connections drop constraint if exists mtmcopy_connections_mtmfunded_sem_metaapi;
alter table public.mtmcopy_connections add constraint mtmcopy_connections_mtmfunded_sem_metaapi
  check (mt5_platform is distinct from 'mtmfunded' or (metaapi_account_id is null and funded_account_id is not null)) not valid;

-- ── 2. MTM Auto (mtmauto_accounts) ───────────────────────────────────────────
alter table public.mtmauto_accounts
  add column if not exists funded_somente_leitura boolean not null default false,
  add column if not exists funded_ligada_pelo_cliente boolean not null default false;

comment on column public.mtmauto_accounts.funded_somente_leitura is
  'ligada com a password investor: métricas sim, execução/estratégias nunca';
comment on column public.mtmauto_accounts.funded_ligada_pelo_cliente is
  'true = o cliente ligou-a com login+password (pode remover); false = atribuída pela equipa (070)';

-- 070 deixava UMA linha por conta simulada no total; uma conta pode agora ser acompanhada
-- (investor) por outro utilizador — passa a ser uma por utilizador.
drop index if exists public.mtmauto_accounts_funded_uniq;
create unique index if not exists mtmauto_accounts_funded_por_user
  on public.mtmauto_accounts (user_id, funded_account_id)
  where funded_account_id is not null;

alter table public.mtmauto_accounts drop constraint if exists mtmauto_accounts_mtmfunded_sem_metaapi;
alter table public.mtmauto_accounts add constraint mtmauto_accounts_mtmfunded_sem_metaapi
  check (plataforma is distinct from 'mtmfunded' or (metaapi_account_id is null and funded_account_id is not null)) not valid;

-- ── 3. Limite de tentativas (por utilizador e por login) ─────────────────────
create table if not exists public.mtmfunded_ligacao_tentativas (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  login text not null,
  ok boolean not null default false,
  origem text not null default 'site',   -- 'site' | 'mtmauto'
  criado_em timestamptz not null default now()
);
create index if not exists mtmfunded_ligacao_tentativas_user on public.mtmfunded_ligacao_tentativas (user_id, criado_em desc);
create index if not exists mtmfunded_ligacao_tentativas_login on public.mtmfunded_ligacao_tentativas (login, criado_em desc);

alter table public.mtmfunded_ligacao_tentativas enable row level security;
-- Sem políticas: só o service role.
revoke all on public.mtmfunded_ligacao_tentativas from anon, authenticated;

commit;
