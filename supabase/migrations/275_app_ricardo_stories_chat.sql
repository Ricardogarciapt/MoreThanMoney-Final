-- App do Ricardo, fase 4 (20/11/2026, pedido do Ricardo): stories de 24 h e chat da comunidade,
-- com as ideias do chat da app MTM (respostas, imagens, reações, patentes ao lado do nome, apagar).
-- Tudo pelo servidor (service role); RLS ligado sem políticas, como nas tabelas da 270 e 274.
create table if not exists rg_app_stories (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  imagem_path text, texto text, fundo text,
  criado timestamptz not null default now(),
  expira timestamptz not null default now() + interval '24 hours',
  oculta boolean not null default false, denuncias int not null default 0
);
create index if not exists rg_app_stories_expira on rg_app_stories (expira desc) where not oculta;
create table if not exists rg_app_stories_vistas (
  story_id uuid not null references rg_app_stories(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  reacao text, criado timestamptz not null default now(),
  primary key (story_id, membro_id)
);
create table if not exists rg_app_chat (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  texto text, imagem_path text,
  resposta_a uuid references rg_app_chat(id) on delete set null,
  apagado boolean not null default false, denuncias int not null default 0,
  criado timestamptz not null default now()
);
create index if not exists rg_app_chat_criado on rg_app_chat (criado desc);
create table if not exists rg_app_chat_reacoes (
  mensagem_id uuid not null references rg_app_chat(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  emoji text not null, criado timestamptz not null default now(),
  primary key (mensagem_id, membro_id, emoji)
);
create table if not exists rg_app_denuncias (
  id bigserial primary key, alvo text not null, alvo_id uuid not null,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  motivo text, criado timestamptz not null default now(), unique (alvo, alvo_id, membro_id)
);
alter table rg_app_stories enable row level security;
alter table rg_app_stories_vistas enable row level security;
alter table rg_app_chat enable row level security;
alter table rg_app_chat_reacoes enable row level security;
alter table rg_app_denuncias enable row level security;
-- Fotos das stories e do chat: bucket privado, servidas por links assinados de 1 h.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rg-app-media', 'rg-app-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
