-- Redes novas (16/11/2026): TikTok, YouTube Shorts e LinkedIn, ligadas por OAuth a partir de
-- /admin/redes. Os reels que saem no Instagram da marca voltam a sair nestas redes, sozinhos.
-- Os tokens vivem SÓ aqui (RLS ligado e sem políticas: só a service role lê). Nunca em código.

create table if not exists public.redes_contas (
  id uuid primary key default gen_random_uuid(),
  rede text not null check (rede in ('tiktok', 'youtube', 'linkedin')),
  marca text not null check (marca in ('morethanmoney', 'ricardo-garcia')),
  nome text,
  conta_externa_id text,
  access_token text,
  refresh_token text,
  expira_em timestamptz,
  refresh_expira_em timestamptz,
  escopos text,
  ativa boolean not null default true,
  nota text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (rede, marca)
);
alter table public.redes_contas enable row level security;

create table if not exists public.redes_publicacoes (
  id uuid primary key default gen_random_uuid(),
  origem_id uuid references public.social_scheduled_posts(id) on delete set null,
  conta_id uuid not null references public.redes_contas(id) on delete cascade,
  video_url text not null,
  legenda text not null default '',
  estado text not null default 'na_fila' check (estado in ('na_fila', 'a_publicar', 'publicado', 'erro')),
  id_externo text,
  url text,
  nota text,
  erro text,
  tentativas int not null default 0,
  publicar_em timestamptz not null default now(),
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (origem_id, conta_id)
);
create index if not exists redes_publicacoes_fila_idx on public.redes_publicacoes (estado, publicar_em);
alter table public.redes_publicacoes enable row level security;

-- Interruptor por marca: a MTM espelha já; a conta pessoal fica desligada até o Ricardo dizer.
insert into public.site_settings (key, value)
select 'redes_espelho', '{"morethanmoney": true, "ricardo-garcia": false}'::jsonb
where not exists (select 1 from public.site_settings where key = 'redes_espelho');
