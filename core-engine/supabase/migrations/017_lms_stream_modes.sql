alter table public.lms_streams
  add column if not exists playback_mode text not null default 'youtube_first',
  add column if not exists ingest_provider text not null default 'restream';

alter table public.lms_streams
  drop constraint if exists lms_streams_playback_mode_check;

alter table public.lms_streams
  add constraint lms_streams_playback_mode_check
  check (playback_mode in ('youtube_first', 'hls_first', 'auto'));

alter table public.lms_streams
  drop constraint if exists lms_streams_ingest_provider_check;

alter table public.lms_streams
  add constraint lms_streams_ingest_provider_check
  check (ingest_provider in ('restream', 'mtm_direct'));
