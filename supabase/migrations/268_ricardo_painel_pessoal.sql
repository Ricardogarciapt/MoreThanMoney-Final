-- 268 · Painel pessoal do Ricardo (/ricardogarcia/painel) — 20/11/2026
-- Tudo o que estava no Beacons passa a viver aqui: secções e links da landing, produtos
-- (ligados ao marketplace ou só da landing), contactos do formulário e o dia-a-dia do Ricardo
-- (tarefas, metas, hábitos, diário). Só o servidor (service role) lê e escreve: RLS ligada, sem políticas.

create table if not exists public.rg_pagina (
  id int primary key default 1 check (id = 1),
  seccoes jsonb not null default '[]'::jsonb,
  atualizado timestamptz not null default now()
);

create table if not exists public.rg_produtos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 1 and 140),
  subtitulo text,
  descricao text,
  preco_cents int check (preco_cents is null or preco_cents >= 0),
  imagem_url text,
  marketplace_slug text,          -- se preenchido, compra pelo checkout do marketplace MTM
  url text,                       -- senão, link de compra próprio
  so_landing boolean not null default true,
  activo boolean not null default true,
  ordem int not null default 0,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now()
);

create table if not exists public.rg_contactos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 1 and 120),
  email text,
  telefone text,
  motivo text not null default 'conversa',
  mensagem text check (mensagem is null or length(mensagem) <= 2000),
  estado text not null default 'novo' check (estado in ('novo','respondido','agendado','cliente','arquivado')),
  origem text,
  criado timestamptz not null default now()
);
create index if not exists rg_contactos_criado on public.rg_contactos (criado desc);

create table if not exists public.rg_dados (
  k text primary key check (length(k) <= 80),
  v jsonb not null,
  atualizado timestamptz not null default now()
);

alter table public.rg_pagina enable row level security;
alter table public.rg_produtos enable row level security;
alter table public.rg_contactos enable row level security;
alter table public.rg_dados enable row level security;

-- 269 (aplicada à parte): cliques e visitas para medir conversões, como no Beacons.
create table if not exists public.rg_cliques (
  id bigserial primary key,
  alvo text not null check (length(alvo) <= 80),
  tipo text not null default 'link' check (tipo in ('link','produto','contacto','visita','video')),
  origem text check (origem is null or length(origem) <= 120),
  criado timestamptz not null default now()
);
create index if not exists rg_cliques_alvo_criado on public.rg_cliques (alvo, criado desc);
create index if not exists rg_cliques_criado on public.rg_cliques (criado desc);
alter table public.rg_cliques enable row level security;
