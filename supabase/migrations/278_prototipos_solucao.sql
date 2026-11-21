-- «Receber o protótipo da minha solução» (/solucoes, 21/11/2026).
-- O negócio pede, a IA grátis escreve o protótipo na hora, ele marca a reunião e a demo real com a
-- marca dele (kits do Monorepo) segue nas 24 h a seguir à reunião (prazo_demo).
create table if not exists public.prototipos_solucao (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  nome text not null,
  email text not null,
  telefone text,
  empresa text not null,
  sector text not null,
  solucoes text[] not null default '{}',
  cor text,
  spec jsonb not null,
  ia_fornecedor text,
  ip_hash text,
  proposta text,
  estado text not null default 'gerado' check (estado in ('gerado', 'reuniao_marcada', 'demo_entregue', 'arquivado')),
  marcacao_id uuid,
  negocio_id uuid,
  reuniao_em timestamptz,
  prazo_demo timestamptz,
  demo_url text
);

create index if not exists prototipos_solucao_ip_idx on public.prototipos_solucao (ip_hash, criado_em desc);
create index if not exists prototipos_solucao_prazo_idx on public.prototipos_solucao (estado, prazo_demo);
create index if not exists prototipos_solucao_email_idx on public.prototipos_solucao (lower(email));

-- Só o servidor (service role) lê e escreve: o protótipo tem o contacto do negócio.
alter table public.prototipos_solucao enable row level security;
revoke all on public.prototipos_solucao from anon, authenticated;
