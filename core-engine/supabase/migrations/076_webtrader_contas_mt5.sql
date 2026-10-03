-- 076 · Contas MT5 abertas no WebTrader (/webtrader) com login + password + servidor.
--
-- Porquê uma tabela à parte e não mtmcopy_connections:
--   · Toda a linha de mtmcopy_connections é lida pelos executores (processador de sinais, fan-out do
--     Tap to Trade, system-sync da CopyFactory). Uma conta aberta só para negociar à mão no WebTrader
--     não pode, por engano de configuração, começar a copiar sinais (uma ligação sem grupos cai no
--     «premium» por defeito) nem entrar no fan-out do T2T.
--   · Aqui só vive a referência à conta MetaApi. A password vai para a MetaApi e NUNCA é gravada.
--
-- Custo MetaApi: cada linha com metaapi_account_id é uma conta paga. A quota
-- (lib/contas/quota-metaapi.ts → linhasDeContas) passa a contar também esta tabela. Se a mesma
-- conta (login+servidor) já está ligada no T2T/MTM Auto, o WebTrader REUTILIZA-a e não cria linha.
--
-- Aditiva e idempotente. Sem ela aplicada, o WebTrader continua a abrir as contas MT5 já ligadas;
-- só «Entrar com credenciais» numa conta MT5 nova responde 503 com o aviso da migração em falta.

begin;

create table if not exists public.webtrader_contas_mt5 (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  metaapi_account_id  text,
  plataforma          text not null default 'mt5' check (plataforma in ('mt5', 'mt4')),
  login               text not null,
  servidor            text not null,
  rotulo              text,
  -- pending (a criar na MetaApi) · connected · error
  estado              text not null default 'pending' check (estado in ('pending', 'connected', 'error')),
  erro                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists webtrader_contas_mt5_unica
  on public.webtrader_contas_mt5 (user_id, login, lower(servidor));
create index if not exists webtrader_contas_mt5_metaapi
  on public.webtrader_contas_mt5 (metaapi_account_id) where metaapi_account_id is not null;

alter table public.webtrader_contas_mt5 enable row level security;
-- Sem políticas: só o service role (as rotas /api/webtrader verificam o dono em cada pedido).
revoke all on public.webtrader_contas_mt5 from anon, authenticated;

commit;
