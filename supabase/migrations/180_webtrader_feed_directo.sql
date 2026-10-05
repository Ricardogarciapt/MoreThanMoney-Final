-- 180 · Feed directo do WebTrader — o browser do cliente fala com a corretora dele.
--
-- O QUE MUDA (05/10). Numa conta real ligada (MT4/MT5 pela MetaApi ou TradeLocker), as cotações, as
-- velas do gráfico e as posições/ordens passam a vir DIRECTAMENTE da ligação dessa conta à
-- corretora, puxadas pelo browser do cliente — não do nosso VPS nem de reencaminhamento. As ordens
-- continuam a sair pelo servidor (auditadas). Para isso o servidor emite credenciais CURTAS e SÓ DE
-- LEITURA (token MetaApi restrito à conta, 2 h; accessToken TradeLocker SEM refreshToken).
--
-- Porquê duas tabelas:
--   · webtrader_feed_tokens — cache + auditoria das credenciais emitidas. Sem cache, cada abertura
--     do WebTrader pedia um narrow-down novo à MetaApi; com ela, a mesma credencial serve enquanto
--     não expira. O token fica CIFRADO (AES-256-GCM, a chave MTMFUNDED_CRED_KEY) — nunca em claro.
--     `revogado` permite cortar uma credencial antes do prazo (admin / conta removida).
--   · webtrader_feed_pulsos — o batimento de 60 s de cada browser com feed ligado. Diz quem está a
--     olhar para que conta e por que caminho (conta vs mtm). NÃO faz undeploy automático: a MetaApi
--     factura no mínimo 6 h por arranque e as contas slave da cópia têm de ficar deployed — essa
--     decisão fica para o dono (ver docs/webtrader-feed-directo.md).
--
-- Aditiva e idempotente. Sem ela aplicada, a rota /api/webtrader/feed-directo/token continua a
-- funcionar (só não guarda cache nem auditoria) — ver lib/webtrader/feed-directo/emitir.ts.

begin;

create table if not exists public.webtrader_feed_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- mt5:site:<uuid> | mt5:auto:<uuid> | mt5:wt:<uuid> | tradelocker:site:<uuid> | tradelocker:auto:<uuid> | tradelocker:sessao:<accountId>
  ref             text not null,
  plataforma      text not null check (plataforma in ('metaapi', 'tradelocker')),
  -- id MetaApi da conta ou accountId TradeLocker (o que a credencial deixa ler)
  conta_id        text not null,
  token_cifrado   text not null,
  expira_em       timestamptz not null,
  revogado        boolean not null default false,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  -- última vez que esta credencial foi reentregue ao browser a partir da cache
  reutilizado_em  timestamptz
);

create index if not exists webtrader_feed_tokens_user_ref
  on public.webtrader_feed_tokens (user_id, ref, expira_em desc) where revogado = false;

alter table public.webtrader_feed_tokens enable row level security;
-- Sem políticas: só o service role (a rota verifica a posse da conta em cada pedido).
revoke all on public.webtrader_feed_tokens from anon, authenticated;

create table if not exists public.webtrader_feed_pulsos (
  user_id          uuid not null references auth.users(id) on delete cascade,
  ref              text not null,
  plataforma       text not null,
  -- 'conta' = o browser está a ler da corretora; 'mtm' = caiu para o feed indicativo
  fonte            text not null default 'conta' check (fonte in ('conta', 'mtm')),
  estado           text,
  pulsos           integer not null default 1,
  primeiro_pulso   timestamptz not null default now(),
  ultimo_pulso     timestamptz not null default now(),
  primary key (user_id, ref)
);

create index if not exists webtrader_feed_pulsos_ultimo on public.webtrader_feed_pulsos (ultimo_pulso desc);

alter table public.webtrader_feed_pulsos enable row level security;
revoke all on public.webtrader_feed_pulsos from anon, authenticated;

commit;
