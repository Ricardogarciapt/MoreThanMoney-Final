-- 100 — SALA «INTRODUÇÃO» + VÍDEOS «APRENDE A USAR …»
--
-- Duas coisas, com a mesma raiz: quem chega não sabe usar o que comprou.
--
--  1. Uma sala de LMS que NÃO é uma sala ao vivo. Não tem educador, não tem horário e nunca
--     aparece «em direto» em lado nenhum — nem no lobby, nem na app, nem nas notificações. Serve
--     para (a) mostrar a playlist «Como usar a MoreThanMoney» e (b) receber um ingest de OBS do
--     dono, cuja gravação segue o caminho normal do DVR e sobe ao YouTube para uma playlist
--     PRÓPRIA, «MTM Introdução» — separada da playlist do curso que os alunos veem.
--
--  2. Uma tabela de vídeos de introdução por DESTINO do site (scanner ao vivo, portefólios,
--     Terminal MTM, …). Cada destino pode ter um link (YouTube ou HLS do nosso DVR) e um
--     interruptor; quando ligado, esse destino mostra o botão «Aprende a usar …».
--
-- Aditiva e idempotente. NÃO APLICAR sem rever — em particular o ponto 1, que relaxa um NOT NULL.
--
-- Carga (Supabase frágil): nada aqui é escrito por render. A configuração dos vídeos muda
-- raríssimas vezes e é lida por uma query indexada, em cache no servidor.

begin;

-- ── 1. a sala pode não ter educador ──────────────────────────────────────────
-- A sala «Introdução» é da casa: não há ninguém a dar a aula, há uma playlist. O código que lê
-- salas já trata o educador como opcional (`stream.educator?.…`), por isso o NOT NULL era a única
-- coisa a impedir isto.
alter table public.lms_streams alter column educator_id drop not null;

-- ── 2. colunas novas da sala ─────────────────────────────────────────────────
alter table public.lms_streams
  -- Nome de sistema: é assim que o código encontra esta sala sem depender do título, que o Ricardo
  -- pode reescrever no admin a qualquer momento.
  add column if not exists chave_sistema text,
  -- Trava dura: esta sala nunca fica `is_live = true`. Aplicada nas TRÊS rotas que ligam uma sala
  -- (admin, presença do educador, WHIP) e reforçada na leitura pública. Assim a base de dados nunca
  -- chega a conter o estado «ao vivo», o que protege também a app iOS nativa, que lê a tabela
  -- diretamente e não passa pelas nossas rotas.
  add column if not exists nunca_ao_vivo boolean not null default false,
  -- Para onde vão as GRAVAÇÕES desta sala no YouTube. Distinto de `playlist_url`/`playlist_title`,
  -- que é o curso que os alunos veem na sala. Sem isto, as gravações da sala de introdução
  -- entravam na própria playlist do curso e misturavam as duas coisas.
  add column if not exists dvr_playlist_title text,
  add column if not exists dvr_playlist_url text,
  -- Garantias de que a sala aparece com capa mesmo quando ninguém carregou imagem.
  add column if not exists square_image_url text,
  add column if not exists playlist_url text,
  add column if not exists playlist_title text,
  add column if not exists playlist_access_tier text;

create unique index if not exists lms_streams_chave_sistema_idx
  on public.lms_streams (chave_sistema) where chave_sistema is not null;

-- Leitura barata das salas que nunca vão ao ar (o lobby filtra por aqui).
create index if not exists lms_streams_nunca_ao_vivo_idx
  on public.lms_streams (nunca_ao_vivo) where nunca_ao_vivo;

comment on column public.lms_streams.chave_sistema is
  'Nome estável para o código encontrar salas da casa (ex.: introducao). Null nas salas normais.';
comment on column public.lms_streams.nunca_ao_vivo is
  'Sala que nunca pode ficar is_live=true (introdução/gravação). Ver lib/lms-sala-introducao.ts.';
comment on column public.lms_streams.dvr_playlist_title is
  'Playlist do YouTube que recebe as GRAVAÇÕES desta sala. Vazio = comportamento antigo (playlist_url da sala ou título gerado).';

-- ── 3. a sala «Introdução» ───────────────────────────────────────────────────
-- Criada aqui para o Ricardo só ter de colar o link da playlist no admin. A academia é a primeira
-- que existir (a sala não é de nenhuma em especial; o admin pode mudá-la).
--
-- ⚠️ CAPA: a imagem é a constante CAPA_SALA_INTRODUCAO em lib/lms-sala-introducao.ts, que aponta
-- para o Supabase Storage (bucket lms-assets, salas/introducao-capa.png). Para trocar a capa:
-- substituir o ficheiro nesse caminho, OU carregar outra imagem no campo da sala em
-- /admin?tab=education. Num sítio só, em qualquer dos casos.
insert into public.lms_streams (
  academy_id, educator_id, title, description,
  thumbnail_url, square_image_url,
  chave_sistema, nunca_ao_vivo, chat_enabled, is_live,
  access_tier, playlist_title, playlist_access_tier,
  dvr_playlist_title,
  stream_key, category
)
select
  (select id from public.lms_academies order by created_at asc limit 1),
  null,
  'Introdução',
  'Como usar a MoreThanMoney — o percurso de quem acabou de entrar, do início ao fim.',
  'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/lms-assets/salas/introducao-capa.png',
  'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/lms-assets/salas/introducao-capa.png',
  'introducao',
  true,
  false,
  false,
  'free',
  'Como usar a MoreThanMoney',
  'free',
  'MTM Introdução',
  'mtm_introducao_' || encode(gen_random_bytes(12), 'hex'),
  'iniciante'
where not exists (select 1 from public.lms_streams where chave_sistema = 'introducao')
  and exists (select 1 from public.lms_academies);

-- ── 4. vídeos «Aprende a usar …» por destino ─────────────────────────────────
-- Uma linha por destino do site. O `destino` é o id do registo de navegação (lib/navegacao.ts),
-- não um caminho — os caminhos mudam, os ids não.
create table if not exists public.mtm_videos_intro (
  destino text primary key,
  -- 'youtube' (vídeo), 'playlist' (playlist do YouTube) ou 'hls' (gravação nossa / DVR)
  tipo text not null check (tipo in ('youtube', 'playlist', 'hls')),
  url text not null,
  -- Como o botão se apresenta nesse destino: «Aprende a usar o nosso scanner ao vivo». Vazio =
  -- usa o rótulo do registo de navegação.
  rotulo text,
  ativo boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- A leitura do site é sempre «dá-me os ativos»: índice parcial, minúsculo.
create index if not exists mtm_videos_intro_ativo_idx
  on public.mtm_videos_intro (destino) where ativo;

alter table public.mtm_videos_intro enable row level security;
revoke all on public.mtm_videos_intro from anon, authenticated;
grant all on public.mtm_videos_intro to service_role;

comment on table public.mtm_videos_intro is
  'Vídeo de introdução por destino do site. Lido por lib/videos-intro.ts (cache 5 min), escrito em /admin?tab=content.';

commit;

-- O cliente JS do Supabase (service role) não vê tabelas novas sem isto.
notify pgrst, 'reload schema';
