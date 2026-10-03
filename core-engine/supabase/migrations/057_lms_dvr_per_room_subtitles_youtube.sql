-- 057 — DVR: uma gravação por SALA (stream) + legendas embutidas + connector YouTube
-- Nota: a tabela lms_dvr_jobs e as colunas lms_stream_captions.audio / lms_educators.fish_voice_id
-- foram aplicadas out-of-band em produção; este ficheiro documenta e alinha o schema DVR.

-- Uma gravação por sala em vez de por educador
alter table public.lms_dvr_jobs drop constraint if exists lms_dvr_jobs_educator_id_key;
create unique index if not exists lms_dvr_jobs_stream_id_key on public.lms_dvr_jobs(stream_id);

-- Legendas (WebVTT/SRT) e connector YouTube (upload não-listado -> playlist)
alter table public.lms_dvr_jobs
  add column if not exists subtitle_langs text[] default '{}',
  add column if not exists subtitle_files jsonb default '{}'::jsonb,   -- { lang: url }
  add column if not exists youtube_status text,                        -- pending | uploading | done | error
  add column if not exists youtube_video_id text,
  add column if not exists youtube_video_url text,
  add column if not exists youtube_playlist_id text,
  add column if not exists youtube_playlist_url text,
  add column if not exists youtube_error text;
