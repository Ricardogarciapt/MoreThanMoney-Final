-- Pagamentos do Stripe que precisam de fatura-recibo (o recibo do Stripe não é fatura em PT).
-- O cron `financas-por-faturar` copia os pagamentos para aqui; o Ricardo emite a fatura no programa
-- certificado e carrega no link «faturado» da lista do Telegram, que preenche `faturado_em`.
create table if not exists financas_por_faturar (
  charge_id text primary key,
  data date not null,
  valor numeric(12,2) not null,
  reembolsado numeric(12,2) not null default 0,
  moeda text not null,
  cliente_nome text,
  cliente_email text,
  pais text,
  produto text,
  faturado_em timestamptz,
  numero_fatura text,
  criado_em timestamptz not null default now()
);
create index if not exists financas_por_faturar_pendentes on financas_por_faturar (data) where faturado_em is null;
alter table financas_por_faturar enable row level security;
