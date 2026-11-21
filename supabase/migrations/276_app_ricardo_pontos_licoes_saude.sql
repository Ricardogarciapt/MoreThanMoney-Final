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

-- Diário livre e desafios criados pelos membros (app Missão)
create table if not exists rg_app_diario_livre (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  dia date not null default current_date,
  titulo text,
  texto text not null,
  humor smallint check (humor between 1 and 5),
  criado timestamptz not null default now()
);
create index if not exists rg_app_diario_livre_m on rg_app_diario_livre (membro_id, criado desc);
alter table rg_app_diario_livre enable row level security;
create table if not exists rg_app_desafios_m (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references rg_app_membros(id) on delete cascade,
  titulo text not null,
  descricao text,
  dias smallint not null check (dias in (3,7,14,30)),
  publico boolean not null default true,
  denuncias int not null default 0,
  oculto boolean not null default false,
  criado timestamptz not null default now()
);
create index if not exists rg_app_desafios_m_pub on rg_app_desafios_m (publico, oculto, criado desc);
alter table rg_app_desafios_m enable row level security;
create table if not exists rg_app_desafios_m_adesoes (
  desafio_id uuid not null references rg_app_desafios_m(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  inicio date not null default current_date,
  checkins int not null default 0,
  ultimo date,
  concluido timestamptz,
  primary key (desafio_id, membro_id)
);
create index if not exists rg_app_desafios_m_adesoes_m on rg_app_desafios_m_adesoes (membro_id);
alter table rg_app_desafios_m_adesoes enable row level security;

-- RPG «Operação Liberdade» (app Missão): fichas, escape rooms rotativos e mesas de jogo
create table if not exists rg_app_rpg_fichas (
  membro_id uuid primary key references rg_app_membros(id) on delete cascade,
  nome text not null, classe text not null, origem text not null,
  equipados text[] not null default '{}', capitulo int not null default 1, cena text,
  capitulos_feitos int[] not null default '{}', talento_usado int, diario jsonb not null default '[]',
  criado timestamptz not null default now()
);
alter table rg_app_rpg_fichas enable row level security;
create table if not exists rg_app_rpg_escape (
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  sala_id text not null, ciclo text not null, inicio timestamptz not null default now(),
  resolvidos int[] not null default '{}', pistas int[] not null default '{}',
  fim timestamptz, segundos int, xp int,
  primary key (membro_id, sala_id, ciclo)
);
create index if not exists rg_app_rpg_escape_rank on rg_app_rpg_escape (sala_id, ciclo, segundos) where fim is not null;
alter table rg_app_rpg_escape enable row level security;
create table if not exists rg_app_rpg_mesas (
  id uuid primary key default gen_random_uuid(),
  mestre_id uuid not null references rg_app_membros(id) on delete cascade,
  nome text not null, codigo text not null unique, descricao text,
  publica boolean not null default true, maximo int not null default 6 check (maximo between 2 and 8),
  cena jsonb, fechada boolean not null default false,
  criado timestamptz not null default now(), actividade timestamptz not null default now()
);
create index if not exists rg_app_rpg_mesas_pub on rg_app_rpg_mesas (publica, fechada, actividade desc);
alter table rg_app_rpg_mesas enable row level security;
create table if not exists rg_app_rpg_mesa_membros (
  mesa_id uuid not null references rg_app_rpg_mesas(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  entrou timestamptz not null default now(),
  primary key (mesa_id, membro_id)
);
create index if not exists rg_app_rpg_mesa_membros_m on rg_app_rpg_mesa_membros (membro_id);
alter table rg_app_rpg_mesa_membros enable row level security;
create table if not exists rg_app_rpg_mesa_log (
  id bigserial primary key,
  mesa_id uuid not null references rg_app_rpg_mesas(id) on delete cascade,
  membro_id uuid references rg_app_membros(id) on delete set null,
  tipo text not null check (tipo in ('msg','dado','cena','xp','sistema')),
  texto text, dados jsonb, criado timestamptz not null default now()
);
create index if not exists rg_app_rpg_mesa_log_m on rg_app_rpg_mesa_log (mesa_id, id desc);
alter table rg_app_rpg_mesa_log enable row level security;
