-- «Pedir análise ao meu negócio» (morethanmoney.pt/solucoes).
--
-- Cada pedido guarda o que a pessoa contou, as horas do simulador e o relatório preliminar que lhe
-- foi mostrado (calculado + leitura da IA). O dono recebe aviso por Telegram e faz a análise
-- completa. Só o servidor lê e escreve (service role): RLS ligado e sem políticas, de propósito.

create table if not exists public.pedidos_analise_negocio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text,
  empresa text not null,
  site text,
  equipa text not null,
  dores text not null,
  sector text not null,
  horas jsonb not null default '{}'::jsonb,
  custo_hora numeric not null default 12,
  relatorio jsonb not null default '{}'::jsonb,
  ia_fornecedor text,
  consentimento_em timestamptz not null default now(),
  estado text not null default 'novo' check (estado in ('novo', 'em_analise', 'enviado', 'diagnostico_marcado', 'fechado', 'descartado')),
  notas text,
  ip_hash text,
  origem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists pedidos_analise_negocio_estado_idx on public.pedidos_analise_negocio (estado, criado_em desc);
create index if not exists pedidos_analise_negocio_ip_idx on public.pedidos_analise_negocio (ip_hash, criado_em desc);

alter table public.pedidos_analise_negocio enable row level security;
