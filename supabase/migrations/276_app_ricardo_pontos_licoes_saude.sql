-- App do Ricardo: pontos no mapa criados pelo Ricardo (com lição), ligações de saúde e avatar.
-- Aplicada pelo MCP a 20/11/2026 (app_ricardo_pontos_licoes_saude_ligacoes + app_ricardo_membros_avatar).

alter table rg_app_pontos add column if not exists origem text default 'osm';
alter table rg_app_pontos add column if not exists area text;
alter table rg_app_pontos add column if not exists descricao text;
alter table rg_app_pontos add column if not exists licao_titulo text;
alter table rg_app_pontos add column if not exists licao_texto text;
alter table rg_app_pontos add column if not exists video_url text;
alter table rg_app_pontos add column if not exists xp_extra int default 0;
alter table rg_app_pontos add column if not exists raio_m int default 80;
alter table rg_app_pontos add column if not exists activo boolean default true;
alter table rg_app_pontos add column if not exists atualizado timestamptz default now();
create index if not exists rg_app_pontos_ricardo_idx on rg_app_pontos (origem) where origem = 'ricardo';

create table if not exists rg_app_saude_ligacoes (
  membro_id uuid not null,
  fonte text not null,
  token text,
  refresh text,
  expira timestamptz,
  externo_id text,
  ultimo_sync timestamptz,
  criado timestamptz default now(),
  primary key (membro_id, fonte)
);
alter table rg_app_saude_ligacoes enable row level security;

alter table rg_app_membros add column if not exists avatar jsonb;

-- Notificações push da app Missão (aplicada pelo MCP: app_ricardo_push).
create table if not exists rg_app_push (
  token text primary key,
  membro_id uuid not null,
  criado timestamptz default now(),
  visto timestamptz default now()
);
create index if not exists rg_app_push_membro_idx on rg_app_push (membro_id);
alter table rg_app_push enable row level security;
alter table rg_app_membros add column if not exists push_prefs jsonb default '{"missao":true,"chat":true,"serie":true}'::jsonb;

-- Plano de 39 dias: dia 1 do plano de cada membro (vazio = data de entrada). Aplicada pelo MCP: app_ricardo_plano39.
alter table rg_app_membros add column if not exists plano_inicio date;

-- Mentor IA da app (conversa + notas internas). Aplicada pelo MCP: app_ricardo_mentor.
create table if not exists rg_app_mentor (
  id bigint generated always as identity primary key,
  membro_id uuid not null,
  papel text not null check (papel in ('user','assistant','nota')),
  texto text not null,
  dados jsonb,
  criado timestamptz not null default now()
);
create index if not exists rg_app_mentor_membro_idx on rg_app_mentor (membro_id, criado desc);
alter table rg_app_mentor enable row level security;
