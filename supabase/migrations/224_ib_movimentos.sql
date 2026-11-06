-- 224 — Movimentos de fundos das contas da rede de IBs (depósitos e levantamentos por dia).
--
-- O «IB report» mensal da PU Prime traz duas folhas: «fund report» (um movimento por linha: data,
-- ID de usuário, conta, depósito, levantamento, net) e «opened accounts». A tabela ib_contas guarda
-- UMA linha por conta — o último estado — e não tem onde pôr movimentos datados. Sem isto, o
-- relatório de Outubro desaparecia no de Novembro e nunca se sabia quanto entrou num mês.
--
-- Chave natural: a corretora não dá um id ao movimento, por isso a mesma linha reimportada
-- (mesma conta, mesma data, mesmos valores) cai em cima de si própria em vez de duplicar.
create table if not exists public.ib_movimentos (
  id                  bigint generated always as identity primary key,
  corretora           text not null,
  conta               text not null,
  cliente_externo_id  text,
  data                date not null,
  depositos           numeric not null default 0,
  levantamentos       numeric not null default 0,
  net                 numeric not null default 0,
  campanha            text,
  importado_em        timestamptz not null default now(),
  unique (corretora, conta, data, depositos, levantamentos)
);

create index if not exists ib_movimentos_corretora_data on public.ib_movimentos (corretora, data desc);

-- Só o service role (servidor) lê e escreve, como ib_contas.
alter table public.ib_movimentos enable row level security;
