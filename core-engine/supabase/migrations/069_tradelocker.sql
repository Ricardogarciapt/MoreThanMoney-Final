-- 069 · TradeLocker como segunda plataforma de execução (a par do MetaTrader via MetaApi).
--
-- O que muda:
--   1) mtmcopy_connections (T2T + MTM Copy): mt5_platform passa a aceitar 'tradelocker' e ganha
--      as colunas NÃO secretas da conta TradeLocker (servidor, ambiente, accountId, accNum, …).
--   2) mtmauto_accounts (MTM Auto): as mesmas colunas; `plataforma` já é texto livre (sem check),
--      por isso 'tradelocker' entra sem mexer em constraints. A execução do MTM Auto vive no repo
--      mtm-auto e ainda não lê isto — ficam as colunas prontas.
--   3) tradelocker_credenciais: email + password CIFRADA (AES-256-GCM, lib/mtmfunded/credenciais.ts,
--      chave MTMFUNDED_CRED_KEY). Tabela À PARTE de propósito: meia centena de rotas faz
--      `select('*')` a mtmcopy_connections e devolve a linha ao browser; uma coluna com a cifra ali
--      ia parar a respostas JSON sem ninguém dar por isso. Aqui só o service role lê (RLS ligado,
--      sem políticas).
--
-- Aditiva e idempotente: o código antigo ignora tudo isto; o código novo só entra no ramo
-- TradeLocker quando mt5_platform/plataforma = 'tradelocker'.

begin;

-- 1) T2T / MTM Copy ────────────────────────────────────────────────────────────────────────────
alter table public.mtmcopy_connections
  drop constraint if exists mtmcopy_connections_mt5_platform_check;
alter table public.mtmcopy_connections
  add constraint mtmcopy_connections_mt5_platform_check
  check (mt5_platform = any (array['mt4'::text, 'mt5'::text, 'tradelocker'::text]));

alter table public.mtmcopy_connections
  add column if not exists tl_server       text,
  add column if not exists tl_env          text,
  add column if not exists tl_account_id   text,
  add column if not exists tl_acc_num      text,
  add column if not exists tl_last_error   text,
  add column if not exists tl_connected_at timestamptz;

alter table public.mtmcopy_connections
  drop constraint if exists mtmcopy_connections_tl_env_check;
alter table public.mtmcopy_connections
  add constraint mtmcopy_connections_tl_env_check
  check (tl_env is null or tl_env = any (array['live'::text, 'demo'::text]));

-- A mesma conta TradeLocker não se liga duas vezes ao mesmo utilizador (o índice parcial ignora
-- as ligações desligadas, como faz a verificação de duplicados das contas MT5).
create unique index if not exists mtmcopy_connections_tl_unica
  on public.mtmcopy_connections (user_id, tl_env, tl_server, tl_account_id)
  where mt5_platform = 'tradelocker' and mt5_status <> 'disconnected';

-- 2) MTM Auto ─────────────────────────────────────────────────────────────────────────────────
alter table public.mtmauto_accounts
  add column if not exists tl_server       text,
  add column if not exists tl_env          text,
  add column if not exists tl_account_id   text,
  add column if not exists tl_acc_num      text,
  add column if not exists tl_last_error   text,
  add column if not exists tl_connected_at timestamptz;

alter table public.mtmauto_accounts
  drop constraint if exists mtmauto_accounts_tl_env_check;
alter table public.mtmauto_accounts
  add constraint mtmauto_accounts_tl_env_check
  check (tl_env is null or tl_env = any (array['live'::text, 'demo'::text]));

-- 3) Credenciais (só service role) ────────────────────────────────────────────────────────────
create table if not exists public.tradelocker_credenciais (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  mtmcopy_connection_id uuid references public.mtmcopy_connections(id) on delete cascade,
  mtmauto_account_id    uuid references public.mtmauto_accounts(id) on delete cascade,
  tl_email              text not null,
  tl_password_cifrada   text not null,
  tl_server             text not null,
  tl_env                text not null check (tl_env in ('live', 'demo')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Cada credencial pertence a UMA ligação (de um produto ou do outro).
  constraint tradelocker_credenciais_um_dono check (
    (mtmcopy_connection_id is not null)::int + (mtmauto_account_id is not null)::int = 1
  )
);

create unique index if not exists tradelocker_credenciais_mtmcopy
  on public.tradelocker_credenciais (mtmcopy_connection_id) where mtmcopy_connection_id is not null;
create unique index if not exists tradelocker_credenciais_mtmauto
  on public.tradelocker_credenciais (mtmauto_account_id) where mtmauto_account_id is not null;
create index if not exists tradelocker_credenciais_user on public.tradelocker_credenciais (user_id);

alter table public.tradelocker_credenciais enable row level security;
-- Sem políticas: anon/authenticated não leem nem escrevem. Só o service role (servidor).
revoke all on public.tradelocker_credenciais from anon, authenticated;

commit;
