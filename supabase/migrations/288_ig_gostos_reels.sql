-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- GOSTOS DOS REELS PARA CONTACTO MANUAL (24/11/2026).
--
-- A Graph API não devolve quem gostou de um reel. A lista é recolhida à mão, no Chrome do Mac do
-- Ricardo, e fica aqui: uma linha por (reel, pessoa). O contacto é SEMPRE feito por ele, com um
-- clique que abre o perfil ou a DM no Instagram. Nenhuma DM nem follow automático a estes gostos.
--
-- Quem já comentou está em `ig_leads` e é tratado pelo setter; o painel esconde-o aqui.
-- Só o servidor (service role) lê e escreve: sem políticas RLS para clientes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists ig_gostos (
  id           bigserial primary key,
  media_code   text        not null,                 -- shortcode do reel, ex.: DgGlTVJxOFs
  media_url    text,
  utilizador   text        not null,                 -- @ do Instagram de quem gostou (sem @)
  nome         text,
  estado       text        not null default 'novo'
               check (estado in ('novo', 'contactado', 'respondeu', 'sem_interesse')),
  recolhido_em timestamptz not null default now(),
  estado_em    timestamptz,
  unique (media_code, utilizador)
);

create index if not exists ig_gostos_media_estado_idx on ig_gostos (media_code, estado);

alter table ig_gostos enable row level security;
