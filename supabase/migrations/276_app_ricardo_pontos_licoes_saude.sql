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
