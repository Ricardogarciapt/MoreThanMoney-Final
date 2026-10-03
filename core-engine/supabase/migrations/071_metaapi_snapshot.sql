-- 071 — Fotografia das contas do motor por STREAMING (MetaApi) + sombra de verificação.
--
-- O serviço `mtm-premium-streaming` (VPS, services/premium-streaming) mantém uma ligação de
-- streaming às contas de PREMIUM_STREAMING_CONTAS e escreve aqui as posições e os preços dos
-- símbolos delas (no máximo 1×/s por conta, só quando muda, + batimento de 2 s). O monitor de
-- preço Premium (lib/mtmcopy/premium-price-monitor.ts) lê esta linha em vez de getPositions /
-- getSymbolPrice por RPC quando ela é fresca (≤3 s) e sincronizada; senão usa o RPC como antes.
--
-- Só service role: RLS ligado e nenhuma política — nem anon nem authenticated leem ou escrevem.

create table if not exists public.metaapi_snapshot (
  account_id text primary key,
  posicoes jsonb not null default '[]'::jsonb,
  precos jsonb not null default '{}'::jsonb,
  sincronizado boolean not null default false,
  em timestamptz not null default now()
);

alter table public.metaapi_snapshot enable row level security;
revoke all on public.metaapi_snapshot from anon, authenticated;

-- Sombra: de 30 em 30 s por conta, o monitor compara a fotografia com uma leitura RPC e grava as
-- diferenças. Serve para verificar 1–2 dias antes de alargar a mais contas; pode apagar-se depois.
create table if not exists public.metaapi_snapshot_sombra (
  id bigint generated always as identity primary key,
  account_id text not null,
  em timestamptz not null default now(),
  snapshot_em timestamptz,
  idade_ms integer,
  iguais boolean not null,
  diferencas jsonb not null default '[]'::jsonb,
  contagem_snapshot integer,
  contagem_rpc integer,
  preco_delta_pips jsonb not null default '{}'::jsonb
);
create index if not exists metaapi_snapshot_sombra_conta_em_idx
  on public.metaapi_snapshot_sombra (account_id, em desc);

alter table public.metaapi_snapshot_sombra enable row level security;
revoke all on public.metaapi_snapshot_sombra from anon, authenticated;
