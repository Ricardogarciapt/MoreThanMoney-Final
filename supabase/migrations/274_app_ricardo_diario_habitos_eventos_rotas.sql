-- App do Ricardo, fase 3 (20/11/2026, pedido do Ricardo):
-- curiosidade e quiz diários, hábitos, presença com comprovativo, desafios/eventos do admin
-- com pré-venda, e rotas com pontos seguros (geotag) que dão uma lição ao chegar.
-- Tudo só pelo servidor (service role); RLS ligado sem políticas, como nas tabelas da 270.

-- Banco de conteúdo diário: 'curiosidade' (365 a rodar) e 'quiz' (pergunta de escolha múltipla).
create table if not exists rg_app_conteudo (
  id bigserial primary key,
  tipo text not null check (tipo in ('curiosidade', 'quiz', 'dica')),
  categoria text not null default 'geral',
  titulo text,
  texto text,
  ano int,
  pergunta text,
  opcoes jsonb,
  correta int,
  explicacao text,
  ordem int not null default 0,
  activo boolean not null default true,
  criado timestamptz not null default now()
);
create index if not exists rg_app_conteudo_tipo on rg_app_conteudo (tipo, activo, ordem, id);

-- O que cada membro fez no dia fora das missões: curiosidade lida, quiz, presença, ponto da rota.
create table if not exists rg_app_diarios (
  id bigserial primary key,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  dia date not null,
  item text not null,               -- 'curiosidade' | 'quiz' | 'presenca' | 'rota:<ponto>'
  ref text,
  xp int not null default 0,
  dados jsonb,
  prova_path text,                  -- caminho no bucket rg-app-provas (presença)
  criado timestamptz not null default now(),
  unique (membro_id, dia, item)
);

-- Hábitos que o membro escolhe; cada um marcado uma vez por dia.
create table if not exists rg_app_habitos (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  nome text not null,
  icone text not null default '✓',
  ordem int not null default 0,
  activo boolean not null default true,
  criado timestamptz not null default now()
);
create index if not exists rg_app_habitos_membro on rg_app_habitos (membro_id, activo);
create table if not exists rg_app_habitos_feitos (
  habito_id uuid not null references rg_app_habitos(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  dia date not null,
  xp int not null default 0,
  criado timestamptz not null default now(),
  primary key (habito_id, dia)
);

-- Desafios e eventos que o Ricardo (admin) publica; eventos podem ter pré-venda.
create table if not exists rg_app_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'evento' check (tipo in ('desafio', 'evento')),
  titulo text not null,
  descricao text,
  quando timestamptz,
  local text,
  imagem_url text,
  preco_eur numeric(10,2),
  preco_antes_eur numeric(10,2),
  link_compra text,
  vagas int,
  xp int not null default 0,       -- desafios: XP ao concluir
  activo boolean not null default true,
  ordem int not null default 0,
  criado timestamptz not null default now()
);
create table if not exists rg_app_eventos_membros (
  evento_id uuid not null references rg_app_eventos(id) on delete cascade,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  estado text not null default 'interesse' check (estado in ('interesse', 'reservado', 'concluido')),
  resposta text,
  criado timestamptz not null default now(),
  primary key (evento_id, membro_id)
);

-- Pontos das rotas (geotag): só sítios públicos e seguros, verificados pelo servidor.
create table if not exists rg_app_pontos (
  id text primary key,              -- id estável (ex.: osm:node/123)
  nome text not null,
  tipo text not null,               -- parque, praça, biblioteca, miradouro, museu, jardim
  lat double precision not null,
  lon double precision not null,
  criado timestamptz not null default now()
);

alter table rg_app_conteudo enable row level security;
alter table rg_app_diarios enable row level security;
alter table rg_app_habitos enable row level security;
alter table rg_app_habitos_feitos enable row level security;
alter table rg_app_eventos enable row level security;
alter table rg_app_eventos_membros enable row level security;
alter table rg_app_pontos enable row level security;

-- Comprovativos da presença (prints): bucket privado, só o servidor lê e escreve.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rg-app-provas', 'rg-app-provas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Missões: novo tipo diário 'produtividade' (a 4.ª missão do dia).
alter table rg_app_missoes drop constraint if exists rg_app_missoes_tipo_check;
alter table rg_app_missoes add constraint rg_app_missoes_tipo_check check (tipo in ('treino', 'mindset', 'digital', 'produtividade'));

-- Dicas das rotas (uma por ponto visitado, da área que o membro escolheu). Aplicado à parte a 20/11.
alter table rg_app_conteudo drop constraint if exists rg_app_conteudo_tipo_check;
alter table rg_app_conteudo add constraint rg_app_conteudo_tipo_check check (tipo in ('curiosidade', 'quiz', 'dica'));
