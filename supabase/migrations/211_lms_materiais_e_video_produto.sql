-- 211 — MATERIAIS DAS SALAS + VÍDEO DE APRESENTAÇÃO DOS PRODUTOS
--
-- Pedido do dono: os vídeos de cada estratégia de trading vão viver numa sala de LMS própria
-- (lms_streams), como playlists do YouTube, e cada sala tem de mostrar também os documentos que
-- acompanham as aulas (os guias em PDF). E os produtos do marketplace passam a poder levar um vídeo
-- de apresentação.
--
--  1. `lms_stream_materiais` — os anexos de uma sala: PDF, vídeo (ou playlist) e link. Uma sala só
--     tem UMA playlist em `lms_streams.playlist_url`; não se redesenha isso. Quando uma estratégia
--     precisar de mais do que uma playlist, a segunda entra aqui como material `video` com o link
--     da playlist. Lidos pela rota que já lista as salas (/api/live-sessions/streams), sem pedido
--     a mais, e com o mesmo nível de acesso das gravações da sala.
--
--  2. `marketplace_produtos.video_url` — o vídeo PÚBLICO de apresentação (mp4 ou YouTube). Não
--     confundir com `conteudo_url`, que é o conteúdo pago e nunca sai na montra.
--
-- Aditiva e idempotente. NÃO APLICAR sem rever — e aplicar ANTES do deploy do código que a lê:
-- `video_url` entra nas colunas da montra e da gestão, e sem a coluna essas leituras falham.
--
-- Carga (Supabase frágil): os materiais leem-se numa só query indexada por (stream_id, ordem),
-- dentro do pedido que já existia.

begin;

-- ── 1. materiais de uma sala ─────────────────────────────────────────────────
create table if not exists public.lms_stream_materiais (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.lms_streams(id) on delete cascade,
  titulo text not null,
  descricao text,
  url text not null,
  -- 'pdf' (guia), 'video' (vídeo ou playlist do YouTube a mais) ou 'link' (qualquer outra coisa)
  tipo text not null check (tipo in ('pdf', 'video', 'link')),
  ordem int not null default 0,
  criado_em timestamptz default now()
);

-- A leitura é sempre «os materiais destas salas, por ordem».
create index if not exists lms_stream_materiais_stream_ordem_idx
  on public.lms_stream_materiais (stream_id, ordem);

-- Lidos e escritos só pelas rotas do servidor (chave de serviço), como `mtm_videos_intro`. Um PDF
-- de uma sala Premium não pode ficar à vista de quem tem a chave anon do bundle.
alter table public.lms_stream_materiais enable row level security;
revoke all on public.lms_stream_materiais from anon, authenticated;
grant all on public.lms_stream_materiais to service_role;

comment on table public.lms_stream_materiais is
  'Anexos de uma sala (PDF, vídeo/playlist extra, link). Lidos em /api/live-sessions/streams com o nível das gravações; escritos em /admin?tab=education.';

-- ── 2. vídeo de apresentação do produto ──────────────────────────────────────
alter table public.marketplace_produtos
  add column if not exists video_url text;

comment on column public.marketplace_produtos.video_url is
  'Vídeo PÚBLICO de apresentação (mp4 https ou YouTube), mostrado na ficha. Não é o conteúdo pago — esse é conteudo_url.';

commit;

-- O cliente JS do Supabase (service role) não vê tabelas novas sem isto.
notify pgrst, 'reload schema';
