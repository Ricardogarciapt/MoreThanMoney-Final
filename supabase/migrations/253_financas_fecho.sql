-- Finanças MTM (16/11/2026): fecho mensal Stripe + despesas e dossier para o contabilista.
--
-- Regras do Ricardo (16/11):
--  · a conciliação é só da MTM: Stripe + despesas da MTM. O IB da PU Prime é rendimento pessoal
--    do Ricardo e NUNCA entra aqui (nem na tabela de despesas, nem no dossier);
--  · nada é submetido à AT nem pago sem o Ricardo — isto prepara, não entrega.
-- Tudo só por service role (RLS ligado, sem políticas): são dados fiscais.

insert into storage.buckets (id, name, public)
values ('financas', 'financas', false)
on conflict (id) do nothing;

-- Despesas da casa (faturas de fornecedores). Quem as lê do Gmail ou do painel do CEO escreve aqui;
-- `entidade` separa MTM do pessoal, e só 'mtm' entra no fecho.
create table if not exists public.financas_despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  fornecedor text not null,
  descricao text,
  valor numeric(12,2) not null,            -- total pago, com IVA
  iva numeric(12,2),                       -- IVA da fatura, se a fatura o mostrar
  moeda text not null default 'EUR',
  categoria text,                          -- infra · ia · ferramentas · marketing · outros
  entidade text not null default 'por_decidir' check (entidade in ('mtm','ricardo','por_decidir')),
  nif_fornecedor text,
  numero_fatura text,
  ficheiro text,                           -- caminho no bucket 'financas' ou URL do PDF
  origem text,                             -- gmail · manual · painel_ceo
  criado_em timestamptz not null default now(),
  unique (fornecedor, numero_fatura)
);
create index if not exists financas_despesas_data_idx on public.financas_despesas (data);
alter table public.financas_despesas enable row level security;

-- Um registo por mês fechado: o resumo e onde ficaram os ficheiros do dossier.
create table if not exists public.financas_fechos (
  mes text primary key,                    -- 'YYYY-MM'
  resumo jsonb not null,
  ficheiros text[] not null default '{}',
  gerado_em timestamptz not null default now()
);
alter table public.financas_fechos enable row level security;

-- 16/11/2026 Ricardo: sem regime de IVA (isenção do art. 53.º do CIVA). A entidade (ENI ou empresa)
-- fica por confirmar; até lá os avisos mostram IRS e IRC.
insert into public.site_settings (key, value)
values ('financas_regime', '{"iva":"isento"}'::jsonb)
on conflict (key) do nothing;
