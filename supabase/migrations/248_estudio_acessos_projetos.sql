-- 248 · Estúdio para a equipa + editor de vídeo.
-- estudio_acessos: quem (sem ser admin) entra no /estudio e em que separadores. Dado no backoffice
-- (Gestão → Estúdio). Áreas: gravar, criar, ativos, editor, cortes. Vazio = sem acesso.
create table if not exists public.estudio_acessos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  areas text[] not null default '{}',
  nota text,
  definido_por uuid,
  atualizado_em timestamptz not null default now()
);
alter table public.estudio_acessos enable row level security;

-- estudio_projetos: projectos do editor (timeline). O Mac monta o MP4 a partir do `projeto` (jsonb):
-- { formato, clips[], textos[], musica, filtro, legendas, marca_agua }.
create table if not exists public.estudio_projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null default 'Projecto sem título',
  marca text not null default 'morethanmoney',
  projeto jsonb not null default '{}'::jsonb,
  estado text not null default 'rascunho' check (estado in ('rascunho', 'a_render', 'a_montar', 'pronto', 'erro')),
  video_url text,
  erro text,
  reclamado_em timestamptz,
  post_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists estudio_projetos_estado_idx on public.estudio_projetos (estado, atualizado_em);
alter table public.estudio_projetos enable row level security;
