-- 265 · Motor de ativos MTM (17/11/2026): fila de gerações de imagem/vídeo/voz/clone a falar.
-- O worker numa máquina com GPU (services/motor-ativos) reclama os pedidos por /api/estudio/motor/geracao
-- e grava cada saída como um ativo novo em estudio_ativos (bucket privado `estudio`, pasta ativos/ia/).

create table if not exists public.estudio_geracoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cena', 'angulo', 'mover', 'voz', 'falar')),
  estado text not null default 'fila' check (estado in ('fila', 'a_gerar', 'pronto', 'erro', 'cancelado')),
  params jsonb not null default '{}'::jsonb,
  ativo_id uuid references public.estudio_ativos(id) on delete set null,
  audio_ativo_id uuid references public.estudio_ativos(id) on delete set null,
  saida_ativo_id uuid references public.estudio_ativos(id) on delete set null,
  saida_caminho text,
  ensaio boolean not null default false,
  origem text not null default 'estudio',
  pedido_por uuid,
  motor text,
  tentativas int not null default 0,
  erro text,
  segundos_gpu numeric,
  reclamado_em timestamptz,
  terminado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists estudio_geracoes_fila_idx on public.estudio_geracoes (estado, criado_em);
create index if not exists estudio_geracoes_recentes_idx on public.estudio_geracoes (criado_em desc);
alter table public.estudio_geracoes enable row level security;

-- Pulso de cada máquina do motor (para o /estudio e os reels saberem se há GPU ligada).
create table if not exists public.estudio_motores (
  nome text primary key,
  visto_em timestamptz not null default now(),
  gpu text,
  versao text,
  capacidades text[] not null default '{}'
);
alter table public.estudio_motores enable row level security;

-- Os ativos gerados por pedidos de servidor (reels diários) não têm pessoa por trás.
alter table public.estudio_ativos alter column user_id drop not null;
