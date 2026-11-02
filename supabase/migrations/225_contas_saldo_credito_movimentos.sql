-- 225 — Crédito/bónus, flutuante, histórico de equity e movimentos de conta (depósitos, levantamentos,
-- créditos, comissões) das contas de corretora.
--
-- Pedido do Ricardo (02/11/2026): «equity abaixo do saldo» lia-se como posições em perda quando podia ser
-- só o bónus da corretora a sair; e as contas dos clientes têm de mostrar depósitos, levantamentos e
-- fees, não só o saldo. A MetaApi dá o `credit` em /account-information e os movimentos nos deals que
-- não são BUY/SELL (DEAL_TYPE_BALANCE, _CREDIT, _COMMISSION…). O cron contas-saldos (hora a hora) lê e
-- guarda tudo isto por conta; o dashboard e o backoffice lêem daqui — nunca a MetaApi por linha.

alter table public.contas_saldo_lido
  add column if not exists credito   numeric,   -- bónus/crédito da corretora (entra na equity, não é dinheiro do cliente)
  add column if not exists flutuante numeric;   -- equity - saldo - crédito = o que as posições abertas valem agora

-- Um ponto por leitura de hora a hora (ou pedida no admin): a curva de equity real de cada conta.
create table if not exists public.contas_saldo_historico (
  chave     text not null,                      -- id MetaApi (MT4/MT5) ou ref TradeLocker — a mesma de contas_saldo_lido
  lido_em   timestamptz not null,
  saldo     numeric,
  equity    numeric,
  credito   numeric,
  flutuante numeric,
  moeda     text,
  origem    text not null default 'actualizar',
  primary key (chave, lido_em)
);
create index if not exists contas_saldo_historico_chave_idx on public.contas_saldo_historico (chave, lido_em desc);
alter table public.contas_saldo_historico enable row level security;

-- Movimentos que não são trades, tal como a corretora os regista. Chave = id do deal: reler a janela
-- de 90 dias de hora a hora não duplica nada.
create table if not exists public.contas_movimentos (
  chave          text not null,
  deal_id        text not null,
  em             timestamptz not null,
  tipo           text not null check (tipo in ('deposito','levantamento','credito','comissao','ajuste')),
  tipo_corretora text,                           -- DEAL_TYPE_BALANCE, DEAL_TYPE_CREDIT, DEAL_TYPE_COMMISSION…
  valor          numeric,                        -- sinal da corretora: depósito +, levantamento −
  moeda          text,
  comentario     text,
  importado_em   timestamptz not null default now(),
  primary key (chave, deal_id)
);
create index if not exists contas_movimentos_chave_em_idx on public.contas_movimentos (chave, em desc);
alter table public.contas_movimentos enable row level security;
