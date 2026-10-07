-- 200 · PEDIDOS DO pv-relay (07/10/2026) — a rota /api/telegram/primeverse-exec volta a executar o
-- MTM Auto Edge pela mestre SIM (lib/mestres/edge-pv.ts). Cada pedido do relay fica aqui, ANTES de
-- se decidir, e é esta tabela que:
--   · deduplica: pelo id da mensagem do Telegram (quando o relay o manda) e pela chave do setup
--     (`entry:<setup_msg_id>`, `<kind>:<setup_msg_id>:<nível>`, `setup:<par>:<dir>:<entrada>:<sl>`);
--   · detecta a RAJADA de recuperação: o relay, ao voltar depois de parado, despeja as mensagens
--     antigas seguidas — sem data no pedido, é por aqui que se sabe que são antigas;
--   · prova que um setup foi visto AO VIVO antes do seu ENTRY HIT;
--   · guarda a decisão («atrasado — não executado», «repetido», «executado»…).

create table if not exists public.pv_relay_pedidos (
  id bigserial primary key,
  recebido_em timestamptz not null default now(),
  kind text not null,
  trader text,
  estrategia text,
  symbol text,
  direcao text,
  entrada numeric,
  sl numeric,
  tps jsonb,
  setup_msg_id text,
  msg_id text,
  msg_date timestamptz,
  chave text,
  rajada boolean not null default false,
  decisao text,
  detalhe jsonb
);

create unique index if not exists pv_relay_pedidos_chave_uidx on public.pv_relay_pedidos (chave) where chave is not null;
create unique index if not exists pv_relay_pedidos_msg_uidx on public.pv_relay_pedidos (msg_id) where msg_id is not null;
create index if not exists pv_relay_pedidos_recebido_idx on public.pv_relay_pedidos (recebido_em desc);

alter table public.pv_relay_pedidos enable row level security;
-- só o service role (a rota do relay) lê e escreve
