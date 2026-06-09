-- Restream.io: OBS → Restream → site reproduz via iframe (embed) ou continua HLS próprio.
-- Chave de ingestão Restream é sensível; embed URL é pública para o player.

alter table public.lms_educators
  add column if not exists restream_enabled boolean not null default false,
  add column if not exists restream_ingest_url text,
  add column if not exists restream_stream_key text,
  add column if not exists restream_embed_url text;

comment on column public.lms_educators.restream_ingest_url is 'URL RTMP/RTMPS do Restream (ex. rtmp://live.restream.io/live), sem chave.';
comment on column public.lms_educators.restream_stream_key is 'Chave de stream Restream (OBS) — não expor em APIs públicas.';
comment on column public.lms_educators.restream_embed_url is 'URL do player/embed Restream para alunos (iframe no site).';

alter table public.lms_streams
  add column if not exists restream_embed_url text;

comment on column public.lms_streams.restream_embed_url is 'Override do embed por canal; se vazio, usa o embed do educador quando restream_enabled.';
